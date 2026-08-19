"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const audit_1 = require("../utils/audit");
const rbac_1 = require("../middleware/rbac");
const router = (0, express_1.Router)();
// List portfolios. RMG/HR/Admin see all; others see only their authorized ones.
router.get("/", async (req, res) => {
    const user = req.user;
    if ((0, rbac_1.hasFullPortfolioBypass)(user.role) || user.role === "RMG" || user.role === "HR") {
        const portfolios = await prisma_1.prisma.portfolio.findMany({ orderBy: { name: "asc" } });
        return res.json(portfolios);
    }
    const portfolios = await prisma_1.prisma.portfolio.findMany({
        where: { id: { in: user.authorizedPortfolioIds } },
        orderBy: { name: "asc" },
    });
    res.json(portfolios);
});
router.post("/", (0, rbac_1.requireRole)("ADMIN"), async (req, res) => {
    const schema = zod_1.z.object({ name: zod_1.z.string().min(1), code: zod_1.z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const portfolio = await prisma_1.prisma.portfolio.create({ data: parsed.data });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "CREATE_PORTFOLIO",
        entityType: "Portfolio",
        entityId: portfolio.id,
        after: portfolio,
    });
    res.status(201).json(portfolio);
});
// ---- Portfolio authorizations (FR-12.3) ----
router.get("/authorizations", (0, rbac_1.requireRole)(...rbac_1.AUTHORIZATION_MANAGER_ROLES), async (_req, res) => {
    const auths = await prisma_1.prisma.portfolioAuthorization.findMany({
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true, role: true } }, portfolio: true },
        orderBy: { grantedAt: "desc" },
    });
    res.json(auths);
});
router.post("/authorizations", (0, rbac_1.requireRole)(...rbac_1.AUTHORIZATION_MANAGER_ROLES), async (req, res) => {
    const schema = zod_1.z.object({ userId: zod_1.z.string().uuid(), portfolioId: zod_1.z.string().uuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { userId, portfolioId } = parsed.data;
    const existing = await prisma_1.prisma.portfolioAuthorization.findUnique({
        where: { userId_portfolioId: { userId, portfolioId } },
    });
    let auth;
    if (existing) {
        auth = await prisma_1.prisma.portfolioAuthorization.update({
            where: { id: existing.id },
            data: { isActive: true, revokedAt: null, grantedById: req.user.id, grantedAt: new Date() },
        });
    }
    else {
        auth = await prisma_1.prisma.portfolioAuthorization.create({
            data: { userId, portfolioId, grantedById: req.user.id },
        });
    }
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "GRANT_PORTFOLIO_AUTHORIZATION",
        entityType: "PortfolioAuthorization",
        entityId: auth.id,
        portfolioId,
        after: auth,
    });
    res.status(201).json(auth);
});
router.delete("/authorizations/:id", (0, rbac_1.requireRole)(...rbac_1.AUTHORIZATION_MANAGER_ROLES), async (req, res) => {
    const auth = await prisma_1.prisma.portfolioAuthorization.findUnique({ where: { id: req.params.id } });
    if (!auth)
        return res.status(404).json({ error: "Authorization not found" });
    const updated = await prisma_1.prisma.portfolioAuthorization.update({
        where: { id: auth.id },
        data: { isActive: false, revokedAt: new Date() },
    });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "REVOKE_PORTFOLIO_AUTHORIZATION",
        entityType: "PortfolioAuthorization",
        entityId: auth.id,
        portfolioId: auth.portfolioId,
        before: auth,
        after: updated,
    });
    res.json(updated);
});
// ---- Bench thresholds (Section 5.3 "Configure thresholds") ----
router.get("/:id/bench-config", async (req, res) => {
    const config = await prisma_1.prisma.benchConfig.findUnique({ where: { portfolioId: req.params.id } });
    const globalConfig = await prisma_1.prisma.benchConfig.findFirst({ where: { portfolioId: null } });
    res.json(config ?? globalConfig ?? { committedWindowDays: 14, trueBenchAgingThresholdDays: 30, portfolioId: req.params.id });
});
router.put("/:id/bench-config", (0, rbac_1.requireRole)("ADMIN", "RMG"), async (req, res) => {
    const schema = zod_1.z.object({
        committedWindowDays: zod_1.z.number().int().min(1),
        trueBenchAgingThresholdDays: zod_1.z.number().int().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const config = await prisma_1.prisma.benchConfig.upsert({
        where: { portfolioId: req.params.id },
        create: { portfolioId: req.params.id, ...parsed.data },
        update: parsed.data,
    });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "CONFIGURE_BENCH_THRESHOLDS",
        entityType: "BenchConfig",
        entityId: config.id,
        portfolioId: req.params.id,
        after: config,
    });
    res.json(config);
});
exports.default = router;
