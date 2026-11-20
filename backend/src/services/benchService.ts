import { prisma } from "../prisma";
import { writeAudit } from "../utils/audit";
import { deriveDefaultSubCategory } from "../utils/resourcePresentation";
import { deliverEmail } from "../routes/notifications";

const DEFAULT_COMMITTED_WINDOW_DAYS = 14;
const DEFAULT_TRUE_BENCH_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function getBenchConfig(portfolioId: string) {
  const specific = await prisma.benchConfig.findUnique({ where: { portfolioId } });
  if (specific) return specific;
  const global = await prisma.benchConfig.findFirst({ where: { portfolioId: null } });
  if (global) return global;
  return { committedWindowDays: DEFAULT_COMMITTED_WINDOW_DAYS, trueBenchAgingThresholdDays: DEFAULT_TRUE_BENCH_THRESHOLD_DAYS };
}

/**
 * FR-4.1 / FR-4.2: move a resource that has no current active allocation to Bench,
 * classifying it as Committed (a SCHEDULED allocation starts within the configurable
 * window) or True Bench (nothing scheduled).
 */
export async function reclassifyResourceBenchStatus(resourceId: string, actorId?: string | null) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource || resource.status === "TERMINATED" || resource.status === "ON_ML") return;

  const activeAllocation = await prisma.allocation.findFirst({
    where: { resourceId, status: "ACTIVE" },
  });
  if (activeAllocation) return; // still allocated, nothing to do

  const config = await getBenchConfig(resource.portfolioId);

  const nextScheduled = await prisma.allocation.findFirst({
    where: { resourceId, status: "SCHEDULED" },
    orderBy: { startDate: "asc" },
  });

  const now = new Date();
  const before = { status: resource.status, benchSince: resource.benchSince };
  let newStatus: "BENCH_COMMITTED" | "BENCH_TRUE";

  if (nextScheduled) {
    const daysUntilStart = (nextScheduled.startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    newStatus = daysUntilStart <= config.committedWindowDays ? "BENCH_COMMITTED" : "BENCH_TRUE";
  } else {
    newStatus = "BENCH_TRUE";
  }

  const benchSince = resource.status === "BENCH_COMMITTED" || resource.status === "BENCH_TRUE" ? resource.benchSince ?? now : now;

  const updated = await prisma.resource.update({
    where: { id: resourceId },
    data: { status: newStatus, benchSince, subCategory: deriveDefaultSubCategory({ status: newStatus, subCategory: resource.subCategory }) },
  });

  await writeAudit({
    actorId: actorId ?? null,
    action: "BENCH_RECLASSIFY",
    entityType: "Resource",
    entityId: resourceId,
    portfolioId: resource.portfolioId,
    before,
    after: { status: updated.status, benchSince: updated.benchSince },
  });
}

