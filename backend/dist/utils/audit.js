"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAudit = writeAudit;
const prisma_1 = require("../prisma");
async function writeAudit(params) {
    await prisma_1.prisma.auditLog.create({
        data: {
            actorId: params.actorId ?? null,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId ?? null,
            portfolioId: params.portfolioId ?? null,
            before: params.before === undefined ? undefined : params.before,
            after: params.after === undefined ? undefined : params.after,
            reason: params.reason ?? null,
            success: params.success ?? true,
            message: params.message ?? null,
        },
    });
}
