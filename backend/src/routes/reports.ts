import { Router } from "express";
import { prisma } from "../prisma";
import { canViewSensitiveResourceData } from "../middleware/rbac";
import { portfolioReadWhere } from "../utils/scope";
import { getBenchConfig } from "../services/benchService";
import { toCsv } from "../utils/csv";
import { deriveAllocationSummary, deriveBenchAgingDays, deriveTaoExperienceYears, deriveTotalYearsExperience } from "../utils/resourcePresentation";
import { buildForecastBuckets } from "../utils/forecast";

const router = Router();

function respond(req: any, res: any, rows: Record<string, unknown>[], filename: string) {
  const format = (req.query.format as string) || "json";
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(toCsv(rows));
  }
  res.json(rows);
}

// FR-10.1: utilization report by resource / project / department, incl. allocation history.
router.get("/utilization", async (req, res) => {
  const resources = await prisma.resource.findMany({
    where: portfolioReadWhere(req),
    include: {
      portfolio: true,
      allocations: { include: { project: true }, orderBy: { startDate: "desc" } },
    },
  });

  const rows = resources.map((r) => {
    const allocationSummary = deriveAllocationSummary(r.allocations);
    return {
      employeeId: r.employeeId,
      name: r.name,
      portfolio: r.portfolio.name,
      managerName: r.managerName,
      designation: r.designation,
      country: r.country,
      workLocation: r.workLocation,
      subCategory: r.subCategory,
      status: r.status,
      taoExperienceYears: deriveTaoExperienceYears(r.dateOfJoining),
      totalYearsExperience: deriveTotalYearsExperience(r.priorExperienceYears, r.dateOfJoining),
      currentAllocationPercent: allocationSummary.totalAllocatedPercent,
      availablePercentForDeployment: allocationSummary.availablePercentForDeployment,
      overallFte: allocationSummary.overallFte,
      empCount: allocationSummary.empCount,
      activeProjects: r.allocations.filter((a) => a.status === "ACTIVE").map((a) => a.project.name).join("; "),
      totalAllocationsEver: r.allocations.length,
      lastAllocationStart: r.allocations[0]?.startDate?.toISOString().slice(0, 10) ?? "",
    };
  });

  respond(req, res, rows, "utilization_report.csv");
});

// FR-10.3: basic capacity planning - current supply distribution by portfolio/status.
router.get("/capacity", async (req, res) => {
  const resources = await prisma.resource.findMany({
    where: { ...portfolioReadWhere(req), status: { not: "TERMINATED" } },
    include: { portfolio: true, skills: { include: { skill: true } } },
  });

  const byPortfolio = new Map<string, { portfolio: string; allocated: number; benchCommitted: number; benchTrue: number; onMl: number }>();
  for (const r of resources) {
    const key = r.portfolio.name;
    if (!byPortfolio.has(key)) {
      byPortfolio.set(key, { portfolio: key, allocated: 0, benchCommitted: 0, benchTrue: 0, onMl: 0 });
    }
    const entry = byPortfolio.get(key)!;
    if (r.status === "ALLOCATED") entry.allocated++;
    if (r.status === "BENCH_COMMITTED") entry.benchCommitted++;
    if (r.status === "BENCH_TRUE") entry.benchTrue++;
    if (r.status === "ON_ML") entry.onMl++;
  }

  respond(req, res, Array.from(byPortfolio.values()), "capacity_report.csv");
});

