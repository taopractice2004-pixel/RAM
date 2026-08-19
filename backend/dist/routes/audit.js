"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const router = (0, express_1.Router)();
// FR-1.3 / FR-12.3 / FR-12.4: audit trail visibility for Admin/RMG/HR.
router.get("/", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const { entityType, entityId, action } = req.query;
    const where = {};
    if (entityType)
        where.entityType = entityType;
    if (entityId)
        where.entityId = entityId;
    if (action)
        where.action = action;
    const logs = await prisma_1.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    res.json(logs);
});
exports.default = router;
