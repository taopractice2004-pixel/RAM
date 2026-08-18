import { Router } from "express";
import { prisma } from "../prisma";
import { requireRole } from "../middleware/rbac";

const router = Router();

// FR-1.3 / FR-12.3 / FR-12.4: audit trail visibility for Admin/RMG/HR.
router.get("/", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  const { entityType, entityId, action } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = action;

  const logs = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

export default router;
