import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { assertPortfolioAuthorized, requireRole, LIFECYCLE_ACTION_ROLES } from "../middleware/rbac";
import { checkCapacity, notifyPortfolioStakeholders } from "../services/allocationService";
import { reclassifyResourceBenchStatus } from "../services/benchService";
import { writeAudit } from "../utils/audit";
import { portfolioReadWhere } from "../utils/scope";
import { deriveDefaultSubCategory } from "../utils/resourcePresentation";

const router = Router();

router.get("/", async (req, res) => {
  const { resourceId, projectId, status } = req.query as Record<string, string | undefined>;
  const where: any = { ...portfolioReadWhere(req, "portfolioId") };
  if (resourceId) where.resourceId = resourceId;
  if (projectId) where.projectId = projectId;
  if (status) {
    where.status = { in: status.split(",") };
  } else {
    where.status = { in: ["ACTIVE", "SCHEDULED"] };
  }

  const allocations = await prisma.allocation.findMany({
    where,
    include: { resource: true, project: true, task: true, createdBy: { select: { id: true, name: true } } },
    orderBy: { startDate: "desc" },
  });
  res.json(allocations);
});

const allocateSchema = z.object({
  resourceId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  allocationPercent: z.number().int().min(1).max(100),
  roleOnProject: z.string().optional(),
  projectReportingManagerName: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  override: z.boolean().optional(),
});

// FR-2.1 / FR-2.2 / FR-2.3 / FR-2.4, Workflow 7.2
router.post("/", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res) => {
  const parsed = allocateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { resourceId, projectId, taskId, allocationPercent, roleOnProject, projectReportingManagerName, startDate, endDate, notes, override } = parsed.data;

  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  if (resource.status === "TERMINATED") {
    return res.status(400).json({ error: "Cannot allocate a terminated resource" });
  }
  if (resource.status === "ON_ML") {
    return res.status(400).json({ error: "Cannot allocate a resource who is on maternity leave" });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const portfoliosInvolved = Array.from(new Set([resource.portfolioId, project.portfolioId]));
  const authorized = await assertPortfolioAuthorized(req, res, portfoliosInvolved, "Allocation");
  if (!authorized) return;

  const capacity = await checkCapacity(resourceId, allocationPercent, startDate, endDate ?? null);
  if (!capacity.ok && !override) {
    await writeAudit({
      actorId: req.user!.id,
      action: "BLOCKED_ALLOCATION_CONFLICT",
      entityType: "Resource",
      entityId: resourceId,
      success: false,
      message: `Over-allocation: ${capacity.totalPercent}% committed`,
    });
    return res.status(409).json({ error: "Scheduling conflict: resource would be over-allocated", capacity });
  }

  const isImmediate = startDate <= new Date();
  const allocation = await prisma.allocation.create({
    data: {
      resourceId,
      projectId,
      taskId,
      portfolioId: project.portfolioId,
      allocationPercent,
      roleOnProject,
      projectReportingManagerName,
      startDate,
      endDate,
      status: isImmediate ? "ACTIVE" : "SCHEDULED",
      createdById: req.user!.id,
      notes,
    },
  });

  if (isImmediate) {
    await prisma.resource.update({
      where: { id: resourceId },
      data: {
        status: "ALLOCATED",
        benchSince: null,
        subCategory: deriveDefaultSubCategory(
          { status: "ALLOCATED", subCategory: resource.subCategory },
          { isInternalProject: project.isInternalProject, billingDelayed: project.billingDelayed }
        ),
      },
    });
  } else {
    await reclassifyResourceBenchStatus(resourceId, req.user!.id);
  }

  await writeAudit({
    actorId: req.user!.id,
    action: "ALLOCATE",
    entityType: "Allocation",
    entityId: allocation.id,
    portfolioId: project.portfolioId,
    after: allocation,
  });

  res.status(201).json({ allocation, capacityWarning: capacity.ok ? null : capacity });
});

const reallocateSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  allocationPercent: z.number().int().min(1).max(100),
  roleOnProject: z.string().optional(),
  projectReportingManagerName: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  override: z.boolean().optional(),
});

