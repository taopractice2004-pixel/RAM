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
exports.PortfolioAuthService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let PortfolioAuthService = class PortfolioAuthService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Action-level check (allocate/reallocate/terminate/etc). Per the RAM
     * permissions matrix, RMG needs an explicit grant to ACT on a portfolio
     * even though they can READ across all portfolios (see canReadPortfolio).
     */
    async canAccessPortfolio(userId, role, portfolioId) {
        if (role === client_1.Role.ADMIN || role === client_1.Role.HR) {
            return true;
        }
        const grant = await this.prisma.portfolioAuthorization.findFirst({
            where: {
                userId,
                portfolioId,
                revokedAt: null,
            },
            select: { id: true },
        });
        return Boolean(grant);
    }
    /**
     * Read-level check for lists/dashboards/forecasting. FR-12.5: RMG (and other
     * explicitly cross-portfolio roles) get read visibility across all
     * portfolios independent of action-level authorization.
     */
    async canReadPortfolio(userId, role, portfolioId) {
        if (role === client_1.Role.ADMIN || role === client_1.Role.HR || role === client_1.Role.RMG) {
            return true;
        }
        return this.canAccessPortfolio(userId, role, portfolioId);
    }
    async assertCanAccessPortfolio(userId, role, portfolioId, context) {
        const allowed = await this.canAccessPortfolio(userId, role, portfolioId);
        if (!allowed) {
            await this.logUnauthorizedAttempt(userId, role, portfolioId, context);
            throw new common_1.ForbiddenException({ type: 'UNAUTHORIZED', message: `Not authorized for this portfolio (${context})` });
        }
    }
    async logUnauthorizedAttempt(actorUserId, role, portfolioId, context) {
        await this.prisma.auditLog.create({
            data: {
                entityType: 'AccessControl',
                entityId: portfolioId ?? null,
                action: client_1.AuditAction.UNAUTHORIZED_ATTEMPT,
                actorUserId: actorUserId ?? null,
                newValue: { role, portfolioId, context },
            },
        });
    }
};
exports.PortfolioAuthService = PortfolioAuthService;
exports.PortfolioAuthService = PortfolioAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PortfolioAuthService);
