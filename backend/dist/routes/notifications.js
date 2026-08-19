"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    const notifications = await prisma_1.prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    res.json(notifications);
});
router.post("/:id/read", async (req, res) => {
    const notification = await prisma_1.prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.user.id)
        return res.status(404).json({ error: "Not found" });
    const updated = await prisma_1.prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
    res.json(updated);
});
router.post("/read-all", async (req, res) => {
    await prisma_1.prisma.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
    res.json({ ok: true });
});
exports.default = router;
