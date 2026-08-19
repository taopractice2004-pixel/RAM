import { Router } from "express";
import { prisma } from "../prisma";
import { portfolioReadWhere } from "../utils/scope";
import { getBenchConfig } from "../services/benchService";

const router = Router();

/**
 * Section 6.1 / MVP 9.1 Core Dashboard: capacity, utilization, and allocation state
 * (Allocated / Bench-Committed / Bench-True / Terminated) by resource and project,
 * scoped to each viewer's portfolio authorization. Billable/non-billable ratio and
 * profitability are out of MVP scope (Phase 3/4 time-tracking & profitability reporting).
 */
router.get("/", async (req, res) => {
  const where = portfolioReadWhere(req);

  const [statusCounts, portfolios, allocations, resources] = await Promise.all([
    prisma.resource.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.portfolio.findMany({ where: where.portfolioId ? { id: where.portfolioId } : {} }),
    prisma.allocation.findMany({ where: { status: "ACTIVE", ...portfolioReadWhere(req, "portfolioId") } }),
    prisma.resource.findMany({ where, select: { id: true, status: true, portfolioId: true, benchSince: true } }),
  ]);

  const totalActive = resources.filter((r) => r.status !== "TERMINATED").length;
  const allocatedCount = resources.filter((r) => r.status === "ALLOCATED").length;
  const utilizationRate = totalActive > 0 ? Math.round((allocatedCount / totalActive) * 1000) / 10 : 0;

  const byPortfolio = await Promise.all(
    portfolios.map(async (p) => {
      const portfolioResources = resources.filter((r) => r.portfolioId === p.id);
      const total = portfolioResources.filter((r) => r.status !== "TERMINATED").length;
      const allocated = portfolioResources.filter((r) => r.status === "ALLOCATED").length;
      const benchCommitted = portfolioResources.filter((r) => r.status === "BENCH_COMMITTED").length;
      const benchTrue = portfolioResources.filter((r) => r.status === "BENCH_TRUE").length;
      const onMl = portfolioResources.filter((r) => r.status === "ON_ML").length;
      const config = await getBenchConfig(p.id);
      const agingTrueBench = portfolioResources.filter(
        (r) =>
          r.status === "BENCH_TRUE" &&
          r.benchSince &&
          (Date.now() - r.benchSince.getTime()) / (1000 * 60 * 60 * 24) >= config.trueBenchAgingThresholdDays
      ).length;

      return {
        portfolioId: p.id,
        portfolioName: p.name,
        totalActiveResources: total,
        allocated,
        benchCommitted,
        benchTrue,
        onMl,
        agingTrueBench,
        utilizationRate: total > 0 ? Math.round((allocated / total) * 1000) / 10 : 0,
      };
    })
  );

  res.json({
    statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    totalActiveResources: totalActive,
    utilizationRate,
    activeAllocationsCount: allocations.length,
    byPortfolio,
  });
});

export default router;
