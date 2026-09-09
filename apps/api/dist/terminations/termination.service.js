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
exports.TerminationService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const portfolio_auth_service_1 = require("../auth/portfolio-auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const bench_service_1 = require("../bench/bench.service");
let TerminationService = class TerminationService {
    prisma;
    portfolioAuthService;
    benchService;
    constructor(prisma, portfolioAuthService, benchService) {
        this.prisma = prisma;
        this.portfolioAuthService = portfolioAuthService;
        this.benchService = benchService;
    }
    async listTerminations(actor) {
        const terminations = await this.prisma.terminationRecord.findMany({
            include: {
                resource: {
                    select: {
                        id: true,
                        fullName: true,
                        homePortfolioId: true,
                    },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
        });
        const visible = [];
        for (const termination of terminations) {
            const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, termination.resource.homePortfolioId);
            if (allowed) {
                visible.push(termination);
            }
        }
        return visible;
    }
    async initiateTermination(actor, dto) {
        if (actor.role !== client_1.Role.RMG && actor.role !== client_1.Role.HR && actor.role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only RMG, HR, or Admin can initiate termination');
        }
        const resource = await this.prisma.resource.findUnique({ where: { id: dto.resourceId } });
        if (!resource) {
            throw new common_1.NotFoundException('Resource not found');
        }
        const allowed = await this.portfolioAuthService.canAccessPortfolio(actor.id, actor.role, resource.homePortfolioId);
        if (!allowed) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, resource.homePortfolioId, 'initiate termination');
            throw new common_1.ForbiddenException('Not authorized for this resource portfolio');
        }
        const activeAllocations = await this.prisma.allocation.findMany({
            where: {
                resourceId: dto.resourceId,
                status: { in: [client_1.AllocationStatus.ACTIVE, client_1.AllocationStatus.SCHEDULED] },
            },
        });
        if (activeAllocations.length > 0) {
            throw new common_1.BadRequestException({
                message: 'Termination is blocked while active allocations exist',
                activeAllocationIds: activeAllocations.map((allocation) => allocation.id),
            });
        }
        const existing = await this.prisma.terminationRecord.findUnique({ where: { resourceId: dto.resourceId } });
        if (existing && existing.status !== client_1.TerminationStatus.CANCELLED) {
            throw new common_1.BadRequestException('Termination record already exists for this resource');
        }
        const termination = existing
            ? await this.prisma.terminationRecord.update({
                where: { resourceId: dto.resourceId },
                data: {
                    terminationDate: new Date(dto.terminationDate),
                    reasonCode: dto.reasonCode,
                    notes: dto.notes,
                    status: client_1.TerminationStatus.PENDING_HR_APPROVAL,
                    initiatedById: actor.id,
                    hrApprovedById: null,
                },
                include: {
                    resource: {
                        select: { id: true, fullName: true, homePortfolioId: true },
                    },
                },
            })
            : await this.prisma.terminationRecord.create({
                data: {
                    resourceId: dto.resourceId,
                    terminationDate: new Date(dto.terminationDate),
                    reasonCode: dto.reasonCode,
                    notes: dto.notes,
                    initiatedById: actor.id,
                },
                include: {
                    resource: {
                        select: { id: true, fullName: true, homePortfolioId: true },
                    },
                },
            });
        await this.writeAudit(actor.id, client_1.AuditAction.CREATE, 'TerminationRecord', termination.id, undefined, termination);
        return termination;
    }
    async approveTermination(actor, terminationId) {
        if (actor.role !== client_1.Role.HR && actor.role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException('Only HR or Admin can approve termination');
        }
        const termination = await this.prisma.terminationRecord.findUnique({
            where: { id: terminationId },
            include: {
                resource: true,
            },
        });
        if (!termination) {
            throw new common_1.NotFoundException('Termination record not found');
        }
        const allowed = await this.portfolioAuthService.canAccessPortfolio(actor.id, actor.role, termination.resource.homePortfolioId);
        if (!allowed) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, termination.resource.homePortfolioId, 'approve termination');
            throw new common_1.ForbiddenException('Not authorized for this resource portfolio');
        }
        const previousLifecycleState = termination.resource.lifecycleState;
        const updated = await this.prisma.terminationRecord.update({
            where: { id: terminationId },
            data: {
                status: client_1.TerminationStatus.APPROVED,
                hrApprovedById: actor.id,
            },
            include: {
                resource: {
                    select: { id: true, fullName: true, homePortfolioId: true },
                },
            },
        });
        await this.prisma.resource.update({
            where: { id: termination.resourceId },
            data: {
                lifecycleState: client_1.LifecycleState.TERMINATED,
                currentAllocatedPct: 0,
            },
        });
        if (previousLifecycleState !== client_1.LifecycleState.TERMINATED) {
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'Resource',
                    entityId: termination.resourceId,
                    action: client_1.AuditAction.STATE_TRANSITION,
                    actorUserId: actor.id,
                    oldValue: { lifecycleState: previousLifecycleState },
                    newValue: { lifecycleState: client_1.LifecycleState.TERMINATED },
                    reasonCode: termination.reasonCode,
                },
            });
        }
        await this.benchService.refreshBenchState(termination.resourceId, actor.id);
        await this.writeAudit(actor.id, client_1.AuditAction.UPDATE, 'TerminationRecord', updated.id, termination, updated);
        return updated;
    }
    async writeAudit(actorUserId, action, entityType, entityId, oldValue, newValue) {
        await this.prisma.auditLog.create({
            data: {
                entityType,
                entityId,
                action,
                actorUserId,
                oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : undefined,
                newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
            },
        });
    }
};
exports.TerminationService = TerminationService;
exports.TerminationService = TerminationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        portfolio_auth_service_1.PortfolioAuthService,
        bench_service_1.BenchService])
], TerminationService);
