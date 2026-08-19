"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const scope_1 = require("../utils/scope");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    const { portfolioId } = req.query;
    const where = { ...(0, scope_1.portfolioReadWhere)(req) };
    if (portfolioId)
        where.portfolioId = portfolioId;
    const projects = await prisma_1.prisma.project.findMany({
        where,
        include: { tasks: true, portfolio: true },
        orderBy: { name: "asc" },
    });
    res.json(projects);
});
exports.default = router;
