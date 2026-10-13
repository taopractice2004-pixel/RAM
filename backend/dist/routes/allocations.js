"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const allocationService_1 = require("../services/allocationService");
const benchService_1 = require("../services/benchService");
const audit_1 = require("../utils/audit");
const scope_1 = require("../utils/scope");
const resourcePresentation_1 = require("../utils/resourcePresentation");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    const { resourceId, projectId, status } = req.query;
    const where = { ...(0, scope_1.portfolioReadWhere)(req, "portfolioId") };
    if (resourceId)
        where.resourceId = resourceId;
    if (projectId)
        where.projectId = projectId;
    if (status) {
        where.status = { in: status.split(",") };
    }
    else {
        where.status = { in: ["ACTIVE", "SCHEDULED"] };
    }
    const allocations = await prisma_1.prisma.allocation.findMany({
        where,
        include: { resource: true, project: true, task: true, createdBy: { select: { id: true, name: true } } },
        orderBy: { startDate: "desc" },
    });
    res.json(allocations);
});
const allocateSchema = zod_1.z.object({
    resourceId: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    taskId: zod_1.z.string().uuid().optional(),
    allocationPercent: zod_1.z.number().int().min(1).max(100),
    roleOnProject: zod_1.z.string().optional(),
    projectReportingManagerName: zod_1.z.string().optional(),
    startDate: zod_1.z.coerce.date(),
    endDate: zod_1.z.coerce.date().optional(),
    notes: zod_1.z.string().optional(),
    override: zod_1.z.boolean().optional(),
});
// FR-2.1 / FR-2.2 / FR-2.3 / FR-2.4, Workflow 7.2
router.post("/", (0, rbac_1.requireRole)(...rbac_1.LIFECYCLE_ACTION_ROLES), async (req, res) => {
    const parsed = allocateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { resourceId, projectId, taskId, allocationPercent, roleOnProject, projectReportingManagerName, startDate, endDate, notes, override } = parsed.data;
    const resource = await prisma_1.prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource)
        return res.status(404).json({ error: "Resource not found" });
    if (resource.status === "TERMINATED") {
        return res.status(400).json({ error: "Cannot allocate a terminated resource" });
    }
    if (resource.status === "ON_ML") {
        return res.status(400).json({ error: "Cannot allocate a resource who is on maternity leave" });
    }
    const project = await prisma_1.prisma.project.findUnique({ where: { id: projectId } });
    if (!project)
        return res.status(404).json({ error: "Project not found" });
    const portfoliosInvolved = Array.from(new Set([resource.portfolioId, project.portfolioId]));
    const authorized = await (0, rbac_1.assertPortfolioAuthorized)(req, res, portfoliosInvolved, "Allocation");
    if (!authorized)
        return;
    const capacity = await (0, allocationService_1.checkCapacity)(resourceId, allocationPercent, startDate, endDate ?? null);
    if (!capacity.ok && !override) {
        await (0, audit_1.writeAudit)({
            actorId: req.user.id,
            action: "BLOCKED_ALLOCATION_CONFLICT",
            entityType: "Resource",
            entityId: resourceId,
            success: false,
            message: `Over-allocation: ${capacity.totalPercent}% committed`,
        });
        return res.status(409).json({ error: "Scheduling conflict: resource would be over-allocated", capacity });
    }
    const isImmediate = startDate <= new Date();
    const allocation = await prisma_1.prisma.allocation.create({
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
            createdById: req.user.id,
            notes,
        },
    });
    if (isImmediate) {
        await prisma_1.prisma.resource.update({
            where: { id: resourceId },
            data: {
                status: "ALLOCATED",
                benchSince: null,
                subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: "ALLOCATED", subCategory: resource.subCategory }, { isInternalProject: project.isInternalProject, billingDelayed: project.billingDelayed }),
            },
        });
    }
    else {
        await (0, benchService_1.reclassifyResourceBenchStatus)(resourceId, req.user.id);
    }
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "ALLOCATE",
        entityType: "Allocation",
        entityId: allocation.id,
        portfolioId: project.portfolioId,
        after: allocation,
    });
    res.status(201).json({ allocation, capacityWarning: capacity.ok ? null : capacity });
});
const reallocateSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    taskId: zod_1.z.string().uuid().optional(),
    allocationPercent: zod_1.z.number().int().min(1).max(100),
    roleOnProject: zod_1.z.string().optional(),
    projectReportingManagerName: zod_1.z.string().optional(),
    startDate: zod_1.z.coerce.date(),
    endDate: zod_1.z.coerce.date().optional(),
    notes: zod_1.z.string().optional(),
    override: zod_1.z.boolean().optional(),
});
// FR-3.1 / FR-3.2 / FR-3.3, Workflow 7.3
router.post("/:id/reallocate", (0, rbac_1.requireRole)(...rbac_1.LIFECYCLE_ACTION_ROLES), async (req, res) => {
    const parsed = reallocateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { projectId, taskId, allocationPercent, roleOnProject, projectReportingManagerName, startDate, endDate, notes, override } = parsed.data;
    const current = await prisma_1.prisma.allocation.findUnique({ where: { id: req.params.id }, include: { resource: true } });
    if (!current)
        return res.status(404).json({ error: "Allocation not found" });
    if (!["ACTIVE", "SCHEDULED"].includes(current.status)) {
        return res.status(400).json({ error: "Only ACTIVE or SCHEDULED allocations can be reallocated" });
    }
    const newProject = await prisma_1.prisma.project.findUnique({ where: { id: projectId } });
    if (!newProject)
        return res.status(404).json({ error: "Target project not found" });
    const losingPortfolioId = current.portfolioId;
    const receivingPortfolioId = newProject.portfolioId;
    const authorized = await (0, rbac_1.assertPortfolioAuthorized)(req, res, Array.from(new Set([losingPortfolioId, receivingPortfolioId])), "Allocation", current.id);
    if (!authorized)
        return;
    const capacity = await (0, allocationService_1.checkCapacity)(current.resourceId, allocationPercent, startDate, endDate ?? null, current.id);
    if (!capacity.ok && !override) {
        return res.status(409).json({ error: "Scheduling conflict: resource would be over-allocated on reallocation", capacity });
    }
    const isImmediate = startDate <= new Date();
    const result = await prisma_1.prisma.$transaction(async (tx) => {
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
                createdById: req.user.id,
                notes,
                reallocatedFromId: current.id,
            },
        });
        if (isImmediate) {
            await tx.allocation.update({ where: { id: current.id }, data: { status: "CLOSED", endDate: startDate } });
        }
        else {
            // No unnecessary bench pass-through: close the old assignment exactly when the new one starts.
            await tx.allocation.update({ where: { id: current.id }, data: { endDate: startDate } });
        }
        return newAllocation;
    });
    if (isImmediate) {
        await prisma_1.prisma.resource.update({
            where: { id: current.resourceId },
            data: {
                status: "ALLOCATED",
                benchSince: null,
                subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: "ALLOCATED", subCategory: current.resource.subCategory }, { isInternalProject: newProject.isInternalProject, billingDelayed: newProject.billingDelayed }),
            },
        });
    }
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "REALLOCATE",
        entityType: "Allocation",
        entityId: result.id,
        portfolioId: receivingPortfolioId,
        before: current,
        after: result,
    });
    await (0, allocationService_1.notifyPortfolioStakeholders)([losingPortfolioId, receivingPortfolioId], `Resource ${current.resource.name} reallocated from project ${current.projectId} to ${projectId}${isImmediate ? "" : ` (scheduled for ${startDate.toISOString().slice(0, 10)})`}.`, "REALLOCATION", "Allocation", result.id);
    res.status(201).json({ allocation: result, capacityWarning: capacity.ok ? null : capacity });
});
// Unassign without an immediate next assignment -> automatic Bench transition (FR-4.1, Section 3 "Unassign (-> Bench)")
router.post("/:id/unassign", (0, rbac_1.requireRole)(...rbac_1.LIFECYCLE_ACTION_ROLES), async (req, res) => {
    const current = await prisma_1.prisma.allocation.findUnique({ where: { id: req.params.id } });
    if (!current)
        return res.status(404).json({ error: "Allocation not found" });
    if (current.status !== "ACTIVE")
        return res.status(400).json({ error: "Only ACTIVE allocations can be unassigned" });
    const authorized = await (0, rbac_1.assertPortfolioAuthorized)(req, res, [current.portfolioId], "Allocation", current.id);
    if (!authorized)
        return;
    const now = new Date();
    const updated = await prisma_1.prisma.allocation.update({ where: { id: current.id }, data: { status: "CLOSED", endDate: now } });
    await (0, benchService_1.reclassifyResourceBenchStatus)(current.resourceId, req.user.id);
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "UNASSIGN",
        entityType: "Allocation",
        entityId: current.id,
        portfolioId: current.portfolioId,
        before: current,
        after: updated,
    });
    res.json(updated);
});
exports.default = router;
