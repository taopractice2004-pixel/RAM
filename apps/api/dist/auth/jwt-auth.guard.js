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
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let JwtAuthGuard = class JwtAuthGuard {
    jwtService;
    config;
    prisma;
    constructor(jwtService, config, prisma) {
        this.jwtService = jwtService;
        this.config = config;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) {
            throw new common_1.UnauthorizedException('Missing bearer token');
        }
        const token = authorization.slice('Bearer '.length);
        const payload = await this.jwtService.verifyAsync(token, {
            secret: this.config.get('JWT_SECRET', 'change-me-for-local-development'),
        });
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, fullName: true, role: true, accountStatus: true },
        });
        if (!user || user.accountStatus !== client_1.AccountStatus.ACTIVE) {
            throw new common_1.UnauthorizedException('User is not active');
        }
        request.user = {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
        };
        return true;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService,
        prisma_service_1.PrismaService])
], JwtAuthGuard);
