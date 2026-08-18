import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { RoleName } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAudit } from "../utils/audit";
import { requireRole } from "../middleware/rbac";

const router = Router();

const ROLE_VALUES = ["ADMIN", "RMG", "DELIVERY", "HR", "TA", "VIEWER"] as const;

router.get("/", requireRole("ADMIN", "RMG"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(6),
    role: z.enum(ROLE_VALUES),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role as RoleName,
      passwordHash,
    },
  });

  await writeAudit({
    actorId: req.user!.id,
    action: "CREATE_USER",
    entityType: "User",
    entityId: user.id,
    after: { email: user.email, name: user.name, role: user.role },
  });

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    active: z.boolean().optional(),
    role: z.enum(ROLE_VALUES).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const before = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ error: "User not found" });

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data as any,
  });

  await writeAudit({
    actorId: req.user!.id,
    action: "UPDATE_USER",
    entityType: "User",
    entityId: user.id,
    before: { role: before.role, active: before.active },
    after: { role: user.role, active: user.active },
  });

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, active: user.active });
});

export default router;
