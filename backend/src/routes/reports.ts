import { Router } from "express";
import { prisma } from "../prisma";
import { portfolioReadWhere } from "../utils/scope";
import { getBenchConfig } from "../services/benchService";
import { toCsv } from "../utils/csv";
import { deriveAllocationSummary, deriveBenchAgingDays, deriveTaoExperienceYears, deriveTotalYearsExperience } from "../utils/resourcePresentation";

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

  const byPortfolio = new Map<string, { portfolio: string; available: number; allocated: number; benchCommitted: number; benchTrue: number; onMl: number }>();
  for (const r of resources) {
    const key = r.portfolio.name;
    if (!byPortfolio.has(key)) {
      byPortfolio.set(key, { portfolio: key, available: 0, allocated: 0, benchCommitted: 0, benchTrue: 0, onMl: 0 });
    }
    const entry = byPortfolio.get(key)!;
    if (r.status === "AVAILABLE") entry.available++;
    if (r.status === "ALLOCATED") entry.allocated++;
    if (r.status === "BENCH_COMMITTED") entry.benchCommitted++;
    if (r.status === "BENCH_TRUE") entry.benchTrue++;
    if (r.status === "ON_ML") entry.onMl++;
  }

  respond(req, res, Array.from(byPortfolio.values()), "capacity_report.csv");
});

// FR-10.4: bench aging and termination trend report.
router.get("/bench-aging", async (req, res) => {
  const resources = await prisma.resource.findMany({
    where: { ...portfolioReadWhere(req), status: { in: ["BENCH_COMMITTED", "BENCH_TRUE"] } },
    include: { portfolio: true },
  });

  const now = Date.now();
  const rows = await Promise.all(
    resources.map(async (r) => {
      const config = await getBenchConfig(r.portfolioId);
      const days = r.benchSince ? Math.floor((now - r.benchSince.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return {
        employeeId: r.employeeId,
        name: r.name,
        portfolio: r.portfolio.name,
        managerName: r.managerName,
        subCategory: r.subCategory,
        classification: r.status,
        daysOnBench: deriveBenchAgingDays(r) ?? days,
        agingPastThreshold: r.status === "BENCH_TRUE" && days >= config.trueBenchAgingThresholdDays,
      };
    })
  );

  respond(req, res, rows, "bench_aging_report.csv");
});

router.get("/termination-trends", async (req, res) => {
  const requests = await prisma.terminationRequest.findMany({
    where: { status: "COMPLETED" },
    include: { resource: { include: { portfolio: true } } },
    orderBy: { decidedAt: "desc" },
  });

  const scope = portfolioReadWhere(req);
  const filtered = scope.portfolioId ? requests.filter((r) => scope.portfolioId.in.includes(r.resource.portfolioId)) : requests;

  const rows = filtered.map((r) => ({
    employeeId: r.resource.employeeId,
    name: r.resource.name,
    portfolio: r.resource.portfolio.name,
    reasonCode: r.reasonCode,
    decidedAt: r.decidedAt?.toISOString().slice(0, 10) ?? "",
  }));

  respond(req, res, rows, "termination_trends_report.csv");
});

export default router;
