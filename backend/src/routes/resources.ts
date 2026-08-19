import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { canEverViewCost, canViewSensitiveResourceData, requireRole } from "../middleware/rbac";
import {
  deriveAllocationSummary,
  deriveBenchAgingDays,
  deriveDefaultSubCategory,
  deriveProjectedBenchStartDate,
  deriveTaoExperienceYears,
  deriveTotalYearsExperience,
  roundOneDecimal,
} from "../utils/resourcePresentation";

const router = Router();

/** Redacts costRate for a resource the caller isn't authorized to view cost/comp for (Section 5.3). */
function redactCost<T extends { portfolioId: string; costRate: unknown }>(resource: T, user: any): T {
  if (canViewSensitiveResourceData(user, resource.portfolioId)) return resource;
  return { ...resource, costRate: null };
}

function presentResource<T extends {
  status: string;
  subCategory: string | null;
  dateOfJoining?: Date | null;
  priorExperienceYears?: number | null;
  benchSince?: Date | null;
  allocations?: Array<{ allocationPercent: number; status: string; startDate: Date; endDate: Date | null; project?: { isInternalProject?: boolean; billingDelayed?: boolean } | null }>;
}>(resource: T) {
  const allocations = resource.allocations ?? [];
  const allocationSummary = deriveAllocationSummary(allocations as any);
  const firstActiveProject = allocations.find((a) => a.status === "ACTIVE")?.project;
  return {
    ...resource,
    taoExperienceYears: deriveTaoExperienceYears(resource.dateOfJoining ?? null),
    totalYearsExperience: deriveTotalYearsExperience(resource.priorExperienceYears ?? 0, resource.dateOfJoining ?? null),
    daysOnBench: deriveBenchAgingDays(resource as any),
    projectedBenchStartDate: deriveProjectedBenchStartDate(allocations as any),
    subCategory: deriveDefaultSubCategory(
      { status: resource.status as any, subCategory: resource.subCategory },
      { isInternalProject: firstActiveProject?.isInternalProject, billingDelayed: firstActiveProject?.billingDelayed }
    ),
    ...allocationSummary,
  };
}

/**
 * FR-1.2 / FR-8.2: search & filter across resource attributes (skill, experience,
 * cost, location, availability/status, portfolio, relocation willingness).
 *
 * Section 5.3: non-sensitive resource profile fields (name, skills, certifications,
 * location, status) are visible to every role across every portfolio - only cost and
 * performance/PIP are restricted, and that restriction is applied per-field below
 * rather than by hiding the whole resource.
 */
router.get("/", async (req, res) => {
  const {
    q,
    skills, // comma-separated skill names
    minExperience,
    maxCost,
    minCost,
    location,
    status, // comma-separated ResourceStatus values
    portfolioId,
    willingToRelocate,
    page = "1",
    pageSize = "25",
  } = req.query as Record<string, string | undefined>;

  const where: any = {};

  if (portfolioId) where.portfolioId = portfolioId;
  if (location) where.location = { contains: location, mode: "insensitive" };
  if (willingToRelocate !== undefined) where.willingToRelocate = willingToRelocate === "true";
  if (status) where.status = { in: status.split(",") };
  // Cost-range filtering is only meaningful for roles that can ever see cost data;
  // for everyone else it would act as a blind oracle on a field they can't view.
  if ((minCost || maxCost) && canEverViewCost(req.user!.role)) {
    where.costRate = {};
    if (minCost) where.costRate.gte = Number(minCost);
    if (maxCost) where.costRate.lte = Number(maxCost);
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { employeeId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (skills) {
    const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillList.length > 0) {
      where.skills = { some: { skill: { name: { in: skillList } } } };
    }
  }
  if (minExperience) {
    where.skills = {
      ...(where.skills ?? {}),
      some: { ...(where.skills?.some ?? {}), yearsExperience: { gte: Number(minExperience) } },
    };
  }

  const take = Math.min(Number(pageSize) || 25, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [total, resources] = await Promise.all([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      include: {
        portfolio: true,
        skills: { include: { skill: true } },
        certifications: true,
        allocations: {
          where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
          include: { project: true },
        },
      },
      orderBy: { name: "asc" },
      take,
      skip,
    }),
  ]);

  const redacted = resources.map((r) => redactCost(r, req.user!));
  const presented = redacted.map((r) => presentResource(r));

  res.json({ total, page: Number(page), pageSize: take, resources: presented });
});

router.get("/:id", async (req, res) => {
  const resource = await prisma.resource.findUnique({
    where: { id: req.params.id },
    include: {
      portfolio: true,
      skills: { include: { skill: true } },
      certifications: true,
      allocations: {
        include: { project: true, task: true },
        orderBy: { startDate: "desc" },
      },
      performanceRecords: { orderBy: { reviewDate: "desc" } },
    },
  });
  if (!resource) return res.status(404).json({ error: "Resource not found" });

  // Section 5.3 row 1: non-sensitive profile visibility is universal, no portfolio gate.
  const sensitiveAllowed = canViewSensitiveResourceData(req.user!, resource.portfolioId);
  const response: any = presentResource({ ...resource, costRate: sensitiveAllowed ? resource.costRate : null });
  if (!sensitiveAllowed) delete response.performanceRecords;

  res.json(response);
});

