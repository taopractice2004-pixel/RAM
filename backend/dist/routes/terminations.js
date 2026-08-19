"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const audit_1 = require("../utils/audit");
const scope_1 = require("../utils/scope");
const benchService_1 = require("../services/benchService");
const resourcePresentation_1 = require("../utils/resourcePresentation");
const router = (0, express_1.Router)();
router.get("/", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const { status } = req.query;
    const where = {};
    if (status)
        where.status = { in: status.split(",") };
    const requests = await prisma_1.prisma.terminationRequest.findMany({
        where,
        include: { resource: { include: { portfolio: true } }, initiatedBy: true, hrApprover: true },
        orderBy: { createdAt: "desc" },
    });
    // RMG only sees requests for resources in their authorized portfolios; HR/Admin see all.
    const scope = (0, scope_1.portfolioReadWhere)(req);
    const filtered = scope.portfolioId
        ? requests.filter((r) => scope.portfolioId.in.includes(r.resource.portfolioId))
        : requests;
    res.json(filtered);
});
const initiateSchema = zod_1.z.object({
    resourceId: zod_1.z.string().uuid(),
    reasonCode: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
    forceCloseAllocations: zod_1.z.boolean().optional(),
});
// FR-5.1 / FR-5.2 / FR-5.4, Workflow 7.5
router.post("/", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { resourceId, reasonCode, reason, forceCloseAllocations } = parsed.data;
    const resource = await prisma_1.prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource)
        return res.status(404).json({ error: "Resource not found" });
    if (resource.status === "TERMINATED")
        return res.status(400).json({ error: "Resource is already terminated" });
    if (resource.status === "ON_ML")
        return res.status(400).json({ error: "Resource on maternity leave cannot be terminated" });
    if (req.user.role === "RMG") {
        const authorized = await (0, rbac_1.assertPortfolioAuthorized)(req, res, [resource.portfolioId], "Resource", resourceId);
        if (!authorized)
            return;
    }
    const activeAllocations = await prisma_1.prisma.allocation.findMany({ where: { resourceId, status: "ACTIVE" } });
    if (activeAllocations.length > 0) {
        if (!forceCloseAllocations) {
            return res.status(400).json({
                error: "Resource has active allocations; reassign/close them first or pass forceCloseAllocations=true",
                activeAllocations,
            });
        }
        const now = new Date();
        for (const a of activeAllocations) {
            await prisma_1.prisma.allocation.update({ where: { id: a.id }, data: { status: "CLOSED", endDate: now } });
        }
        // Closing the allocation is a real, independent event (FR-4.1): the resource moves to
        // Bench immediately, regardless of whether the termination itself is later approved or
        // rejected. If HR rejects, the resource should simply sit on Bench awaiting reallocation,
        // not remain stuck showing a stale ALLOCATED status with no backing allocation.
        await (0, benchService_1.reclassifyResourceBenchStatus)(resourceId, req.user.id);
        await (0, audit_1.writeAudit)({
            actorId: req.user.id,
            action: "FORCE_CLOSE_ALLOCATIONS_FOR_TERMINATION",
            entityType: "Resource",
            entityId: resourceId,
            portfolioId: resource.portfolioId,
            message: `Force-closed ${activeAllocations.length} active allocation(s) ahead of termination`,
        });
    }
    // Section 5.3: only RMG's cell carries the "(with HR approval)" caveat - Admin and HR
    // terminate directly. RMG-initiated requests require a separate HR approval step.
    const isAutoApproved = req.user.role === "HR" || req.user.role === "ADMIN";
    const request = await prisma_1.prisma.terminationRequest.create({
        data: {
            resourceId,
            initiatedById: req.user.id,
            reasonCode,
            reason,
            status: isAutoApproved ? "APPROVED" : "PENDING_HR_APPROVAL",
            hrApproverId: isAutoApproved ? req.user.id : null,
            decidedAt: isAutoApproved ? new Date() : null,
        },
    });
    if (isAutoApproved) {
        await applyTermination(resource.id, request.id, req.user.id, reasonCode);
    }
    else {
        const hrUsers = await prisma_1.prisma.user.findMany({ where: { role: "HR", active: true } });
        for (const hr of hrUsers) {
            await prisma_1.prisma.notification.create({
                data: {
                    userId: hr.id,
                    type: "TERMINATION_APPROVAL_NEEDED",
                    message: `${req.user.name} requested termination of ${resource.name} (${resource.employeeId}); HR approval needed.`,
                    relatedEntityType: "TerminationRequest",
                    relatedEntityId: request.id,
                },
            });
        }
    }
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "INITIATE_TERMINATION",
        entityType: "TerminationRequest",
        entityId: request.id,
        portfolioId: resource.portfolioId,
        reason: reasonCode,
        after: request,
    });
    res.status(201).json(request);
});
router.post("/:id/approve", (0, rbac_1.requireRole)("HR"), async (req, res) => {
    const request = await prisma_1.prisma.terminationRequest.findUnique({ where: { id: req.params.id }, include: { resource: true } });
    if (!request)
        return res.status(404).json({ error: "Request not found" });
    if (request.status !== "PENDING_HR_APPROVAL")
        return res.status(400).json({ error: "Request is not pending approval" });
    const updated = await prisma_1.prisma.terminationRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", hrApproverId: req.user.id, decidedAt: new Date() },
    });
    await applyTermination(request.resourceId, request.id, req.user.id, request.reasonCode);
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "APPROVE_TERMINATION",
        entityType: "TerminationRequest",
        entityId: request.id,
        portfolioId: request.resource.portfolioId,
        after: updated,
    });
    res.json(updated);
});
router.post("/:id/reject", (0, rbac_1.requireRole)("HR"), async (req, res) => {
    const request = await prisma_1.prisma.terminationRequest.findUnique({ where: { id: req.params.id } });
    if (!request)
        return res.status(404).json({ error: "Request not found" });
    if (request.status !== "PENDING_HR_APPROVAL")
        return res.status(400).json({ error: "Request is not pending approval" });
    const updated = await prisma_1.prisma.terminationRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", hrApproverId: req.user.id, decidedAt: new Date() },
    });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "REJECT_TERMINATION",
        entityType: "TerminationRequest",
        entityId: request.id,
        after: updated,
    });
    res.json(updated);
});
/** FR-5.3 / FR-5.4: apply the state change, retaining historical data, and log the audit event. */
async function applyTermination(resourceId, requestId, actorId, reasonCode) {
    const before = await prisma_1.prisma.resource.findUnique({ where: { id: resourceId } });
    const resource = await prisma_1.prisma.resource.update({
        where: { id: resourceId },
        data: { status: "TERMINATED", subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: "TERMINATED", subCategory: before?.subCategory ?? null }) },
    });
    await prisma_1.prisma.terminationRequest.update({ where: { id: requestId }, data: { status: "COMPLETED" } });
    await (0, audit_1.writeAudit)({
        actorId,
        action: "TERMINATE_RESOURCE",
        entityType: "Resource",
        entityId: resourceId,
        portfolioId: resource.portfolioId,
        reason: reasonCode,
        before,
        after: resource,
    });
}
exports.default = router;
