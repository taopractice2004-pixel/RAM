"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const prisma_service_1 = require("../prisma/prisma.service");
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    listUsers() {
        return this.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                accountStatus: true,
                linkedResourceId: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: [{ fullName: 'asc' }],
        });
    }
    async createUser(actor, dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
        if (existing) {
            throw new common_1.BadRequestException('A user with that email already exists');
        }
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email.toLowerCase(),
                fullName: dto.fullName,
                role: dto.role,
                passwordHash,
                accountStatus: dto.accountStatus ?? client_1.AccountStatus.ACTIVE,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                accountStatus: true,
                linkedResourceId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        await this.writeAudit(actor.id, client_1.AuditAction.CREATE, 'User', user.id, undefined, this.toAuditValue(user));
        return user;
    }
    async updateUser(actor, userId, dto) {
        const existing = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!existing) {
            throw new common_1.NotFoundException('User not found');
        }
        const data = {};
        if (dto.email !== undefined) {
            data.email = dto.email.toLowerCase();
        }
        if (dto.fullName !== undefined) {
            data.fullName = dto.fullName;
        }
        if (dto.role !== undefined) {
            data.role = dto.role;
        }
        if (dto.accountStatus !== undefined) {
            data.accountStatus = dto.accountStatus;
        }
        if (dto.password) {
            data.passwordHash = await bcrypt.hash(dto.password, 10);
        }
        const updated = await this.prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                accountStatus: true,
                linkedResourceId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        await this.writeAudit(actor.id, client_1.AuditAction.UPDATE, 'User', updated.id, this.toAuditValue(this.toSafeUser(existing)), this.toAuditValue(updated));
        return updated;
    }
    listPortfolios() {
        return this.prisma.portfolio.findMany({
            select: {
                id: true,
                code: true,
                name: true,
                parentId: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: [{ name: 'asc' }],
        });
    }
    async createPortfolio(actor, dto) {
        const portfolio = await this.prisma.portfolio.create({
            data: {
                code: dto.code.toUpperCase(),
                name: dto.name,
                parentId: dto.parentId ?? null,
            },
            select: {
                id: true,
                code: true,
                name: true,
                parentId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        await this.writeAudit(actor.id, client_1.AuditAction.CREATE, 'Portfolio', portfolio.id, undefined, this.toAuditValue(portfolio));
        return portfolio;
    }
    async updatePortfolio(actor, portfolioId, dto) {
        const existing = await this.prisma.portfolio.findUnique({ where: { id: portfolioId } });
        if (!existing) {
            throw new common_1.NotFoundException('Portfolio not found');
        }
        const updated = await this.prisma.portfolio.update({
            where: { id: portfolioId },
            data: {
                code: dto.code?.toUpperCase(),
                name: dto.name,
                parentId: dto.parentId === undefined ? undefined : dto.parentId,
            },
            select: {
                id: true,
                code: true,
                name: true,
                parentId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        await this.writeAudit(actor.id, client_1.AuditAction.UPDATE, 'Portfolio', updated.id, this.toAuditValue(existing), this.toAuditValue(updated));
        return updated;
    }
    listPortfolioAuthorizations() {
        return this.prisma.portfolioAuthorization.findMany({
            select: {
                id: true,
                userId: true,
                portfolioId: true,
                grantedById: true,
                grantedAt: true,
                revokedAt: true,
            },
            orderBy: [{ grantedAt: 'desc' }],
        });
    }
    async grantPortfolioAuthorization(actor, dto) {
        const existing = await this.prisma.portfolioAuthorization.findFirst({
            where: {
                userId: dto.userId,
                portfolioId: dto.portfolioId,
            },
        });
        const authorization = existing
            ? await this.prisma.portfolioAuthorization.update({
                where: { id: existing.id },
                data: {
                    grantedById: actor.id,
                    revokedAt: null,
                },
                select: {
                    id: true,
                    userId: true,
                    portfolioId: true,
                    grantedById: true,
                    grantedAt: true,
                    revokedAt: true,
                },
            })
            : await this.prisma.portfolioAuthorization.create({
                data: {
                    userId: dto.userId,
                    portfolioId: dto.portfolioId,
                    grantedById: actor.id,
                },
                select: {
                    id: true,
                    userId: true,
                    portfolioId: true,
                    grantedById: true,
                    grantedAt: true,
                    revokedAt: true,
                },
            });
        await this.writeAudit(actor.id, existing ? client_1.AuditAction.UPDATE : client_1.AuditAction.CREATE, 'PortfolioAuthorization', authorization.id, this.toAuditValue(existing), this.toAuditValue(authorization));
        return authorization;
    }
    async revokePortfolioAuthorization(actor, authorizationId) {
        const existing = await this.prisma.portfolioAuthorization.findUnique({ where: { id: authorizationId } });
        if (!existing) {
            throw new common_1.NotFoundException('Portfolio authorization not found');
        }
        const updated = await this.prisma.portfolioAuthorization.update({
            where: { id: authorizationId },
            data: { revokedAt: new Date() },
            select: {
                id: true,
                userId: true,
                portfolioId: true,
                grantedById: true,
                grantedAt: true,
                revokedAt: true,
            },
        });
        await this.writeAudit(actor.id, client_1.AuditAction.UPDATE, 'PortfolioAuthorization', updated.id, this.toAuditValue(existing), this.toAuditValue(updated));
        return updated;
    }
    listGuardrailConfigs() {
        return this.prisma.guardrailConfig.findMany({
            select: {
                id: true,
                configType: true,
                value: true,
                portfolioId: true,
                setById: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: [{ configType: 'asc' }],
        });
    }
    async updateGuardrailConfig(actor, configId, dto) {
        const existing = await this.prisma.guardrailConfig.findUnique({ where: { id: configId } });
        if (!existing) {
            throw new common_1.NotFoundException('Guardrail config not found');
        }
        const updated = await this.prisma.guardrailConfig.update({
            where: { id: configId },
            data: {
                configType: dto.configType,
                value: dto.value,
                setById: actor.id,
            },
            select: {
                id: true,
                configType: true,
                value: true,
                portfolioId: true,
                setById: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        await this.writeAudit(actor.id, client_1.AuditAction.UPDATE, 'GuardrailConfig', updated.id, this.toAuditValue(existing), this.toAuditValue(updated));
        return updated;
    }
    async writeAudit(actorUserId, action, entityType, entityId, oldValue, newValue) {
        await this.prisma.auditLog.create({
            data: {
                entityType,
                entityId,
                action,
                actorUserId,
                oldValue,
                newValue,
            },
        });
    }
    toSafeUser(user) {
        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            accountStatus: user.accountStatus,
            linkedResourceId: user.linkedResourceId,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
    toAuditValue(value) {
        if (value === null || value === undefined) {
            return undefined;
        }
        return JSON.parse(JSON.stringify(value));
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
