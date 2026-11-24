import { Router } from "express";
import { EventEmitter } from "node:events";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { assertPortfolioAuthorized, requireRole, LIFECYCLE_ACTION_ROLES } from "../middleware/rbac";
import { checkCapacity, notifyPortfolioStakeholders } from "../services/allocationService";
import { reclassifyResourceBenchStatus } from "../services/benchService";
import { writeAudit } from "../utils/audit";
import { portfolioReadWhere } from "../utils/scope";
import { deriveDefaultSubCategory } from "../utils/resourcePresentation";
import { deliverEmail } from "./notifications";

const router = Router();

export const allocationEvents = new EventEmitter({ captureRejections: true });
allocationEvents.on("error", (error) => console.error("Allocation event listener failed", error));

const endDateSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(["extend", "edit"]),
  endDate: z.union([z.string().date(), z.string().datetime({ offset: true })])
    .refine((value) => Number.isFinite(new Date(value).getTime()), "Invalid ISO date")
    .transform((value) => new Date(value)),
  reason: z.string().trim().optional(),
}).strict();

const bulkEndDateSchema = z.object({
  allocationIds: z.array(z.string().uuid()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, "Allocation IDs must be unique"),
  endDate: z.string().date().transform((value) => new Date(value)),
  reason: z.string().trim().max(1000).optional(),
}).strict();

router.patch("/bulk-end-date", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res, next) => {
  const parsed = bulkEndDateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { allocationIds, endDate, reason } = parsed.data;

  try {
    const allocations = await prisma.allocation.findMany({
      where: { id: { in: allocationIds } },
      include: { resource: { select: { name: true, employeeId: true } }, project: { select: { name: true } } },
    });
    if (allocations.length !== allocationIds.length) return res.status(404).json({ error: "One or more allocations were not found" });
    const portfolioIds = [...new Set(allocations.map((allocation) => allocation.portfolioId))];
    const portfolioIdByAllocationId = new Map(allocations.map((allocation) => [allocation.id, allocation.portfolioId]));
    const authorized = await assertPortfolioAuthorized(req, res, portfolioIds, "Allocation");
    if (!authorized) return;

    const result = await prisma.$transaction(async (tx) => {
      const currentAllocations = await tx.allocation.findMany({
        where: { id: { in: allocationIds } },
        include: { resource: { select: { name: true, employeeId: true } }, project: { select: { name: true } } },
      });
      if (currentAllocations.length !== allocationIds.length) return { kind: "error", status: 404, error: "One or more allocations were not found" } as const;
      if (currentAllocations.some((allocation) => portfolioIdByAllocationId.get(allocation.id) !== allocation.portfolioId)) {
        return { kind: "error", status: 409, error: "Allocations changed; reload and retry" } as const;
      }

      const now = new Date();
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      if (endDate < today) return { kind: "error", status: 400, error: "End date must not be in the past" } as const;

      const endDateOnly = endDate.toISOString().slice(0, 10);
      const invalid = currentAllocations.find((allocation) =>
        !["ACTIVE", "SCHEDULED"].includes(allocation.status)
        || !allocation.endDate
        || endDateOnly < allocation.startDate.toISOString().slice(0, 10)
        || (allocation.endDate && endDateOnly < allocation.endDate.toISOString().slice(0, 10))
      );
      if (invalid) return { kind: "error", status: 400, error: `Bulk extension requires an eligible allocation and cannot shorten an existing end date (${invalid.resource.employeeId})` } as const;

      const updated = [];
      let unchanged = 0;
      for (const allocation of currentAllocations) {
        if (allocation.endDate!.toISOString().slice(0, 10) === endDateOnly) {
          unchanged += 1;
          continue;
        }
        const changed = await tx.allocation.update({
          where: { id: allocation.id },
          data: { endDate },
          include: { resource: { select: { name: true, employeeId: true } }, project: { select: { name: true } } },
        });
        const audit = {
          actorId: req.user!.id,
          action: "ALLOCATION_UPDATED",
          entityType: "Allocation",
          entityId: allocation.id,
          allocationId: allocation.id,
          projectId: allocation.projectId,
          resourceId: allocation.resourceId,
          portfolioId: allocation.portfolioId,
          reason: reason ?? null,
          timestamp: now.toISOString(),
          oldEndDate: allocation.endDate!.toISOString(),
          newEndDate: changed.endDate!.toISOString(),
          mode: "bulk_extend",
          before: {
            allocationId: allocation.id,
            projectId: allocation.projectId,
            resourceId: allocation.resourceId,
            startDate: allocation.startDate.toISOString(),
            endDate: allocation.endDate!.toISOString(),
          },
          after: {
            allocationId: changed.id,
            projectId: changed.projectId,
            resourceId: changed.resourceId,
            startDate: changed.startDate.toISOString(),
            endDate: changed.endDate!.toISOString(),
            actorId: req.user!.id,
            timestamp: now.toISOString(),
            mode: "bulk_extend",
          },
        };
        await writeAudit({ ...audit, reason }, tx);
        updated.push({ allocation: changed, audit });
      }
      return { kind: "success", updated, unchanged } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "error") return res.status(result.status).json({ error: result.error });
    if (result.updated.length > 0) {
      const allocationRule = await prisma.notificationRule.findUnique({ where: { key: "ALLOCATION_MODIFIED" } });
      if (allocationRule?.enabled !== false) {
        const recipients = await prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "RMG"] } } });
        const summary = `Bulk allocation update: ${result.updated.length} allocation${result.updated.length === 1 ? "" : "s"} extended to ${endDate.toISOString().slice(0, 10)}.\n${result.updated.map(({ allocation }) => `${allocation.resource.name} (${allocation.resource.employeeId}) · ${allocation.project.name}`).join("\n")}`;
        for (const recipient of recipients) await deliverEmail("ALLOCATION_MODIFIED", recipient.email, "Allocations extended", summary);
      }
      for (const { audit } of result.updated) {
        try {
          allocationEvents.emit("allocation.updated", audit);
        } catch (error) {
          console.error("Allocation event listener failed", error);
        }
      }
    }
    return res.json({ updated: result.updated.length, unchanged: result.unchanged });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") return res.status(409).json({ error: "Allocations changed; reload and retry" });
      if (error.code === "P2025") return res.status(404).json({ error: "One or more allocations were not found" });
    }
    return next(error);
  }
});

