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
import { writeAudit } from "../utils/audit";
import {
  getAvailableFte,
  getRecommendationStatusTieBreakWeight,
  getRecommendationStatusWeight,
  getLatestPipStatusByResource,
  normalizeMatchText,
  scoreResourceMatch,
} from "../utils/resourceMatching";

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
    managerName,
    certification,
    designation,
    country,
    gender,
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
  if (managerName) where.managerName = { contains: managerName, mode: "insensitive" };
  if (designation) where.designation = { contains: designation, mode: "insensitive" };
  if (country) where.country = { contains: country, mode: "insensitive" };
  if (gender) where.gender = gender;
  if (willingToRelocate !== undefined) where.willingToRelocate = willingToRelocate === "true";
  if (status) where.status = { in: status.split(",") };
  else where.status = { not: "TERMINATED" };
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
  if (certification) {
    where.certifications = { some: { name: { contains: certification, mode: "insensitive" } } };
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
router.get("/recommendations/search", async (req, res, next) => {
  const optionalNumber = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().optional());
  const optionalDate = z.preprocess((value) => value === "" ? undefined : value, z.coerce.date().optional());
  const searchSchema = z.object({
    skills: z.string().min(1, "skills query param is required").transform((value) =>
      Array.from(new Set(value.split(",").map(normalizeMatchText).filter(Boolean)))
    ).refine((values) => values.length > 0, "At least one skill is required"),
    certifications: z.string().optional().transform((value) =>
      Array.from(new Set((value ?? "").split(",").map(normalizeMatchText).filter(Boolean)))
    ),
    minProficiency: optionalNumber.pipe(z.number().int().min(1).max(5).optional()),
    minExperience: optionalNumber.pipe(z.number().min(0).optional()),
    requiredFte: optionalNumber.pipe(z.number().positive().finite().optional()),
    startDate: optionalDate,
    endDate: optionalDate,
    portfolioId: z.string().optional(),
    maxCost: optionalNumber.pipe(z.number().min(0).optional()),
    location: z.string().trim().min(1).optional(),
  }).superRefine((criteria, ctx) => {
    const availabilityParts = [criteria.requiredFte, criteria.startDate, criteria.endDate];
    const specifiedAvailabilityParts = availabilityParts.filter((value) => value !== undefined).length;
    if (specifiedAvailabilityParts !== 0 && specifiedAvailabilityParts !== availabilityParts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "requiredFte, startDate, and endDate must be supplied together",
      });
    }
    if (criteria.startDate && criteria.endDate && criteria.endDate < criteria.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endDate must be on or after startDate" });
    }
  });
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const criteria = parsed.data;
  const availabilityRequested = criteria.requiredFte !== undefined && criteria.startDate !== undefined && criteria.endDate !== undefined;

  const where: any = { status: { not: "TERMINATED" } };
  if (criteria.portfolioId) where.portfolioId = criteria.portfolioId;
  if (criteria.maxCost !== undefined && canEverViewCost(req.user!.role)) where.costRate = { lte: criteria.maxCost };

  const findCandidates = () => prisma.resource.findMany({
    where,
    include: {
      skills: { include: { skill: true } },
      certifications: true,
      portfolio: true,
      ...(availabilityRequested ? {
        allocations: {
          where: {
            status: { in: ["ACTIVE", "SCHEDULED"] },
            startDate: { lte: criteria.endDate },
            OR: [{ endDate: null }, { endDate: { gte: criteria.startDate } }],
          },
          select: { allocationPercent: true, startDate: true, endDate: true },
        },
      } : {}),
    },
  });
  let candidates: Awaited<ReturnType<typeof findCandidates>>;
  try {
    candidates = await findCandidates();
  } catch (error) {
    return next(error);
  }

  const matchingCandidates = candidates.filter((candidate) =>
    criteria.skills.some((skillName) =>
      candidate.skills.some((skill) => normalizeMatchText(skill.skill.name) === skillName)
    )
  );
  const pipVisibleResources = matchingCandidates.filter((candidate) =>
    canViewSensitiveResourceData(req.user!, candidate.portfolioId)
  );
  const pipVisibleResourceIds = new Set(pipVisibleResources.map((candidate) => candidate.id));
  const pipStatusByResourceId = new Map<string, boolean>();
  if (pipVisibleResourceIds.size > 0) {
    try {
      const pipRecords = await prisma.performanceRecord.findMany({
        where: { resourceId: { in: Array.from(pipVisibleResourceIds) } },
        orderBy: [{ reviewDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true, resourceId: true, pipStatus: true, reviewDate: true, createdAt: true },
      });
      for (const [resourceId, pipStatus] of getLatestPipStatusByResource(pipRecords)) {
        pipStatusByResourceId.set(resourceId, pipStatus);
      }
      await writeAudit({
        actorId: req.user!.id,
        action: "SENSITIVE_PIP_INDICATOR_VIEW",
        entityType: "ResourceRecommendation",
        portfolioId: criteria.portfolioId ?? null,
        message: "Authorized-only latest PIP indicators included in resource recommendation response",
      });
    } catch (error) {
      return next(error);
    }
  }

  const ranked = matchingCandidates.map((candidate) => {
    const availableFte = availabilityRequested
      ? getAvailableFte(candidate.allocations, candidate.status, criteria.startDate!, criteria.endDate!)
      : undefined;
    const match = scoreResourceMatch({
      skills: criteria.skills,
      minProficiency: criteria.minProficiency,
      minExperience: criteria.minExperience,
      certifications: criteria.certifications,
      certificationDate: criteria.startDate ?? new Date(),
      location: criteria.location,
      locations: [candidate.workLocation, candidate.location].filter((value): value is string => Boolean(value)),
      willingToRelocate: candidate.willingToRelocate,
      availableFte,
      requiredFte: availabilityRequested ? criteria.requiredFte : undefined,
    }, candidate.skills.map((item) => ({
      name: item.skill.name,
      proficiency: item.proficiency,
      yearsExperience: item.yearsExperience,
    })), candidate.certifications);
    const statusWeight = getRecommendationStatusWeight(candidate.status);
    const { allocations: _allocations, ...candidateWithoutAllocations } = candidate;
    return {
      resource: presentResource(redactCost(candidateWithoutAllocations, req.user!)),
      matchCount: match.matchedSkills.length,
      matchedSkills: match.matchedSkills,
      statusWeight,
      statusOrderWeight: getRecommendationStatusTieBreakWeight(candidate.status),
      score: match.matchedSkills.length * 10 + statusWeight,
      matchScore: match.matchScore,
      components: match.components,
      ...(pipVisibleResourceIds.has(candidate.id)
        ? { pipStatus: pipStatusByResourceId.get(candidate.id) ?? null }
        : {}),
      ...(availableFte !== undefined ? { availableFte } : {}),
    };
  }).sort((a, b) =>
    b.matchScore - a.matchScore ||
    b.statusOrderWeight - a.statusOrderWeight ||
    (normalizeMatchText(a.resource.name) < normalizeMatchText(b.resource.name) ? -1
      : normalizeMatchText(a.resource.name) > normalizeMatchText(b.resource.name) ? 1
        : a.resource.id < b.resource.id ? -1
          : a.resource.id > b.resource.id ? 1 : 0)
  ).map(({ statusOrderWeight: _statusOrderWeight, ...recommendation }) => recommendation);

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

router.patch("/:id", requireRole("ADMIN", "RMG"), async (req, res, next) => {
  const parsed = updateResourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { skillIds, certifications, performanceRecords, ...resourceData } = parsed.data;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.resource.findUnique({
        where: { id: req.params.id },
        include: {
          skills: { include: { skill: true } },
          certifications: true,
          performanceRecords: { orderBy: { reviewDate: "desc" } },
        },
      });
      if (!before) return null;

      await tx.resource.update({ where: { id: before.id }, data: resourceData as any });

      if (skillIds) {
        await tx.resourceSkill.deleteMany({ where: { resourceId: before.id } });
        for (const skillInput of skillIds) {
          const skill = await tx.skill.upsert({ where: { name: skillInput.name }, create: { name: skillInput.name }, update: {} });
          await tx.resourceSkill.create({
            data: {
              resourceId: before.id,
              skillId: skill.id,
              proficiency: skillInput.proficiency,
              yearsExperience: roundOneDecimal(skillInput.yearsExperience),
            },
          });
        }
      }

      if (certifications) {
        await tx.certification.deleteMany({ where: { resourceId: before.id } });
        if (certifications.length > 0) {
          await tx.certification.createMany({
            data: certifications.map((c) => ({
              resourceId: before.id,
              name: c.name,
              issuer: c.issuer ?? null,
              issueDate: c.issueDate ? new Date(c.issueDate) : null,
            })),
          });
        }
      }

      if (performanceRecords) {
        await tx.performanceRecord.deleteMany({ where: { resourceId: before.id } });
        if (performanceRecords.length > 0) {
          await tx.performanceRecord.createMany({
            data: performanceRecords.map((p) => ({
              resourceId: before.id,
              rating: p.rating,
              pipStatus: p.pipStatus,
              reviewDate: new Date(p.reviewDate),
              notes: p.notes ?? null,
            })),
          });
        }
      }

      const after = await tx.resource.findUnique({
        where: { id: before.id },
        include: {
          skills: { include: { skill: true } },
          certifications: true,
          performanceRecords: { orderBy: { reviewDate: "desc" } },
        },
      });
      await writeAudit({
        actorId: req.user!.id,
        action: "UPDATE_RESOURCE_PROFILE",
        entityType: "Resource",
        entityId: before.id,
        portfolioId: before.portfolioId,
        before,
        after,
      }, tx);
      return tx.resource.findUnique({
        where: { id: before.id },
        include: {
          portfolio: true,
          skills: { include: { skill: true } },
          certifications: true,
          performanceRecords: { orderBy: { reviewDate: "desc" } },
          allocations: { include: { project: true, task: true }, orderBy: { startDate: "desc" } },
        },
      });
    });

    if (!updated) return res.status(404).json({ error: "Resource not found" });
    res.json(presentResource(redactCost(updated, req.user!)));
  } catch (error) {
    return next(error);
  }
});

export default router;
