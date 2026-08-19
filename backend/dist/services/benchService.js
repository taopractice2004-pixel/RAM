"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBenchConfig = getBenchConfig;
exports.reclassifyResourceBenchStatus = reclassifyResourceBenchStatus;
exports.reclassifyAvailableResourcesFromDateOfJoining = reclassifyAvailableResourcesFromDateOfJoining;
exports.runBenchAgingAlerts = runBenchAgingAlerts;
exports.processAllocationTransitions = processAllocationTransitions;
const prisma_1 = require("../prisma");
const audit_1 = require("../utils/audit");
const resourcePresentation_1 = require("../utils/resourcePresentation");
const DEFAULT_COMMITTED_WINDOW_DAYS = 14;
const DEFAULT_TRUE_BENCH_THRESHOLD_DAYS = 30;
const DEFAULT_AVAILABLE_TO_BENCH_DAYS = 60;
async function getBenchConfig(portfolioId) {
    const specific = await prisma_1.prisma.benchConfig.findUnique({ where: { portfolioId } });
    if (specific)
        return specific;
    const global = await prisma_1.prisma.benchConfig.findFirst({ where: { portfolioId: null } });
    if (global)
        return global;
    return { committedWindowDays: DEFAULT_COMMITTED_WINDOW_DAYS, trueBenchAgingThresholdDays: DEFAULT_TRUE_BENCH_THRESHOLD_DAYS };
}
/**
 * FR-4.1 / FR-4.2: move a resource that has no current active allocation to Bench,
 * classifying it as Committed (a SCHEDULED allocation starts within the configurable
 * window) or True Bench (nothing scheduled).
 */
