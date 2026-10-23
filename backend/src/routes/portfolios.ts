import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { writeAudit } from "../utils/audit";
import { AUTHORIZATION_MANAGER_ROLES, requireRole, hasFullPortfolioBypass } from "../middleware/rbac";

const router = Router();

// List portfolios. RMG/HR/Admin see all; others see only their authorized ones.
router.get("/", async (req, res) => {
  const user = req.user!;
  if (hasFullPortfolioBypass(user.role) || user.role === "RMG" || user.role === "HR") {
    const portfolios = await prisma.portfolio.findMany({ orderBy: { name: "asc" } });
    return res.json(portfolios);
  }
  const portfolios = await prisma.portfolio.findMany({
    where: { id: { in: user.authorizedPortfolioIds } },
    orderBy: { name: "asc" },
  });
  res.json(portfolios);
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(1).max(100), code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/).transform((code) => code.toUpperCase()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const portfolio = await prisma.portfolio.create({ data: parsed.data });
  await writeAudit({
    actorId: req.user!.id,
    action: "CREATE_PORTFOLIO",
    entityType: "Portfolio",
    entityId: portfolio.id,
    after: portfolio,
  });
  res.status(201).json(portfolio);
});

// ---- Portfolio authorizations (FR-12.3) ----

router.get("/authorizations", requireRole(...AUTHORIZATION_MANAGER_ROLES), async (_req, res) => {
  const auths = await prisma.portfolioAuthorization.findMany({
    where: { isActive: true },
    include: { user: { select: { id: true, name: true, email: true, role: true } }, portfolio: true },
    orderBy: { grantedAt: "desc" },
  });
  res.json(auths);
});

router.post("/authorizations", requireRole(...AUTHORIZATION_MANAGER_ROLES), async (req, res) => {
  const schema = z.object({ userId: z.string().uuid(), portfolioId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { userId, portfolioId } = parsed.data;

  const existing = await prisma.portfolioAuthorization.findUnique({
    where: { userId_portfolioId: { userId, portfolioId } },
  });

  let auth;
  if (existing) {
    auth = await prisma.portfolioAuthorization.update({
      where: { id: existing.id },
      data: { isActive: true, revokedAt: null, grantedById: req.user!.id, grantedAt: new Date() },
    });
  } else {
    auth = await prisma.portfolioAuthorization.create({
      data: { userId, portfolioId, grantedById: req.user!.id },
    });
  }

  await writeAudit({
    actorId: req.user!.id,
    action: "GRANT_PORTFOLIO_AUTHORIZATION",
    entityType: "PortfolioAuthorization",
    entityId: auth.id,
    portfolioId,
    after: auth,
  });

  res.status(201).json(auth);
});

router.delete("/authorizations/:id", requireRole(...AUTHORIZATION_MANAGER_ROLES), async (req, res) => {
  const auth = await prisma.portfolioAuthorization.findUnique({ where: { id: req.params.id } });
  if (!auth) return res.status(404).json({ error: "Authorization not found" });

  const updated = await prisma.portfolioAuthorization.update({
    where: { id: auth.id },
    data: { isActive: false, revokedAt: new Date() },
  });

  await writeAudit({
    actorId: req.user!.id,
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
  const config = await prisma.benchConfig.findUnique({ where: { portfolioId: req.params.id } });
  const globalConfig = await prisma.benchConfig.findFirst({ where: { portfolioId: null } });
  res.json(
    config ?? globalConfig ?? { committedWindowDays: 14, trueBenchAgingThresholdDays: 30, portfolioId: req.params.id }
  );
});

router.put("/:id/bench-config", requireRole("ADMIN", "RMG"), async (req, res) => {
  const schema = z.object({
    committedWindowDays: z.number().int().min(1),
    trueBenchAgingThresholdDays: z.number().int().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const config = await prisma.benchConfig.upsert({
    where: { portfolioId: req.params.id },
    create: { portfolioId: req.params.id, ...parsed.data },
    update: parsed.data,
  });

  await writeAudit({
    actorId: req.user!.id,
    action: "CONFIGURE_BENCH_THRESHOLDS",
    entityType: "BenchConfig",
    entityId: config.id,
    portfolioId: req.params.id,
    after: config,
  });

  res.json(config);
});

export default router;
