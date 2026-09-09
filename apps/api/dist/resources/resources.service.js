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
exports.ResourcesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const portfolio_auth_service_1 = require("../auth/portfolio-auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const resourceInclude = {
    homePortfolio: {
        select: {
            id: true,
            code: true,
            name: true,
        },
    },
    skills: {
        include: {
            skill: {
                select: { id: true, name: true, category: true },
            },
        },
    },
};
let ResourcesService = class ResourcesService {
    prisma;
    portfolioAuthService;
    constructor(prisma, portfolioAuthService) {
        this.prisma = prisma;
        this.portfolioAuthService = portfolioAuthService;
    }
    async listResources(actor, query) {
        const resources = await this.prisma.resource.findMany({
            where: {
                ...(query.search
                    ? {
                        OR: [
                            { fullName: { contains: query.search, mode: 'insensitive' } },
                            { email: { contains: query.search, mode: 'insensitive' } },
                            { employeeOrContractorNo: { contains: query.search, mode: 'insensitive' } },
                            { jobTitle: { contains: query.search, mode: 'insensitive' } },
                        ],
                    }
                    : {}),
                ...(query.portfolioId ? { homePortfolioId: query.portfolioId } : {}),
                ...(query.lifecycleState ? { lifecycleState: query.lifecycleState } : {}),
                ...(query.resourceType ? { resourceType: query.resourceType } : {}),
                ...(query.location ? { location: { contains: query.location, mode: 'insensitive' } } : {}),
                ...(query.minExperienceYears !== undefined
                    ? { totalYearsExperience: { gte: query.minExperienceYears } }
                    : {}),
                ...(query.skill
                    ? { skills: { some: { skill: { name: { contains: query.skill, mode: 'insensitive' } } } } }
                    : {}),
                recordStatus: { not: client_1.RecordStatus.QUARANTINED },
            },
            include: resourceInclude,
            orderBy: [{ fullName: 'asc' }],
        });
        const visibleResources = [];
        for (const resource of resources) {
            const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, resource.homePortfolioId);
            if (!allowed) {
                continue;
            }
            visibleResources.push(this.toVisibleResource(resource, actor.role));
        }
        return visibleResources;
    }
    async getResource(actor, resourceId) {
        const resource = await this.prisma.resource.findUnique({
            where: { id: resourceId },
            include: resourceInclude,
        });
        if (!resource) {
            return null;
        }
        const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, resource.homePortfolioId);
        if (!allowed) {
            return null;
        }
        return this.toVisibleResource(resource, actor.role);
    }
    async getResourceAuditHistory(actor, resourceId) {
        const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            return null;
        }
        const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, resource.homePortfolioId);
        if (!allowed) {
            return null;
        }
        const [allocationIds, termination] = await Promise.all([
            this.prisma.allocation.findMany({ where: { resourceId }, select: { id: true } }),
            this.prisma.terminationRecord.findUnique({ where: { resourceId }, select: { id: true } }),
        ]);
        return this.prisma.auditLog.findMany({
            where: {
                OR: [
                    { entityType: 'Resource', entityId: resourceId },
                    { entityType: 'Allocation', entityId: { in: allocationIds.map((allocation) => allocation.id) } },
                    ...(termination ? [{ entityType: 'TerminationRecord', entityId: termination.id }] : []),
                ],
            },
            orderBy: [{ createdAt: 'desc' }],
        });
    }
    async addResourceSkill(actor, resourceId, input) {
        const resource = await this.prisma.resource.findUnique({ where: { id: resourceId } });
        if (!resource) {
            return null;
        }
        await this.portfolioAuthService.assertCanAccessPortfolio(actor.id, actor.role, resource.homePortfolioId, 'add resource skill');
        const skill = await this.prisma.skill.upsert({
            where: { name: input.skillName.trim() },
            update: {},
            create: { name: input.skillName.trim(), category: input.category ?? null },
        });
        return this.prisma.resourceSkill.upsert({
            where: { resourceId_skillId: { resourceId, skillId: skill.id } },
            update: {
                proficiencyLevel: input.proficiencyLevel ?? undefined,
                yearsInSkill: input.yearsInSkill !== undefined ? new client_1.Prisma.Decimal(input.yearsInSkill) : undefined,
            },
            create: {
                resourceId,
                skillId: skill.id,
                proficiencyLevel: input.proficiencyLevel ?? undefined,
                yearsInSkill: input.yearsInSkill !== undefined ? new client_1.Prisma.Decimal(input.yearsInSkill) : undefined,
            },
            include: { skill: true },
        });
    }
    listSkills() {
        return this.prisma.skill.findMany({ orderBy: [{ name: 'asc' }] });
    }
    listSyncLogs() {
        return this.prisma.syncLog.findMany({
            include: {
                quarantinedRecords: true,
            },
            orderBy: [{ runDate: 'desc' }],
        });
    }
    listQuarantinedRecords() {
        return this.prisma.quarantinedRecord.findMany({
            where: { status: client_1.QuarantineStatus.PENDING },
            include: {
                sync: true,
            },
            orderBy: [{ sync: { runDate: 'desc' } }],
        });
    }
    async resolveQuarantinedRecord(actor, quarantineId) {
        const existing = await this.prisma.quarantinedRecord.findUnique({ where: { id: quarantineId } });
        if (!existing) {
            return null;
        }
        return this.prisma.quarantinedRecord.update({
            where: { id: quarantineId },
            data: {
                status: client_1.QuarantineStatus.RESOLVED,
                resolvedById: actor.id,
                resolvedAt: new Date(),
            },
        });
    }
    toVisibleResource(resource, role) {
        const canViewSensitiveFields = role === client_1.Role.ADMIN || role === client_1.Role.HR || role === client_1.Role.RMG;
        return {
            id: resource.id,
            fullName: resource.fullName,
            resourceType: resource.resourceType,
            email: resource.email,
            employeeOrContractorNo: resource.employeeOrContractorNo,
            homePortfolio: resource.homePortfolio,
            jobTitle: resource.jobTitle,
            location: resource.location,
            timezone: resource.timezone,
            totalYearsExperience: resource.totalYearsExperience?.toString() ?? null,
            dateOfJoining: resource.dateOfJoining,
            lifecycleState: resource.lifecycleState,
            currentAllocatedPct: resource.currentAllocatedPct,
            capacityPct: resource.capacityPct,
            currency: resource.currency,
            recordStatus: resource.recordStatus,
            sourceSystem: resource.sourceSystem,
            createdAt: resource.createdAt,
            updatedAt: resource.updatedAt,
            costRate: canViewSensitiveFields ? resource.costRate?.toString() ?? null : null,
            billingRate: canViewSensitiveFields ? resource.billingRate?.toString() ?? null : null,
            skills: resource.skills.map((resourceSkill) => ({
                id: resourceSkill.id,
                skillId: resourceSkill.skillId,
                name: resourceSkill.skill.name,
                category: resourceSkill.skill.category,
                proficiencyLevel: resourceSkill.proficiencyLevel,
                yearsInSkill: resourceSkill.yearsInSkill?.toString() ?? null,
                lastUsedDate: resourceSkill.lastUsedDate,
            })),
        };
    }
};
exports.ResourcesService = ResourcesService;
exports.ResourcesService = ResourcesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        portfolio_auth_service_1.PortfolioAuthService])
], ResourcesService);