async function reclassifyResourceBenchStatus(resourceId, actorId) {
    const resource = await prisma_1.prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource || resource.status === "TERMINATED" || resource.status === "ON_ML")
        return;
    const activeAllocation = await prisma_1.prisma.allocation.findFirst({
        where: { resourceId, status: "ACTIVE" },
    });
    if (activeAllocation)
        return; // still allocated, nothing to do
    const config = await getBenchConfig(resource.portfolioId);
    const nextScheduled = await prisma_1.prisma.allocation.findFirst({
        where: { resourceId, status: "SCHEDULED" },
        orderBy: { startDate: "asc" },
    });
    const now = new Date();
    const before = { status: resource.status, benchSince: resource.benchSince };
    let newStatus;
    if (nextScheduled) {
        const daysUntilStart = (nextScheduled.startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        newStatus = daysUntilStart <= config.committedWindowDays ? "BENCH_COMMITTED" : "BENCH_TRUE";
    }
    else {
        newStatus = "BENCH_TRUE";
    }
    const benchSince = resource.status === "BENCH_COMMITTED" || resource.status === "BENCH_TRUE" ? resource.benchSince ?? now : now;
    const updated = await prisma_1.prisma.resource.update({
        where: { id: resourceId },
        data: { status: newStatus, benchSince, subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: newStatus, subCategory: resource.subCategory }) },
    });
    await (0, audit_1.writeAudit)({
        actorId: actorId ?? null,
        action: "BENCH_RECLASSIFY",
        entityType: "Resource",
        entityId: resourceId,
        portfolioId: resource.portfolioId,
        before,
        after: { status: updated.status, benchSince: updated.benchSince },
    });
}
async function reclassifyAvailableResourcesFromDateOfJoining(actorId) {
    const now = new Date();
    const candidates = await prisma_1.prisma.resource.findMany({
        where: { status: "AVAILABLE", dateOfJoining: { not: null } },
    });
    for (const resource of candidates) {
        const daysSinceJoining = (now.getTime() - resource.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceJoining < DEFAULT_AVAILABLE_TO_BENCH_DAYS)
            continue;
        await prisma_1.prisma.resource.update({
            where: { id: resource.id },
            data: {
                status: "BENCH_TRUE",
                benchSince: resource.benchSince ?? resource.dateOfJoining,
                subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: "BENCH_TRUE", subCategory: resource.subCategory }),
            },
        });
        await (0, audit_1.writeAudit)({
            actorId: actorId ?? null,
            action: "AUTO_MOVE_AVAILABLE_TO_BENCH",
            entityType: "Resource",
            entityId: resource.id,
            portfolioId: resource.portfolioId,
            before: { status: resource.status, benchSince: resource.benchSince },
            after: { status: "BENCH_TRUE", benchSince: resource.benchSince ?? resource.dateOfJoining },
            message: `Resource moved from AVAILABLE to BENCH_TRUE after ${DEFAULT_AVAILABLE_TO_BENCH_DAYS}+ days from DOJ without an assignment`,
        });
    }
}
/** FR-4.3 / FR-11.3: alert RMG (and TA) when a resource ages on True Bench past threshold. */
async function runBenchAgingAlerts() {
    const trueBenchResources = await prisma_1.prisma.resource.findMany({
        where: { status: "BENCH_TRUE", benchSince: { not: null } },
    });
    const rmgUsers = await prisma_1.prisma.user.findMany({ where: { role: "RMG", active: true } });
    const taUsers = await prisma_1.prisma.user.findMany({ where: { role: "TA", active: true } });
    const now = new Date();
    for (const resource of trueBenchResources) {
        const config = await getBenchConfig(resource.portfolioId);
        const daysOnBench = (now.getTime() - resource.benchSince.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOnBench < config.trueBenchAgingThresholdDays)
            continue;
        const alreadyNotifiedToday = await prisma_1.prisma.notification.findFirst({
            where: {
                type: "BENCH_AGING",
                relatedEntityId: resource.id,
                createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
        });
        if (alreadyNotifiedToday)
            continue;
        const message = `${resource.name} (${resource.employeeId}) has been on True Bench for ${Math.floor(daysOnBench)} days, exceeding the ${config.trueBenchAgingThresholdDays}-day threshold.`;
        for (const user of [...rmgUsers, ...taUsers]) {
            await prisma_1.prisma.notification.create({
                data: {
                    userId: user.id,
                    type: "BENCH_AGING",
                    message,
                    relatedEntityType: "Resource",
                    relatedEntityId: resource.id,
                },
            });
        }
    }
}
/** Activate SCHEDULED allocations whose start date has arrived, and close out ACTIVE ones past their end date. */
async function processAllocationTransitions() {
    const now = new Date();
    const startingAllocations = await prisma_1.prisma.allocation.findMany({
        where: { status: "SCHEDULED", startDate: { lte: now } },
    });
    for (const allocation of startingAllocations) {
        const updatedAllocation = await prisma_1.prisma.allocation.update({ where: { id: allocation.id }, data: { status: "ACTIVE" }, include: { project: true } });
        await prisma_1.prisma.resource.update({
            where: { id: allocation.resourceId },
            data: {
                status: "ALLOCATED",
                benchSince: null,
                subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: "ALLOCATED", subCategory: null }, { isInternalProject: updatedAllocation.project.isInternalProject, billingDelayed: updatedAllocation.project.billingDelayed }),
            },
        });
        await (0, audit_1.writeAudit)({
            action: "ALLOCATION_AUTO_ACTIVATE",
            entityType: "Allocation",
            entityId: allocation.id,
            portfolioId: allocation.portfolioId,
        });
    }
    const endingAllocations = await prisma_1.prisma.allocation.findMany({
        where: { status: "ACTIVE", endDate: { lte: now, not: null } },
    });
    for (const allocation of endingAllocations) {
        await prisma_1.prisma.allocation.update({ where: { id: allocation.id }, data: { status: "CLOSED" } });
        await (0, audit_1.writeAudit)({
            action: "ALLOCATION_AUTO_CLOSE",
            entityType: "Allocation",
            entityId: allocation.id,
            portfolioId: allocation.portfolioId,
        });
        await reclassifyResourceBenchStatus(allocation.resourceId);
    }
    await reclassifyAvailableResourcesFromDateOfJoining();
}
