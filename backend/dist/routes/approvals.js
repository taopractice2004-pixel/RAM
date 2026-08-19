"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
router.get("/", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const [terminations, maternityLeaveRequests] = await Promise.all([
        prisma_1.prisma.terminationRequest.findMany({
            include: { resource: { include: { portfolio: true } }, initiatedBy: true, hrApprover: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma_1.prisma.maternityLeaveRequest.findMany({
            include: { resource: { include: { portfolio: true } }, initiatedBy: true, hrApprover: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);
    const inScope = (portfolioId) => req.user.role === "ADMIN" || req.user.role === "HR" || req.user.authorizedPortfolioIds.includes(portfolioId);
    const requests = [
        ...terminations.filter((r) => inScope(r.resource.portfolioId)).map((r) => ({ ...r, requestType: "TERMINATION" })),
        ...maternityLeaveRequests.filter((r) => inScope(r.resource.portfolioId)).map((r) => ({ ...r, requestType: "ML" })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(requests);
});
const mlRequestSchema = zod_1.z.object({
    resourceId: zod_1.z.string().uuid(),
    reason: zod_1.z.string().optional(),
});
router.post("/ml", (0, rbac_1.requireRole)("RMG", "HR", "DELIVERY"), async (req, res) => {
    const parsed = mlRequestSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const resource = await prisma_1.prisma.resource.findUnique({ where: { id: parsed.data.resourceId } });
    if (!resource)
        return res.status(404).json({ error: "Resource not found" });
    if (resource.status === "TERMINATED")
        return res.status(400).json({ error: "Terminated resources cannot be moved to maternity leave" });
    if (resource.status === "ON_ML")
        return res.status(400).json({ error: "Resource is already on maternity leave" });
    if (resource.gender !== "FEMALE")
        return res.status(400).json({ error: "Maternity leave can only be requested for female employees" });
    if (req.user.role !== "HR") {
        const authorized = await (0, rbac_1.assertPortfolioAuthorized)(req, res, [resource.portfolioId], "Resource", resource.id);
        if (!authorized)
            return;
    }
    const request = await prisma_1.prisma.maternityLeaveRequest.create({
        data: {
            resourceId: resource.id,
            initiatedById: req.user.id,
            reason: parsed.data.reason,
        },
    });
    const hrUsers = await prisma_1.prisma.user.findMany({ where: { role: "HR", active: true } });
    for (const hr of hrUsers) {
        await prisma_1.prisma.notification.create({
            data: {
                userId: hr.id,
                type: "ML_APPROVAL_NEEDED",
                message: `${req.user.name} requested maternity leave for ${resource.name} (${resource.employeeId}); HR approval needed.`,
                relatedEntityType: "MaternityLeaveRequest",
                relatedEntityId: request.id,
            },
        });
    }
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "INITIATE_ML",
        entityType: "MaternityLeaveRequest",
        entityId: request.id,
        portfolioId: resource.portfolioId,
        after: request,
    });
    res.status(201).json(request);
});
router.post("/ml/:id/approve", (0, rbac_1.requireRole)("HR"), async (req, res) => {
    const request = await prisma_1.prisma.maternityLeaveRequest.findUnique({ where: { id: req.params.id }, include: { resource: true } });
    if (!request)
        return res.status(404).json({ error: "Request not found" });
    if (request.status !== "PENDING_HR_APPROVAL")
        return res.status(400).json({ error: "Request is not pending approval" });
    const updated = await prisma_1.prisma.maternityLeaveRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", hrApproverId: req.user.id, decidedAt: new Date() },
    });
    await prisma_1.prisma.resource.update({ where: { id: request.resourceId }, data: { status: "ON_ML", subCategory: "ML" } });
    await prisma_1.prisma.maternityLeaveRequest.update({ where: { id: request.id }, data: { status: "COMPLETED" } });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "APPROVE_ML",
        entityType: "MaternityLeaveRequest",
        entityId: request.id,
        portfolioId: request.resource.portfolioId,
        after: updated,
    });
    res.json(updated);
});
router.post("/ml/:id/reject", (0, rbac_1.requireRole)("HR"), async (req, res) => {
    const request = await prisma_1.prisma.maternityLeaveRequest.findUnique({ where: { id: req.params.id }, include: { resource: true } });
    if (!request)
        return res.status(404).json({ error: "Request not found" });
    if (request.status !== "PENDING_HR_APPROVAL")
        return res.status(400).json({ error: "Request is not pending approval" });
    const updated = await prisma_1.prisma.maternityLeaveRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", hrApproverId: req.user.id, decidedAt: new Date() },
    });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "REJECT_ML",
        entityType: "MaternityLeaveRequest",
        entityId: request.id,
        portfolioId: request.resource.portfolioId,
        after: updated,
    });
    res.json(updated);
});
exports.default = router;
