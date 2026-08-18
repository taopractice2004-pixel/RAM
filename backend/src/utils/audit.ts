import { prisma } from "../prisma";

interface AuditParams {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  portfolioId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  success?: boolean;
  message?: string | null;
}

export async function writeAudit(params: AuditParams) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      portfolioId: params.portfolioId ?? null,
      before: params.before === undefined ? undefined : (params.before as any),
      after: params.after === undefined ? undefined : (params.after as any),
      reason: params.reason ?? null,
      success: params.success ?? true,
      message: params.message ?? null,
    },
  });
}
