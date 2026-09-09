"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const portfolio_auth_service_1 = require("../auth/portfolio-auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
let BenchService = class BenchService {
    prisma;
    portfolioAuthService;
    constructor(prisma, portfolioAuthService) {
        this.prisma = prisma;
        this.portfolioAuthService = portfolioAuthService;
    }
    async refreshBenchState(resourceId, actorUserId) {
        const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            return null;
        }
        const previousLifecycleState = resource.lifecycleState;
        if (resource.lifecycleState === client_1.LifecycleState.TERMINATED) {
            await this.closeOpenBenchRecords(resourceId, new Date());
            await this.prisma.resource.update({
                where: { id: resourceId },
                data: { currentAllocatedPct: 0, lifecycleState: client_1.LifecycleState.TERMINATED },
            });
            return null;
        }
        const now = new Date();
        const activeAllocation = await this.prisma.allocation.findFirst({
            where: {
                resourceId,
                status: { in: [client_1.AllocationStatus.ACTIVE, client_1.AllocationStatus.SCHEDULED] },
                startDate: { lte: now },
                endDate: { gte: now },
            },
        });
        const futureAllocation = await this.prisma.allocation.findFirst({
            where: {
                resourceId,
                status: { in: [client_1.AllocationStatus.ACTIVE, client_1.AllocationStatus.SCHEDULED] },
                startDate: { gt: now },
            },
            orderBy: { startDate: 'asc' },
        });
        if (activeAllocation) {
            await this.closeOpenBenchRecords(resourceId, now);
            await this.prisma.resource.update({
                where: { id: resourceId },
                data: { lifecycleState: client_1.LifecycleState.ALLOCATED },
            });
            await this.logStateTransition(resourceId, previousLifecycleState, client_1.LifecycleState.ALLOCATED, actorUserId);
            return null;
        }
        if (futureAllocation) {
            await this.upsertBenchRecord(resourceId, client_1.BenchType.COMMITTED, futureAllocation.id, now, 0);
            await this.prisma.resource.update({
                where: { id: resourceId },
                data: { lifecycleState: client_1.LifecycleState.BENCH_COMMITTED, currentAllocatedPct: 0 },
            });
            await this.logStateTransition(resourceId, previousLifecycleState, client_1.LifecycleState.BENCH_COMMITTED, actorUserId);
            return client_1.BenchType.COMMITTED;
        }
        const threshold = await this.getTrueBenchThreshold();
        const openBenchRecord = await this.prisma.benchRecord.findFirst({
            where: {
                resourceId,
                benchEndDate: null,
            },
            orderBy: { benchStartDate: 'desc' },
        });
        const benchStartDate = openBenchRecord?.benchStartDate ?? now;
        const agingDays = Math.max(0, Math.floor((now.getTime() - benchStartDate.getTime()) / (24 * 60 * 60 * 1000)));
        await this.upsertBenchRecord(resourceId, client_1.BenchType.TRUE, null, benchStartDate, agingDays, agingDays >= threshold);
        await this.prisma.resource.update({
            where: { id: resourceId },
            data: { lifecycleState: client_1.LifecycleState.BENCH_TRUE, currentAllocatedPct: 0 },
        });
        await this.logStateTransition(resourceId, previousLifecycleState, client_1.LifecycleState.BENCH_TRUE, actorUserId);
        return client_1.BenchType.TRUE;
    }
    async listBenchRecords(actor) {
        const records = await this.prisma.benchRecord.findMany({
            where: { benchEndDate: null },
            include: {
                resource: {
                    select: {
                        id: true,
                        fullName: true,
                        homePortfolioId: true,
                    },
                },
            },
            orderBy: [{ benchStartDate: 'desc' }],
        });
        const visible = [];
        for (const record of records) {
            const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, record.resource.homePortfolioId);
            if (allowed) {
                visible.push(record);
            }
        }
        return visible;
    }
    async logStateTransition(resourceId, oldState, newState, actorUserId) {
        if (oldState === newState) {
            return;
        }
        await this.prisma.auditLog.create({
            data: {
                entityType: 'Resource',
                entityId: resourceId,
                action: client_1.AuditAction.STATE_TRANSITION,
                actorUserId: actorUserId ?? null,
                oldValue: { lifecycleState: oldState },
                newValue: { lifecycleState: newState },
            },
        });
    }
    async getTrueBenchThreshold() {
        const config = await this.prisma.guardrailConfig.findFirst({
            where: { configType: 'TRUE_BENCH_AGING_THRESHOLD_DAYS' },
            select: { value: true },
        });
        return config?.value ?? 60;
    }
    async closeOpenBenchRecords(resourceId, endDate) {
        await this.prisma.benchRecord.updateMany({
            where: {
                resourceId,
                benchEndDate: null,
            },
            data: {
                benchEndDate: endDate,
            },
        });
    }
    async upsertBenchRecord(resourceId, benchType, scheduledNextAllocationId, benchStartDate, agingDays, alertSent = false) {
        const existing = await this.prisma.benchRecord.findFirst({
            where: {
                resourceId,
                benchEndDate: null,
            },
        });
        if (existing) {
            return this.prisma.benchRecord.update({
                where: { id: existing.id },
                data: {
                    benchType,
                    scheduledNextAllocationId,
                    benchStartDate,
                    agingDays,
                    alertSent,
                },
            });
        }
        return this.prisma.benchRecord.create({
            data: {
                resourceId,
                benchType,
                scheduledNextAllocationId,
                benchStartDate,
                agingDays,
                alertSent,
            },
        });
    }
};
exports.BenchService = BenchService;
exports.BenchService = BenchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        portfolio_auth_service_1.PortfolioAuthService])
], BenchService);
