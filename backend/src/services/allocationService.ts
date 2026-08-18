import { prisma } from "../prisma";

/**
 * FR-2.1 / FR-2.3 / FR-3.2: total committed capacity for a resource across ACTIVE
 * allocations plus SCHEDULED allocations that overlap the proposed date window,
 * used to detect double-booking / over-allocation before confirming a new assignment.
 */
export async function getCommittedCapacity(
  resourceId: string,
  windowStart: Date,
  windowEnd: Date | null,
  excludeAllocationId?: string
) {
  const allocations = await prisma.allocation.findMany({
    where: {
      resourceId,
      status: { in: ["ACTIVE", "SCHEDULED"] },
      ...(excludeAllocationId ? { id: { not: excludeAllocationId } } : {}),
    },
  });

  const overlapping = allocations.filter((a) => {
    const aEnd = a.endDate ?? new Date("9999-12-31");
    const wEnd = windowEnd ?? new Date("9999-12-31");
    return a.startDate <= wEnd && aEnd >= windowStart;
  });

  const committedPercent = overlapping.reduce((sum, a) => sum + a.allocationPercent, 0);
  return { committedPercent, overlapping };
}

export interface CapacityCheckResult {
  ok: boolean;
  committedPercent: number;
  requestedPercent: number;
  totalPercent: number;
  conflicts: { allocationId: string; projectId: string; allocationPercent: number }[];
}

export async function checkCapacity(
  resourceId: string,
  requestedPercent: number,
  startDate: Date,
  endDate: Date | null,
  excludeAllocationId?: string
): Promise<CapacityCheckResult> {
  const { committedPercent, overlapping } = await getCommittedCapacity(resourceId, startDate, endDate, excludeAllocationId);
  const totalPercent = committedPercent + requestedPercent;
  return {
    ok: totalPercent <= 100,
    committedPercent,
    requestedPercent,
    totalPercent,
    conflicts: overlapping.map((a) => ({ allocationId: a.id, projectId: a.projectId, allocationPercent: a.allocationPercent })),
  };
}

/** FR-3.3: notify losing/receiving Delivery + RMG owners of a reallocation event. */
export async function notifyPortfolioStakeholders(
  portfolioIds: string[],
  message: string,
  type: "REALLOCATION" | "UNMET_DEMAND" = "REALLOCATION",
  relatedEntityType?: string,
  relatedEntityId?: string
) {
  const authUsers = await prisma.portfolioAuthorization.findMany({
    where: { portfolioId: { in: portfolioIds }, isActive: true },
    include: { user: true },
  });
  const rmgUsers = await prisma.user.findMany({ where: { role: "RMG", active: true } });

  const recipientIds = new Set<string>([
    ...authUsers.filter((a) => a.user.role === "DELIVERY").map((a) => a.user.id),
    ...rmgUsers.map((u) => u.id),
  ]);

  for (const userId of recipientIds) {
    await prisma.notification.create({
      data: { userId, type, message, relatedEntityType, relatedEntityId },
    });
  }
}
