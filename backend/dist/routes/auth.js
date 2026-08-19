"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid email/password payload" });
    const { email, password } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active)
        return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ error: "Invalid credentials" });
    const token = (0, auth_1.signToken)(user.id);
    res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
});
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const authorizations = await prisma_1.prisma.portfolioAuthorization.findMany({
        where: { userId: req.user.id, isActive: true },
        include: { portfolio: true },
    });
    res.json({
        user: req.user,
        portfolios: authorizations.map((a) => ({ id: a.portfolio.id, name: a.portfolio.name, code: a.portfolio.code })),
    });
});
exports.default = router;
