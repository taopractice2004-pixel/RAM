import { Router } from "express";
import { prisma } from "../prisma";
import { canViewSensitiveResourceData } from "../middleware/rbac";
import { deriveAllocationSummary, deriveBenchAgingDays, deriveBenchSubCategory, deriveProjectedBenchStartDate, deriveTaoExperienceYears, deriveTotalYearsExperience } from "../utils/resourcePresentation";

const router = Router();

/**
 * FR-4.2 / FR-6.1 / Workflow 7.4: bench view, split into Committed vs True Bench.
 * Visible org-wide per Section 5.3 row 1 (non-sensitive profile data, no cost/PIP
 * shown here) - matches TA's persona goal of checking bench talent across the org
 * before opening an external requisition. Allocation/reallocation actions on a bench
 * resource reuse POST /api/allocations (FR-4.4), which remains portfolio-gated.
 */
router.get("/", async (req, res) => {
  const { classification, status, subCategory, managerName, portfolioId, location, country, skill, minExperience, minTaoExperience, minAge, maxAge } = req.query as Record<string, string | undefined>;
  const where: any = classification
    ? { status: { in: classification.split(",") as any } }
    : {
        OR: [
          { status: { in: ["BENCH_COMMITTED", "BENCH_TRUE", "ON_ML"] } },
          { allocations: { some: { status: { in: ["ACTIVE", "SCHEDULED"] }, project: { billingDelayed: true } } } },
          { subCategory: { in: ["Proactive hire", "Proactive Hire"] } },
        ],
      };
  if (status) where.status = { in: status.split(",") };
  if (managerName) where.managerName = { contains: managerName, mode: "insensitive" };
  if (portfolioId) where.portfolioId = portfolioId;
  if (country) where.country = { contains: country, mode: "insensitive" };
  if (skill) where.skills = { some: { skill: { name: { contains: skill, mode: "insensitive" } } } };
  if (minExperience) where.priorExperienceYears = { gte: Number(minExperience) };
  if (minTaoExperience) {
    where.dateOfJoining = { lte: new Date(Date.now() - Number(minTaoExperience) * 365.25 * 24 * 60 * 60 * 1000) };
  }
  if (minAge || maxAge) {
    const now = Date.now();
    where.benchSince = {
      ...(minAge ? { lte: new Date(now - Number(minAge) * 24 * 60 * 60 * 1000) } : {}),
      ...(maxAge ? { gte: new Date(now - Number(maxAge) * 24 * 60 * 60 * 1000) } : {}),
    };
  }
  if (location) {
    const locationFilter = { OR: [{ location: { contains: location, mode: "insensitive" } }, { workLocation: { contains: location, mode: "insensitive" } }] };
    if (where.OR) where.AND = [locationFilter];
    else Object.assign(where, locationFilter);
  }

  const resources = await prisma.resource.findMany({
    where,
    include: {
      portfolio: true,
      skills: { include: { skill: true } },
      allocations: {
        where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
        orderBy: [{ status: "asc" }, { startDate: "asc" }],
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
    nextScheduledAllocation: r.allocations.find((allocation) => allocation.status === "SCHEDULED") ?? null,
    projectedBenchStartDate: deriveProjectedBenchStartDate(r.allocations),
    subCategory: deriveBenchSubCategory(r, now),
    role: r.designation,
    costRate: canViewSensitiveResourceData(req.user!, r.portfolioId) ? r.costRate : null,
    ...deriveAllocationSummary(r.allocations),
  })).filter((resource) => !subCategory || resource.subCategory?.toLocaleLowerCase() === subCategory.toLocaleLowerCase());

  res.json(enriched);
});

export default router;
