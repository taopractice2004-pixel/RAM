"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommittedCapacity = getCommittedCapacity;
exports.checkCapacity = checkCapacity;
exports.notifyPortfolioStakeholders = notifyPortfolioStakeholders;
const prisma_1 = require("../prisma");
/**
 * FR-2.1 / FR-2.3 / FR-3.2: total committed capacity for a resource across ACTIVE
 * allocations plus SCHEDULED allocations that overlap the proposed date window,
 * used to detect double-booking / over-allocation before confirming a new assignment.
 */
async function getCommittedCapacity(resourceId, windowStart, windowEnd, excludeAllocationId) {
    const allocations = await prisma_1.prisma.allocation.findMany({
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
async function checkCapacity(resourceId, requestedPercent, startDate, endDate, excludeAllocationId) {
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
async function notifyPortfolioStakeholders(portfolioIds, message, type = "REALLOCATION", relatedEntityType, relatedEntityId) {
    const authUsers = await prisma_1.prisma.portfolioAuthorization.findMany({
        where: { portfolioId: { in: portfolioIds }, isActive: true },
        include: { user: true },
    });
    const rmgUsers = await prisma_1.prisma.user.findMany({ where: { role: "RMG", active: true } });
    const recipientIds = new Set([
        ...authUsers.filter((a) => a.user.role === "DELIVERY").map((a) => a.user.id),
        ...rmgUsers.map((u) => u.id),
    ]);
    for (const userId of recipientIds) {
        await prisma_1.prisma.notification.create({
            data: { userId, type, message, relatedEntityType, relatedEntityId },
        });
    }
}
