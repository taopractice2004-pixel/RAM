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
exports.AllocationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bench_service_1 = require("../bench/bench.service");
const portfolio_auth_service_1 = require("../auth/portfolio-auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
let AllocationsService = class AllocationsService {
    prisma;
    portfolioAuthService;
    benchService;
    constructor(prisma, portfolioAuthService, benchService) {
        this.prisma = prisma;
        this.portfolioAuthService = portfolioAuthService;
        this.benchService = benchService;
    }
    async listAllocations(actor) {
        const allocations = await this.prisma.allocation.findMany({
            include: {
                resource: {
                    select: {
                        id: true,
                        fullName: true,
                        homePortfolioId: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        portfolioId: true,
                    },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
        });
        const visible = [];
        for (const allocation of allocations) {
            const canReadProject = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, allocation.project.portfolioId);
            const canReadResource = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, allocation.resource.homePortfolioId);
            if (canReadProject || canReadResource) {
                visible.push(allocation);
            }
        }
        return visible;
    }
    async listResourceAllocationHistory(actor, resourceId) {
        const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            throw new common_1.NotFoundException('Resource not found');
        }
        const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, resource.homePortfolioId);
        if (!allowed) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, resource.homePortfolioId, 'view resource allocation history');
            throw new common_1.ForbiddenException('Not authorized for this resource portfolio');
        }
        return this.prisma.allocation.findMany({
            where: { resourceId },
            include: {
                resource: {
                    select: {
                        id: true,
                        fullName: true,
                        homePortfolioId: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        portfolioId: true,
                    },
                },
            },
            orderBy: [{ startDate: 'asc' }],
        });
    }
    async listCompleteResourceAllocationHistory(actor, resourceId) {
        const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            throw new common_1.NotFoundException('Resource not found');
        }
        const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, resource.homePortfolioId);
        if (!allowed) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, resource.homePortfolioId, 'view complete resource allocation history');
            throw new common_1.ForbiddenException('Not authorized for this resource portfolio');
        }
        return this.prisma.allocation.findMany({
            where: { resourceId },
            include: {
                resource: {
                    select: {
                        id: true,
                        fullName: true,
                        homePortfolioId: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        portfolioId: true,
                    },
                },
            },
            orderBy: [{ startDate: 'asc' }],
        });
    }
    async createAllocation(actor, dto) {
        const resource = await this.prisma.resource.findUnique({ where: { id: dto.resourceId } });
        if (!resource || resource.lifecycleState === client_1.LifecycleState.TERMINATED) {
            throw new common_1.BadRequestException({ type: 'INVALID_RESOURCE', message: 'Resource must exist and be active' });
        }
        const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
        if (!project) {
            throw new common_1.BadRequestException({ type: 'INVALID_PROJECT', message: 'Project must exist' });
        }
        this.ensureRequesterRole(actor.role);
        const hasProjectAccess = await this.portfolioAuthService.canAccessPortfolio(actor.id, actor.role, project.portfolioId);
        if (!hasProjectAccess) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, project.portfolioId, 'create allocation (target portfolio)');
            throw new common_1.ForbiddenException({ type: 'UNAUTHORIZED', message: 'Not authorized for target portfolio' });
        }
        const hasResourceAccess = await this.portfolioAuthService.canAccessPortfolio(actor.id, actor.role, resource.homePortfolioId);
        if (!hasResourceAccess) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, resource.homePortfolioId, 'create allocation (source resource portfolio)');
            throw new common_1.ForbiddenException({ type: 'UNAUTHORIZED', message: 'Not authorized for source resource portfolio' });
        }
        const overlap = await this.calculateOverlap(dto.resourceId, dto.startDate, dto.endDate, undefined);
        const projectedPct = overlap.totalPct + dto.allocationPct;
        if (projectedPct > 100) {
            throw new common_1.BadRequestException({
                type: 'OVER_ALLOCATION',
                message: 'Allocation would exceed 100% capacity',
                currentAllocatedPct: overlap.totalPct,
                requestedAllocationPct: dto.allocationPct,
                overlappingAllocations: overlap.allocations,
            });
        }
        const rateSnapshot = resource.billingRate ?? resource.costRate;
        const allocation = await this.prisma.allocation.create({
            data: {
                resourceId: dto.resourceId,
                projectId: dto.projectId,
                roleOnProject: dto.roleOnProject ?? null,
                startDate: new Date(dto.startDate),
                endDate: new Date(dto.endDate),
                allocationPct: dto.allocationPct,
                billable: dto.billable ?? true,
                status: this.getAllocationStatus(dto.startDate, dto.endDate),
                rateSnapshot,
                createdById: actor.id,
                approvedById: actor.role === client_1.Role.RMG || actor.role === client_1.Role.ADMIN ? actor.id : null,
            },
            include: {
                resource: {
                    select: {
                        id: true,
                        fullName: true,
                        homePortfolioId: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        portfolioId: true,
                    },
                },
            },
        });
        await this.recalculateResourceAllocatedPct(dto.resourceId);
        await this.benchService.refreshBenchState(dto.resourceId, actor.id);
        await this.writeAudit(actor.id, client_1.AuditAction.CREATE, 'Allocation', allocation.id, undefined, allocation);
        return allocation;
    }
    async reallocateResource(actor, dto) {
        const currentAllocation = await this.prisma.allocation.findUnique({
            where: { id: dto.currentAllocationId },
            include: {
                resource: true,
                project: true,
            },
        });
        if (!currentAllocation) {
            throw new common_1.NotFoundException('Current allocation not found');
        }
        const targetProject = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
        if (!targetProject) {
            throw new common_1.BadRequestException({ type: 'INVALID_PROJECT', message: 'Target project must exist' });
        }
        this.ensureRequesterRole(actor.role);
        const hasSourceAccess = await this.portfolioAuthService.canAccessPortfolio(actor.id, actor.role, currentAllocation.project.portfolioId);
        const hasTargetAccess = await this.portfolioAuthService.canAccessPortfolio(actor.id, actor.role, targetProject.portfolioId);
        if (!hasSourceAccess || !hasTargetAccess) {
            await this.portfolioAuthService.logUnauthorizedAttempt(actor.id, actor.role, hasSourceAccess ? targetProject.portfolioId : currentAllocation.project.portfolioId, 'reallocate resource (source/target portfolio)');
            throw new common_1.ForbiddenException({ type: 'UNAUTHORIZED', message: 'Reallocation requires authorization on both portfolios' });
        }
        const overlap = await this.calculateOverlap(dto.resourceId, dto.startDate, dto.endDate, currentAllocation.id);
        const projectedPct = overlap.totalPct + dto.allocationPct;
        if (projectedPct > 100) {
            throw new common_1.BadRequestException({
                type: 'OVER_ALLOCATION',
                message: 'Reallocation would exceed 100% capacity',
                currentAllocatedPct: overlap.totalPct,
                requestedAllocationPct: dto.allocationPct,
                overlappingAllocations: overlap.allocations,
            });
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updatedCurrent = await tx.allocation.update({
                where: { id: currentAllocation.id },
                data: {
                    actualEndDate: dto.currentAllocationActualEndDate ? new Date(dto.currentAllocationActualEndDate) : new Date(dto.startDate),
                    endDate: dto.currentAllocationActualEndDate ? new Date(dto.currentAllocationActualEndDate) : new Date(dto.startDate),
                    status: client_1.AllocationStatus.CLOSED,
                },
            });
            const nextAllocation = await tx.allocation.create({
                data: {
                    resourceId: dto.resourceId,
                    projectId: dto.projectId,
                    roleOnProject: dto.roleOnProject ?? null,
                    startDate: new Date(dto.startDate),
                    endDate: new Date(dto.endDate),
                    allocationPct: dto.allocationPct,
                    billable: dto.billable ?? true,
                    status: this.getAllocationStatus(dto.startDate, dto.endDate),
                    rateSnapshot: currentAllocation.resource.billingRate ?? currentAllocation.resource.costRate,
                    createdById: actor.id,
                    approvedById: actor.role === client_1.Role.RMG || actor.role === client_1.Role.ADMIN ? actor.id : null,
                },
                include: {
                    resource: {
                        select: {
                            id: true,
                            fullName: true,
                            homePortfolioId: true,
                        },
                    },
                    project: {
                        select: {
                            id: true,
                            code: true,
                            name: true,
                            portfolioId: true,
                        },
                    },
                },
            });
            return { updatedCurrent, nextAllocation };
        });
        await this.recalculateResourceAllocatedPct(dto.resourceId);
        await this.benchService.refreshBenchState(dto.resourceId, actor.id);
        await this.writeAudit(actor.id, client_1.AuditAction.UPDATE, 'Allocation', currentAllocation.id, currentAllocation, result.updatedCurrent);
        await this.writeAudit(actor.id, client_1.AuditAction.CREATE, 'Allocation', result.nextAllocation.id, undefined, result.nextAllocation);
        return result;
    }
    ensureRequesterRole(role) {
        if (role !== client_1.Role.RMG && role !== client_1.Role.DELIVERY && role !== client_1.Role.ADMIN) {
            throw new common_1.ForbiddenException({ type: 'UNAUTHORIZED', message: 'Requester role cannot create allocations' });
        }
    }
    async calculateOverlap(resourceId, startDate, endDate, excludeAllocationId) {
        const overlapping = await this.prisma.allocation.findMany({
            where: {
                resourceId,
                status: { in: [client_1.AllocationStatus.SCHEDULED, client_1.AllocationStatus.ACTIVE] },
                ...(excludeAllocationId ? { id: { not: excludeAllocationId } } : {}),
                AND: [
                    { startDate: { lte: new Date(endDate) } },
                    { endDate: { gte: new Date(startDate) } },
                ],
            },
            include: {
                project: {
                    select: {
                        code: true,
                    },
                },
            },
        });
        return {
            totalPct: overlapping.reduce((sum, allocation) => sum + allocation.allocationPct, 0),
            allocations: overlapping.map((allocation) => ({
                id: allocation.id,
                projectCode: allocation.project.code,
                allocationPct: allocation.allocationPct,
                startDate: allocation.startDate.toISOString(),
                endDate: allocation.endDate.toISOString(),
            })),
        };
    }
    getAllocationStatus(startDate, endDate) {
        const now = new Date();
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end < now) {
            return client_1.AllocationStatus.CLOSED;
        }
        if (start > now) {
            return client_1.AllocationStatus.SCHEDULED;
        }
        return client_1.AllocationStatus.ACTIVE;
    }
    /**
     * Updates currentAllocatedPct only. Lifecycle state itself is left to
     * BenchService.refreshBenchState (called immediately after this), which is
     * the single source of truth for lifecycle transitions and their audit
     * trail — computing lifecycleState here too would mask the real
     * before/after transition by the time refreshBenchState re-reads the row.
     */
    async recalculateResourceAllocatedPct(resourceId) {
        const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            return;
        }
        const now = new Date();
        const activeAllocations = await this.prisma.allocation.findMany({
            where: {
                resourceId,
                status: { in: [client_1.AllocationStatus.ACTIVE, client_1.AllocationStatus.SCHEDULED] },
            },
        });
        const currentAllocatedPct = activeAllocations
            .filter((allocation) => allocation.startDate <= now && allocation.endDate >= now)
            .reduce((sum, allocation) => sum + allocation.allocationPct, 0);
        await this.prisma.resource.update({
            where: { id: resourceId },
            data: { currentAllocatedPct },
        });
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
exports.AllocationsService = AllocationsService;
exports.AllocationsService = AllocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        portfolio_auth_service_1.PortfolioAuthService,
        bench_service_1.BenchService])
], AllocationsService);