router.get("/forecast", async (req, res) => {
  const scope = portfolioReadWhere(req);

  const [resources, demandRequests] = await Promise.all([
    prisma.resource.findMany({
      where: { ...scope, status: { notIn: ["TERMINATED", "ON_ML"] } },
      include: {
        allocations: {
          where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
          select: {
            status: true,
            startDate: true,
            endDate: true,
            allocationPercent: true,
          },
        },
      },
    }),
    prisma.demandRequest.findMany({
      where: { ...scope, status: { in: ["DRAFT", "PIPELINE", "COMMITTED", "FULFILLED", "CANCELLED"] } },
      select: {
        id: true,
        status: true,
        requiredFte: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  const rows = buildForecastBuckets({
    resources,
    demandRequests,
    startDate: new Date(),
    horizonWeeks: 26,
  });

  respond(req, res, rows, "forecast_report.csv");
});

// FR-10.4: bench aging and termination trend report.
router.get("/bench-aging", async (req, res) => {
  const { portfolioId, status, minDays, maxDays, from, to, summary } = req.query as Record<string, string | undefined>;

  const resources = await prisma.resource.findMany({
    where: {
      ...portfolioReadWhere(req),
      ...(portfolioId ? { portfolioId } : {}),
      ...(status ? { status: status as any } : { status: { in: ["BENCH_COMMITTED", "BENCH_TRUE"] } }),
    },
    include: { portfolio: true },
  });

  const now = Date.now();
  const rows = await Promise.all(
    resources.map(async (r) => {
      const config = await getBenchConfig(r.portfolioId);
      const days = r.benchSince ? Math.floor((now - r.benchSince.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const benchDays = deriveBenchAgingDays(r) ?? days;
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      const benchSince = r.benchSince ?? new Date();

      if (minDays && benchDays < Number(minDays)) return null;
      if (maxDays && benchDays > Number(maxDays)) return null;
      if (fromDate && benchSince < fromDate) return null;
      if (toDate && benchSince > toDate) return null;

      return {
        employeeId: r.employeeId,
        name: r.name,
        portfolio: r.portfolio.name,
        managerName: r.managerName,
        subCategory: r.subCategory,
        classification: r.status,
        daysOnBench: benchDays,
        agingPastThreshold: r.status === "BENCH_TRUE" && days >= config.trueBenchAgingThresholdDays,
        benchSince: benchSince.toISOString().slice(0, 10),
      };
    })
  );

  const filteredRows = rows.filter(Boolean) as Record<string, unknown>[];
  if (summary === "true") {
    const byClassification = filteredRows.reduce((acc: Record<string, number>, row) => {
      const classification = String(row.classification ?? "UNKNOWN");
      acc[classification] = (acc[classification] ?? 0) + 1;
      return acc;
    }, {});
    const avgDays = filteredRows.length === 0 ? 0 : filteredRows.reduce((sum, row) => sum + Number(row.daysOnBench ?? 0), 0) / filteredRows.length;

    return res.json({
      summary: {
        totalRows: filteredRows.length,
        averageDaysOnBench: Number(avgDays.toFixed(2)),
        byClassification,
        agingThresholdExceeded: filteredRows.filter((row) => row.agingPastThreshold === true).length,
      },
      rows: filteredRows,
    });
  }

  respond(req, res, filteredRows, "bench_aging_report.csv");
});

router.get("/bench-pivots", async (req, res) => {
  const resources = await prisma.resource.findMany({
    where: {
      ...portfolioReadWhere(req),
      OR: [
        { status: { in: ["BENCH_COMMITTED", "BENCH_TRUE", "ON_ML"] } },
        { allocations: { some: { status: { in: ["ACTIVE", "SCHEDULED"] }, project: { billingDelayed: true } } } },
        { subCategory: { in: ["Proactive hire", "Proactive Hire"] } },
      ],
    },
    include: { portfolio: true },
  });

  const costAllowed = resources.some((resource) => canViewSensitiveResourceData(req.user!, resource.portfolioId));
  const categories = ["Bench (Allocated <60)", "Billing Delay", "Committed Bench", "Corporate Bench", "ML", "Proactive Hire", "Termination"];
  const managers = new Map<string, { manager: string; counts: Record<string, number>; costs: Record<string, number>; totalCount: number; totalCost: number }>();
  for (const resource of resources) {
    const manager = resource.managerName || "Unassigned";
    const row = managers.get(manager) ?? { manager, counts: {}, costs: {}, totalCount: 0, totalCost: 0 };
    const category = resource.subCategory || "Committed Bench";
    row.counts[category] = (row.counts[category] ?? 0) + 1;
    row.totalCount++;
    if (canViewSensitiveResourceData(req.user!, resource.portfolioId) && resource.costRate != null) {
      const cost = Number(resource.costRate);
      row.costs[category] = (row.costs[category] ?? 0) + cost;
      row.totalCost += cost;
    }
    managers.set(manager, row);
  }
  const countRows: Record<string, string | number>[] = [...managers.values()].map((row) => ({ manager: row.manager, ...Object.fromEntries(categories.map((category) => [category, row.counts[category] ?? 0])), grandTotal: row.totalCount }));
  const countGrand = Object.fromEntries(categories.map((category) => [category, countRows.reduce((sum, row) => sum + Number(row[category] ?? 0), 0)]));
  countRows.push({ manager: "Grand Total", ...countGrand, grandTotal: countRows.reduce((sum, row) => sum + Number(row.grandTotal ?? 0), 0) });
  const costRows: Record<string, string | number>[] = costAllowed ? [...managers.values()].map((row) => ({ manager: row.manager, ...Object.fromEntries(categories.map((category) => [category, row.costs[category] ?? 0])), grandTotal: row.totalCost })) : [];
  if (costAllowed) costRows.push({ manager: "Grand Total", ...Object.fromEntries(categories.map((category) => [category, costRows.reduce((sum, row) => sum + Number(row[category] ?? 0), 0)])), grandTotal: costRows.reduce((sum, row) => sum + Number(row.grandTotal ?? 0), 0) });
  res.json({ categories, countRows, costRows, costVisible: costAllowed });
});

router.get("/termination-trends", async (req, res) => {
  const { portfolioId, status, reasonCode, from, to, summary } = req.query as Record<string, string | undefined>;

  const requests = await prisma.terminationRequest.findMany({
    where: {
      ...(status ? { status: status as any } : { status: "COMPLETED" }),
      ...(reasonCode ? { reasonCode } : {}),
      ...(from || to ? {
        decidedAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      } : {}),
    },
    include: { resource: { include: { portfolio: true } } },
    orderBy: { decidedAt: "desc" },
  });

  const scope = portfolioReadWhere(req);
  const filtered = scope.portfolioId ? requests.filter((r) => scope.portfolioId.in.includes(r.resource.portfolioId)) : requests;
  const filteredByPortfolio = portfolioId ? filtered.filter((r) => r.resource.portfolioId === portfolioId) : filtered;

  const rows = filteredByPortfolio.map((r) => ({
    employeeId: r.resource.employeeId,
    name: r.resource.name,
    portfolio: r.resource.portfolio.name,
    status: r.status,
    reasonCode: r.reasonCode,
    decidedAt: r.decidedAt?.toISOString().slice(0, 10) ?? "",
  }));

  if (summary === "true") {
    const byReason = rows.reduce((acc: Record<string, number>, row) => {
      const reason = String(row.reasonCode ?? "UNKNOWN");
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});

    return res.json({
      summary: {
        totalRows: rows.length,
        byReason,
        byStatus: rows.reduce((acc: Record<string, number>, row) => {
          const state = String(row.status ?? "UNKNOWN");
          acc[state] = (acc[state] ?? 0) + 1;
          return acc;
        }, {}),
      },
      rows,
    });
  }

  respond(req, res, rows, "termination_trends_report.csv");
});

export default router;