/**
 * FR-8.1: skill-based resource recommendations. Prioritizes Available / Bench
 * resources over Allocated ones (an allocated resource is still surfaced but ranked lower),
 * matching on the requested skill set. Visible org-wide per Section 5.3 row 1; cost is
 * redacted per the same rule as the main list/detail endpoints.
 */
router.get("/recommendations/search", async (req, res) => {
  const { skills, portfolioId, maxCost, location } = req.query as Record<string, string | undefined>;
  const skillList = (skills ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (skillList.length === 0) return res.status(400).json({ error: "skills query param is required" });

  const where: any = {
    status: { not: "TERMINATED" },
    skills: { some: { skill: { name: { in: skillList } } } },
  };
  if (portfolioId) where.portfolioId = portfolioId;
  if (location) where.location = { contains: location, mode: "insensitive" };
  if (maxCost && canEverViewCost(req.user!.role)) where.costRate = { lte: Number(maxCost) };

  const candidates = await prisma.resource.findMany({
    where,
    include: { skills: { include: { skill: true } }, portfolio: true },
  });

  const ranked = candidates
    .map((r) => {
      const matchedSkills = r.skills.filter((s) => skillList.includes(s.skill.name));
      const statusWeight = r.status === "AVAILABLE" ? 3 : r.status === "BENCH_TRUE" ? 2 : r.status === "BENCH_COMMITTED" ? 1 : 0;
        return {
          resource: presentResource(redactCost(r, req.user!)),
          matchCount: matchedSkills.length,
          matchedSkills: matchedSkills.map((s) => s.skill.name),
          statusWeight,
        score: matchedSkills.length * 10 + statusWeight,
      };
    })
    .sort((a, b) => b.score - a.score);

  res.json(ranked);
});

const updateResourceSchema = z.object({
  managerName: z.string().min(1).optional(),
  designation: z.string().min(1).optional(),
  subCategory: z.string().nullable().optional(),
  gender: z.enum(["FEMALE", "MALE", "OTHER", "UNDISCLOSED"]).optional(),
  country: z.string().nullable().optional(),
  workLocation: z.string().nullable().optional(),
  location: z.string().min(1).optional(),
  dateOfJoining: z.coerce.date().nullable().optional(),
  priorExperienceYears: z.number().min(0).optional(),
  costRate: z.number().min(0).optional(),
  skillIds: z.array(z.object({ name: z.string().min(1), proficiency: z.number().int().min(1).max(5), yearsExperience: z.number().min(0) })).optional(),
  certifications: z.array(z.object({ name: z.string().min(1), issuer: z.string().nullable().optional(), issueDate: z.string().nullable().optional() })).optional(),
  performanceRecords: z.array(z.object({ rating: z.string().min(1), pipStatus: z.boolean(), reviewDate: z.string(), notes: z.string().nullable().optional() })).optional(),
});

router.patch("/:id", requireRole("ADMIN", "RMG"), async (req, res) => {
  const parsed = updateResourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const resource = await prisma.resource.findUnique({ where: { id: req.params.id } });
  if (!resource) return res.status(404).json({ error: "Resource not found" });

  const { skillIds, certifications, performanceRecords, ...resourceData } = parsed.data;
  await prisma.resource.update({ where: { id: resource.id }, data: resourceData as any });

  if (skillIds) {
    await prisma.resourceSkill.deleteMany({ where: { resourceId: resource.id } });
    for (const skillInput of skillIds) {
      const skill = await prisma.skill.upsert({ where: { name: skillInput.name }, create: { name: skillInput.name }, update: {} });
      await prisma.resourceSkill.create({
        data: {
          resourceId: resource.id,
          skillId: skill.id,
          proficiency: skillInput.proficiency,
          yearsExperience: roundOneDecimal(skillInput.yearsExperience),
        },
      });
    }
  }

  if (certifications) {
    await prisma.certification.deleteMany({ where: { resourceId: resource.id } });
    if (certifications.length > 0) {
      await prisma.certification.createMany({
        data: certifications.map((c) => ({
          resourceId: resource.id,
          name: c.name,
          issuer: c.issuer ?? null,
          issueDate: c.issueDate ? new Date(c.issueDate) : null,
        })),
      });
    }
  }

  if (performanceRecords) {
    await prisma.performanceRecord.deleteMany({ where: { resourceId: resource.id } });
    if (performanceRecords.length > 0) {
      await prisma.performanceRecord.createMany({
        data: performanceRecords.map((p) => ({
          resourceId: resource.id,
          rating: p.rating,
          pipStatus: p.pipStatus,
          reviewDate: new Date(p.reviewDate),
          notes: p.notes ?? null,
        })),
      });
    }
  }

  const updated = await prisma.resource.findUnique({
    where: { id: resource.id },
    include: {
      portfolio: true,
      skills: { include: { skill: true } },
      certifications: true,
      performanceRecords: { orderBy: { reviewDate: "desc" } },
      allocations: { include: { project: true, task: true }, orderBy: { startDate: "desc" } },
    },
  });

  res.json(presentResource(redactCost(updated!, req.user!)));
});

export default router;