router.patch("/:id/end-date", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res, next) => {
  const parsed = endDateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: "Invalid allocation ID" });
  }
  const { projectId, mode, endDate, reason } = parsed.data;

  try {
    const allocation = await prisma.allocation.findUnique({ where: { id: req.params.id } });
    if (!allocation) return res.status(404).json({ error: "Allocation not found" });
    const authorized = await assertPortfolioAuthorized(req, res, [allocation.portfolioId], "Allocation", allocation.id);
    if (!authorized) return;

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.allocation.findUnique({ where: { id: allocation.id } });
      if (!current) return { status: 404, error: "Allocation not found" } as const;
      if (current.portfolioId !== allocation.portfolioId) {
        return { status: 409, error: "Allocation changed; reload and retry" } as const;
      }
      if (current.projectId !== projectId) {
        return { status: 400, error: "Project must match the allocation's existing project" } as const;
      }
      if (!["ACTIVE", "SCHEDULED"].includes(current.status)) {
        return { status: 400, error: "Only ACTIVE or SCHEDULED allocations can be updated" } as const;
      }
      const now = new Date();
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      if (endDate < today) return { status: 400, error: "End date must not be in the past" } as const;
      if (endDate.toISOString().slice(0, 10) < current.startDate.toISOString().slice(0, 10)) return { status: 400, error: "End date must be on or after the start date" } as const;
      if (mode === "extend" && !current.endDate) {
        return { status: 400, error: "Cannot extend an allocation without a current end date; use edit" } as const;
      }
      if (mode === "extend" && current.endDate && endDate <= current.endDate) {
        return { status: 400, error: "Extended end date must be later than the current end date" } as const;
      }

      const updated = await tx.allocation.update({ where: { id: current.id }, data: { endDate } });
      const audit = {
        actorId: req.user!.id,
        action: "ALLOCATION_UPDATED",
        entityType: "Allocation",
        entityId: current.id,
        allocationId: current.id,
        projectId: current.projectId,
        resourceId: current.resourceId,
        portfolioId: current.portfolioId,
        reason: reason ?? null,
        timestamp: now.toISOString(),
        oldEndDate: current.endDate?.toISOString() ?? null,
        newEndDate: updated.endDate!.toISOString(),
        mode,
        before: {
          allocationId: current.id,
          projectId: current.projectId,
          resourceId: current.resourceId,
          startDate: current.startDate.toISOString(),
          endDate: current.endDate?.toISOString() ?? null,
        },
        after: {
          allocationId: updated.id,
          projectId: updated.projectId,
          resourceId: updated.resourceId,
          startDate: updated.startDate.toISOString(),
          endDate: updated.endDate!.toISOString(),
          actorId: req.user!.id,
          timestamp: now.toISOString(),
          mode,
        },
      };
      await writeAudit({ ...audit, reason }, tx);
      return { allocation: updated, audit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.status !== undefined) return res.status(result.status).json({ error: result.error });
    const allocationRule = await prisma.notificationRule.findUnique({ where: { key: "ALLOCATION_MODIFIED" } });
    if (allocationRule?.enabled !== false) {
      const recipients = await prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "RMG"] } } });
      const summary = `Allocation ${mode} changed for ${allocation.resourceId}. New project end date: ${endDate.toISOString().slice(0, 10)}.`;
      for (const recipient of recipients) await deliverEmail("ALLOCATION_MODIFIED", recipient.email, "Allocation modified", summary);
    }
    try {
      allocationEvents.emit("allocation.updated", result.audit);
    } catch (error) {
      console.error("Allocation event listener failed", error);
    }
    return res.json(result.allocation);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") return res.status(409).json({ error: "Allocation changed; reload and retry" });
      if (error.code === "P2025") return res.status(404).json({ error: "Allocation not found" });
    }
    return next(error);
  }
});

