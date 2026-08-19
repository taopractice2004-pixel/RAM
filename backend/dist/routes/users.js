"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const audit_1 = require("../utils/audit");
const rbac_1 = require("../middleware/rbac");
const router = (0, express_1.Router)();
const ROLE_VALUES = ["ADMIN", "RMG", "DELIVERY", "HR", "TA", "VIEWER"];
router.get("/", (0, rbac_1.requireRole)("ADMIN", "RMG"), async (_req, res) => {
    const users = await prisma_1.prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
        orderBy: { name: "asc" },
    });
    res.json(users);
});
router.post("/", (0, rbac_1.requireRole)("ADMIN"), async (req, res) => {
    const schema = zod_1.z.object({
        email: zod_1.z.string().email(),
        name: zod_1.z.string().min(1),
        password: zod_1.z.string().min(6),
        role: zod_1.z.enum(ROLE_VALUES),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const passwordHash = await bcryptjs_1.default.hash(parsed.data.password, 10);
    const user = await prisma_1.prisma.user.create({
        data: {
            email: parsed.data.email,
            name: parsed.data.name,
            role: parsed.data.role,
            passwordHash,
        },
    });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "CREATE_USER",
        entityType: "User",
        entityId: user.id,
        after: { email: user.email, name: user.name, role: user.role },
    });
    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});
router.patch("/:id", (0, rbac_1.requireRole)("ADMIN"), async (req, res) => {
    const schema = zod_1.z.object({
        active: zod_1.z.boolean().optional(),
        role: zod_1.z.enum(ROLE_VALUES).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const before = await prisma_1.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before)
        return res.status(404).json({ error: "User not found" });
    const user = await prisma_1.prisma.user.update({
        where: { id: req.params.id },
        data: parsed.data,
    });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "UPDATE_USER",
        entityType: "User",
        entityId: user.id,
        before: { role: before.role, active: before.active },
        after: { role: user.role, active: user.active },
    });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, active: user.active });
});
exports.default = router;
