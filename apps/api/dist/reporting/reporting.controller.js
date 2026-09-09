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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportingController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const reporting_service_1 = require("./reporting.service");
let ReportingController = class ReportingController {
    reportingService;
    constructor(reportingService) {
        this.reportingService = reportingService;
    }
    refreshViews() {
        return this.reportingService.refreshViews();
    }
    async getUtilizationSummary(actor, format, res) {
        const rows = await this.reportingService.getUtilizationSummary(actor);
        return this.respond(res, rows, format, 'utilization-summary');
    }
    async getBenchAgingSummary(actor, format, res) {
        const rows = await this.reportingService.getBenchAgingSummary(actor);
        return this.respond(res, rows, format, 'bench-aging-summary');
    }
    async getActiveAllocationSummary(actor, format, res) {
        const rows = await this.reportingService.getActiveAllocationSummary(actor);
        return this.respond(res, rows, format, 'active-allocation-summary');
    }
    async getPortfolioCapacitySummary(actor, format, res) {
        const rows = await this.reportingService.getPortfolioCapacitySummary(actor);
        return this.respond(res, rows, format, 'portfolio-capacity-summary');
    }
    respond(res, rows, format, filenameBase) {
        if (format?.toLowerCase() === 'csv') {
            const csv = this.reportingService.toCsv(rows);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
            return res.send(csv);
        }
        return res.json(rows);
    }
};
exports.ReportingController = ReportingController;
__decorate([
    (0, common_1.Post)('refresh'),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ReportingController.prototype, "refreshViews", null);
__decorate([
    (0, common_1.Get)('utilization'),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.DELIVERY, client_1.Role.HR, client_1.Role.VIEWER, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportingController.prototype, "getUtilizationSummary", null);
__decorate([
    (0, common_1.Get)('bench-aging'),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.TA, client_1.Role.VIEWER, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportingController.prototype, "getBenchAgingSummary", null);
__decorate([
    (0, common_1.Get)('active-allocations'),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.DELIVERY, client_1.Role.VIEWER, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportingController.prototype, "getActiveAllocationSummary", null);
__decorate([
    (0, common_1.Get)('portfolio-capacity'),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.DELIVERY, client_1.Role.HR, client_1.Role.VIEWER, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Query)('format')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportingController.prototype, "getPortfolioCapacitySummary", null);
exports.ReportingController = ReportingController = __decorate([
    (0, common_1.Controller)('reporting'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [reporting_service_1.ReportingService])
], ReportingController);