/** FR-4.3 / FR-11.3: alert RMG (and TA) when a resource ages on True Bench past threshold. */
export async function runBenchAgingAlerts() {
  const trueBenchResources = await prisma.resource.findMany({
    where: { status: "BENCH_TRUE", benchSince: { not: null } },
  });

  const rmgUsers = await prisma.user.findMany({ where: { role: "RMG", active: true } });
  const taUsers = await prisma.user.findMany({ where: { role: "TA", active: true } });

  const now = new Date();
  for (const resource of trueBenchResources) {
    const config = await getBenchConfig(resource.portfolioId);
    const daysOnBench = (now.getTime() - resource.benchSince!.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOnBench < config.trueBenchAgingThresholdDays) continue;

    const alreadyNotifiedToday = await prisma.notification.findFirst({
      where: {
        type: "BENCH_AGING",
        relatedEntityId: resource.id,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    if (alreadyNotifiedToday) continue;

    const message = `${resource.name} (${resource.employeeId}) has been on True Bench for ${Math.floor(daysOnBench)} days, exceeding the ${config.trueBenchAgingThresholdDays}-day threshold.`;
    const rule = await prisma.notificationRule.findUnique({ where: { key: "BENCH_AGEING" } });
    if (rule?.enabled === false) continue;

    for (const user of [...rmgUsers, ...taUsers]) {
      const notification = await prisma.notification.create({
        data: {
          userId: user.id,
          type: "BENCH_AGING",
          message,
          relatedEntityType: "Resource",
          relatedEntityId: resource.id,
        },
      });
      await deliverEmail("BENCH_AGEING", user.email, `${resource.name} has been on bench for ${Math.floor(daysOnBench)} days`, message, notification.id);
    }
  }
}

export async function runUpcomingBenchNotices(now = new Date()) {
  const rule = await prisma.notificationRule.findUnique({ where: { key: "ADVANCE_BENCH_NOTICE" } });
  if (rule?.enabled === false) return;

  const recipientGroups = (rule?.recipients ?? ["Employee", "Delivery Leader", "PMO"]).map((recipient) => recipient.toLocaleLowerCase());
  const includeDeliveryLeaders = recipientGroups.length === 0 || recipientGroups.some((recipient) => ["delivery leader", "delivery team"].includes(recipient));
  const includePmo = recipientGroups.length === 0 || recipientGroups.some((recipient) => ["pmo", "rmg team", "rmg leader"].includes(recipient));
  const portfolioLeaders = includeDeliveryLeaders || includePmo
    ? await prisma.user.findMany({
      where: { active: true, role: { in: ["DELIVERY", "RMG"] } },
      select: { email: true, role: true, portfolioAuthorizations: { where: { isActive: true }, select: { portfolioId: true } } },
    })
    : [];
  const resources = await prisma.resource.findMany({
    where: { status: "ALLOCATED", allocations: { some: { status: "ACTIVE", endDate: { not: null } } } },
    include: {
      allocations: {
        where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
        include: { project: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      },
    },
  });

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayKey = new Date(today).toISOString().slice(0, 10);
  for (const resource of resources) {
    if (resource.allocations.length !== 1) continue;
    const allocation = resource.allocations[0];
    if (allocation.status !== "ACTIVE" || !allocation.endDate) continue;

    const benchDate = Date.UTC(allocation.endDate.getUTCFullYear(), allocation.endDate.getUTCMonth(), allocation.endDate.getUTCDate() + 1);
    const daysUntilBench = Math.round((benchDate - today) / MS_PER_DAY);
    if (daysUntilBench < 1 || daysUntilBench > 60) continue;
    const isDailyNotice = daysUntilBench <= 30;
    const deliveryDate = new Date(benchDate).toISOString().slice(0, 10);
    const noticeId = `${resource.id}:${deliveryDate}:${isDailyNotice ? `daily:${todayKey}` : "60-day"}`;
    const alreadySent = await prisma.notificationEmailLog.findFirst({
      where: { ruleKey: "ADVANCE_BENCH_NOTICE", notificationId: noticeId, status: "SENT" },
      select: { id: true },
    });
    if (alreadySent) continue;
    if (!resource.email?.trim()) {
      console.warn(`[scheduler] advance bench notice skipped for ${resource.employeeId}: employee email is missing`);
      continue;
    }

    const cc = [...new Set(portfolioLeaders
      .filter((user) => (user.role === "RMG" && includePmo)
        || (user.role === "DELIVERY" && includeDeliveryLeaders && user.portfolioAuthorizations.some((grant) => grant.portfolioId === resource.portfolioId)))
      .map((user) => user.email)
      .filter((email) => email.toLocaleLowerCase() !== resource.email!.trim().toLocaleLowerCase()))];
    const subject = isDailyNotice
      ? `Bench in ${daysUntilBench} day${daysUntilBench === 1 ? "" : "s"}: ${resource.name}`
      : `Upcoming bench in 60 days: ${resource.name}`;
    const message = `${resource.name} (${resource.employeeId}) is expected to become available on ${deliveryDate}, in ${daysUntilBench} day${daysUntilBench === 1 ? "" : "s"}. Their assignment to ${allocation.project.name} ends on ${allocation.endDate.toISOString().slice(0, 10)}.${isDailyNotice ? "\nThis is the daily reminder for the 30-day pre-bench period." : "\nThis is the 60-day advance bench notice."}`;
    const result = await deliverEmail("ADVANCE_BENCH_NOTICE", resource.email.trim(), subject, message, noticeId, undefined, cc);
    if (result.status !== "SENT") {
      console.error(`[scheduler] advance bench notice failed for ${resource.employeeId}: ${result.error ?? "email delivery failed"}`);
    }
  }
}

/** Activate SCHEDULED allocations whose start date has arrived, and close out ACTIVE ones past their end date. */
export async function processAllocationTransitions() {
  const now = new Date();

  const startingAllocations = await prisma.allocation.findMany({
    where: { status: "SCHEDULED", startDate: { lte: now } },
  });
  for (const allocation of startingAllocations) {
    const updatedAllocation = await prisma.allocation.update({ where: { id: allocation.id }, data: { status: "ACTIVE" }, include: { project: true } });
    await prisma.resource.update({
      where: { id: allocation.resourceId },
      data: {
        status: "ALLOCATED",
        benchSince: null,
        subCategory: deriveDefaultSubCategory(
          { status: "ALLOCATED", subCategory: null },
          { isInternalProject: updatedAllocation.project.isInternalProject, billingDelayed: updatedAllocation.project.billingDelayed }
        ),
      },
    });
    await writeAudit({
      action: "ALLOCATION_AUTO_ACTIVATE",
      entityType: "Allocation",
      entityId: allocation.id,
      portfolioId: allocation.portfolioId,
    });
  }

  const endingAllocations = await prisma.allocation.findMany({
    where: { status: "ACTIVE", endDate: { lte: now, not: null } },
  });
  for (const allocation of endingAllocations) {
    await prisma.allocation.update({ where: { id: allocation.id }, data: { status: "CLOSED" } });
    await writeAudit({
      action: "ALLOCATION_AUTO_CLOSE",
      entityType: "Allocation",
      entityId: allocation.id,
      portfolioId: allocation.portfolioId,
    });
    await reclassifyResourceBenchStatus(allocation.resourceId);
  }

}