// FR-3.1 / FR-3.2 / FR-3.3, Workflow 7.3
router.post("/:id/reallocate", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res) => {
  const parsed = reallocateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { projectId, taskId, allocationPercent, roleOnProject, projectReportingManagerName, startDate, endDate, notes, override } = parsed.data;

  const current = await prisma.allocation.findUnique({ where: { id: req.params.id }, include: { resource: true } });
  if (!current) return res.status(404).json({ error: "Allocation not found" });
  if (!["ACTIVE", "SCHEDULED"].includes(current.status)) {
    return res.status(400).json({ error: "Only ACTIVE or SCHEDULED allocations can be reallocated" });
  }

  const newProject = await prisma.project.findUnique({ where: { id: projectId } });
  if (!newProject) return res.status(404).json({ error: "Target project not found" });

  const losingPortfolioId = current.portfolioId;
  const receivingPortfolioId = newProject.portfolioId;
  const authorized = await assertPortfolioAuthorized(
    req,
    res,
    Array.from(new Set([losingPortfolioId, receivingPortfolioId])),
    "Allocation",
    current.id
  );
  if (!authorized) return;

  const capacity = await checkCapacity(current.resourceId, allocationPercent, startDate, endDate ?? null, current.id);
  if (!capacity.ok && !override) {
    return res.status(409).json({ error: "Scheduling conflict: resource would be over-allocated on reallocation", capacity });
  }

  const isImmediate = startDate <= new Date();

  const result = await prisma.$transaction(async (tx) => {
    const newAllocation = await tx.allocation.create({
      data: {
        resourceId: current.resourceId,
        projectId,
        taskId,
        portfolioId: receivingPortfolioId,
        allocationPercent,
        roleOnProject,
        projectReportingManagerName,
        startDate,
        endDate,
        status: isImmediate ? "ACTIVE" : "SCHEDULED",
        createdById: req.user!.id,
        notes,
        reallocatedFromId: current.id,
      },
    });

    if (isImmediate) {
      await tx.allocation.update({ where: { id: current.id }, data: { status: "CLOSED", endDate: startDate } });
    } else {
      // No unnecessary bench pass-through: close the old assignment exactly when the new one starts.
      await tx.allocation.update({ where: { id: current.id }, data: { endDate: startDate } });
    }

    return newAllocation;
  });

  if (isImmediate) {
    await prisma.resource.update({
      where: { id: current.resourceId },
      data: {
        status: "ALLOCATED",
        benchSince: null,
        subCategory: deriveDefaultSubCategory(
          { status: "ALLOCATED", subCategory: current.resource.subCategory },
          { isInternalProject: newProject.isInternalProject, billingDelayed: newProject.billingDelayed }
        ),
      },
    });
  }

  await writeAudit({
    actorId: req.user!.id,
    action: "REALLOCATE",
    entityType: "Allocation",
    entityId: result.id,
    portfolioId: receivingPortfolioId,
    before: current,
    after: result,
  });

  await notifyPortfolioStakeholders(
    [losingPortfolioId, receivingPortfolioId],
    `Resource ${current.resource.name} reallocated from project ${current.projectId} to ${projectId}${
      isImmediate ? "" : ` (scheduled for ${startDate.toISOString().slice(0, 10)})`
    }.`,
    "REALLOCATION",
    "Allocation",
    result.id
  );

  res.status(201).json({ allocation: result, capacityWarning: capacity.ok ? null : capacity });
});

// Unassign without an immediate next assignment -> automatic Bench transition (FR-4.1, Section 3 "Unassign (-> Bench)")
router.post("/:id/unassign", requireRole(...LIFECYCLE_ACTION_ROLES), async (req, res) => {
  const current = await prisma.allocation.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Allocation not found" });
  if (current.status !== "ACTIVE") return res.status(400).json({ error: "Only ACTIVE allocations can be unassigned" });

  const authorized = await assertPortfolioAuthorized(req, res, [current.portfolioId], "Allocation", current.id);
  if (!authorized) return;

  const now = new Date();
  const updated = await prisma.allocation.update({ where: { id: current.id }, data: { status: "CLOSED", endDate: now } });

  await reclassifyResourceBenchStatus(current.resourceId, req.user!.id);

  await writeAudit({
    actorId: req.user!.id,
    action: "UNASSIGN",
    entityType: "Allocation",
    entityId: current.id,
    portfolioId: current.portfolioId,
    before: current,
    after: updated,
  });

  res.json(updated);
});

export default router;
