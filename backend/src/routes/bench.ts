import { Router } from "express";
import { prisma } from "../prisma";
import { deriveAllocationSummary, deriveBenchAgingDays, deriveDefaultSubCategory, deriveProjectedBenchStartDate, deriveTaoExperienceYears, deriveTotalYearsExperience } from "../utils/resourcePresentation";

const router = Router();

/**
 * FR-4.2 / FR-6.1 / Workflow 7.4: bench view, split into Committed vs True Bench.
 * Visible org-wide per Section 5.3 row 1 (non-sensitive profile data, no cost/PIP
 * shown here) - matches TA's persona goal of checking bench talent across the org
 * before opening an external requisition. Allocation/reallocation actions on a bench
 * resource reuse POST /api/allocations (FR-4.4), which remains portfolio-gated.
 */
router.get("/", async (req, res) => {
  const { classification } = req.query as Record<string, string | undefined>;
  const where: any = {
    status: classification
      ? { in: classification.split(",") as any }
      : { in: ["BENCH_COMMITTED", "BENCH_TRUE"] },
  };

  const resources = await prisma.resource.findMany({
    where,
    include: {
      portfolio: true,
      skills: { include: { skill: true } },
      allocations: {
        where: { status: "SCHEDULED" },
        orderBy: { startDate: "asc" },
        take: 1,
        include: { project: true },
      },
    },
    orderBy: { benchSince: "asc" },
  });

  const now = new Date();
  const enriched = resources.map((r) => ({
    ...r,
    taoExperienceYears: deriveTaoExperienceYears(r.dateOfJoining),
    totalYearsExperience: deriveTotalYearsExperience(r.priorExperienceYears, r.dateOfJoining),
    daysOnBench: deriveBenchAgingDays(r, now),
    nextScheduledAllocation: r.allocations[0] ?? null,
    projectedBenchStartDate: deriveProjectedBenchStartDate(r.allocations),
    subCategory: deriveDefaultSubCategory({ status: r.status, subCategory: r.subCategory }),
    ...deriveAllocationSummary(r.allocations),
  }));

  res.json(enriched);
});

export default router;