router.get("/", async (req, res) => {
  const { resourceId, projectId, resource, project, status, reallocated, startDate, endDate } = req.query as Record<string, string | undefined>;
  const where: any = { ...portfolioReadWhere(req, "portfolioId") };
  if (resourceId) where.resourceId = resourceId;
  if (projectId) where.projectId = projectId;
  if (resource) where.resource = { OR: [
    { name: { contains: resource, mode: "insensitive" } },
    { employeeId: { contains: resource, mode: "insensitive" } },
  ] };
  if (project) where.project = { name: { contains: project, mode: "insensitive" } };
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;
    if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
      return res.status(400).json({ error: "Invalid allocation start date filter" });
    }
    where.startDate = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
  }
  if (status) {
    where.status = { in: status.split(",") };
  } else {
    where.status = { in: ["ACTIVE", "SCHEDULED"] };
  }
  if (reallocated === "true") where.reallocatedFromId = { not: null };
  if (reallocated === "false") where.reallocatedFromId = null;

  const allocations = await prisma.allocation.findMany({
    where,
    include: { resource: true, project: true, task: true, createdBy: { select: { id: true, name: true } }, reallocatedFrom: { select: { id: true, project: { select: { name: true } } } } },
    orderBy: { startDate: "desc" },
  });
  res.json(allocations);
});

const allocateSchema = z.object({
  resourceId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  allocationPercent: z.number().int().min(1).max(100),
  roleOnProject: z.string().optional(),
  projectReportingManagerName: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  override: z.boolean().optional(),
});

// FR-2.1 / FR-2.2 / FR-2.3 / FR-2.4, Workflow 7.2
router.post("/", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res) => {
  const parsed = allocateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { resourceId, projectId, taskId, allocationPercent, roleOnProject, projectReportingManagerName, startDate, endDate, notes, override } = parsed.data;

  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  if (resource.status === "TERMINATED") {
    return res.status(400).json({ error: "Cannot allocate a terminated resource" });
  }
  if (resource.status === "ON_ML") {
    return res.status(400).json({ error: "Cannot allocate a resource who is on maternity leave" });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const portfoliosInvolved = Array.from(new Set([resource.portfolioId, project.portfolioId]));
  const authorized = await assertPortfolioAuthorized(req, res, portfoliosInvolved, "Allocation");
  if (!authorized) return;

  const capacity = await checkCapacity(resourceId, allocationPercent, startDate, endDate ?? null);
  if (!capacity.ok && !override) {
    await writeAudit({
      actorId: req.user!.id,
      action: "BLOCKED_ALLOCATION_CONFLICT",
      entityType: "Resource",
      entityId: resourceId,
      success: false,
      message: `Over-allocation: ${capacity.totalPercent}% committed`,
    });
    return res.status(409).json({ error: "Scheduling conflict: resource would be over-allocated", capacity });
  }

  const isImmediate = startDate <= new Date();
  const allocation = await prisma.allocation.create({
    data: {
      resourceId,
      projectId,
      taskId,
      portfolioId: project.portfolioId,
      allocationPercent,
      roleOnProject,
      projectReportingManagerName,
      startDate,
      endDate,
      status: isImmediate ? "ACTIVE" : "SCHEDULED",
      createdById: req.user!.id,
      notes,
    },
  });

  if (isImmediate) {
    await prisma.resource.update({
      where: { id: resourceId },
      data: {
        status: "ALLOCATED",
        benchSince: null,
        subCategory: deriveDefaultSubCategory(
          { status: "ALLOCATED", subCategory: resource.subCategory },
          { isInternalProject: project.isInternalProject, billingDelayed: project.billingDelayed }
        ),
      },
    });
  } else {
    await reclassifyResourceBenchStatus(resourceId, req.user!.id);
  }

  await writeAudit({
    actorId: req.user!.id,
    action: "ALLOCATE",
    entityType: "Allocation",
    entityId: allocation.id,
    portfolioId: project.portfolioId,
    after: allocation,
  });

  res.status(201).json({ allocation, capacityWarning: capacity.ok ? null : capacity });
});

const reallocateSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  allocationPercent: z.number().int().min(1).max(100),
  roleOnProject: z.string().optional(),
  projectReportingManagerName: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  override: z.boolean().optional(),
});

// FR-3.1 / FR-3.2 / FR-3.3, Workflow 7.3
router.post("/:id/reallocate", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res) => {
  const parsed = reallocateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { projectId, taskId, allocationPercent, roleOnProject, projectReportingManagerName, startDate, endDate, notes, override } = parsed.data;

  const current = await prisma.allocation.findUnique({ where: { id: req.params.id }, include: { resource: true } });
  if (!current) return res.status(404).json({ error: "Allocation not found" });
  if (!["ACTIVE", "SCHEDULED"].includes(current.status)) {
    return res.status(400).json({ error: "Only ACTIVE or SCHEDULED allocations can be reallocated" });
  }

  const newProject = await prisma.project.findUnique({ where: { id: projectId } });
  if (!newProject) return res.status(404).json({ error: "Target project not found" });

  const losingPortfolioId = current.portfolioId;
  const receivingPortfolioId = newProject.portfolioId;
  const authorized = await assertPortfolioAuthorized(
    req,
    res,
    Array.from(new Set([losingPortfolioId, receivingPortfolioId])),
    "Allocation",
    current.id
  );
  if (!authorized) return;

  const capacity = await checkCapacity(current.resourceId, allocationPercent, startDate, endDate ?? null, current.id);
  if (!capacity.ok && !override) {
    return res.status(409).json({ error: "Scheduling conflict: resource would be over-allocated on reallocation", capacity });
  }

  const isImmediate = startDate <= new Date();

  const result = await prisma.$transaction(async (tx) => {
    const newAllocation = await tx.allocation.create({
      data: {
        resourceId: current.resourceId,
        projectId,
        taskId,
        portfolioId: receivingPortfolioId,
        allocationPercent,
        roleOnProject,
        projectReportingManagerName,
        startDate,
        endDate,
        status: isImmediate ? "ACTIVE" : "SCHEDULED",
        createdById: req.user!.id,
        notes,
        reallocatedFromId: current.id,
      },
    });

    if (isImmediate) {
      await tx.allocation.update({ where: { id: current.id }, data: { status: "CLOSED", endDate: startDate } });
    } else {
      // No unnecessary bench pass-through: close the old assignment exactly when the new one starts.
      await tx.allocation.update({ where: { id: current.id }, data: { endDate: startDate } });
    }

    return newAllocation;
  });

  if (isImmediate) {
    await prisma.resource.update({
      where: { id: current.resourceId },
      data: {
        status: "ALLOCATED",
        benchSince: null,
        subCategory: deriveDefaultSubCategory(
          { status: "ALLOCATED", subCategory: current.resource.subCategory },
          { isInternalProject: newProject.isInternalProject, billingDelayed: newProject.billingDelayed }
        ),
      },
    });
  }

  await writeAudit({
    actorId: req.user!.id,
    action: "REALLOCATE",
    entityType: "Allocation",
    entityId: result.id,
    portfolioId: receivingPortfolioId,
    before: current,
    after: result,
  });

  await notifyPortfolioStakeholders(
    [losingPortfolioId, receivingPortfolioId],
    `Resource ${current.resource.name} reallocated from project ${current.projectId} to ${projectId}${
      isImmediate ? "" : ` (scheduled for ${startDate.toISOString().slice(0, 10)})`
    }.`,
    "REALLOCATION",
    "Allocation",
    result.id
  );

  res.status(201).json({ allocation: result, capacityWarning: capacity.ok ? null : capacity });
});

// Unassign without an immediate next assignment -> automatic Bench transition (FR-4.1, Section 3 "Unassign (-> Bench)")
router.post("/:id/unassign", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res) => {
  const current = await prisma.allocation.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Allocation not found" });
  if (current.status !== "ACTIVE") return res.status(400).json({ error: "Only ACTIVE allocations can be unassigned" });

  const authorized = await assertPortfolioAuthorized(req, res, [current.portfolioId], "Allocation", current.id);
  if (!authorized) return;

  const now = new Date();
  const updated = await prisma.allocation.update({ where: { id: current.id }, data: { status: "CLOSED", endDate: now } });

  await reclassifyResourceBenchStatus(current.resourceId, req.user!.id);

  await writeAudit({
    actorId: req.user!.id,
    action: "UNASSIGN",
    entityType: "Allocation",
    entityId: current.id,
    portfolioId: current.portfolioId,
    before: current,
    after: updated,
  });

  res.json(updated);
});

export default router;
