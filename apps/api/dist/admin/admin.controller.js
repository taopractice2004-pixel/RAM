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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const admin_service_1 = require("./admin.service");
const create_portfolio_dto_1 = require("./dto/create-portfolio.dto");
const create_user_dto_1 = require("./dto/create-user.dto");
const grant_portfolio_authorization_dto_1 = require("./dto/grant-portfolio-authorization.dto");
const update_guardrail_config_dto_1 = require("./dto/update-guardrail-config.dto");
const update_portfolio_dto_1 = require("./dto/update-portfolio.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    listUsers() {
        return this.adminService.listUsers();
    }
    createUser(actor, dto) {
        return this.adminService.createUser(actor, dto);
    }
    updateUser(actor, userId, dto) {
        return this.adminService.updateUser(actor, userId, dto);
    }
    listPortfolios() {
        return this.adminService.listPortfolios();
    }
    createPortfolio(actor, dto) {
        return this.adminService.createPortfolio(actor, dto);
    }
    updatePortfolio(actor, portfolioId, dto) {
        return this.adminService.updatePortfolio(actor, portfolioId, dto);
    }
    listPortfolioAuthorizations() {
        return this.adminService.listPortfolioAuthorizations();
    }
    grantPortfolioAuthorization(actor, dto) {
        return this.adminService.grantPortfolioAuthorization(actor, dto);
    }
    revokePortfolioAuthorization(actor, authorizationId) {
        return this.adminService.revokePortfolioAuthorization(actor, authorizationId);
    }
    listGuardrailConfigs() {
        return this.adminService.listGuardrailConfigs();
    }
    updateGuardrailConfig(actor, configId, dto) {
        return this.adminService.updateGuardrailConfig(actor, configId, dto);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('users'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.RMG),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Post)('users'),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Get)('portfolios'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.RMG),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listPortfolios", null);
__decorate([
    (0, common_1.Post)('portfolios'),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_portfolio_dto_1.CreatePortfolioDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createPortfolio", null);
__decorate([
    (0, common_1.Patch)('portfolios/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_portfolio_dto_1.UpdatePortfolioDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePortfolio", null);
__decorate([
    (0, common_1.Get)('portfolio-authorizations'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.RMG),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listPortfolioAuthorizations", null);
__decorate([
    (0, common_1.Post)('portfolio-authorizations'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.RMG),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, grant_portfolio_authorization_dto_1.GrantPortfolioAuthorizationDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "grantPortfolioAuthorization", null);
__decorate([
    (0, common_1.Patch)('portfolio-authorizations/:id/revoke'),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN, client_1.Role.RMG),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "revokePortfolioAuthorization", null);
__decorate([
    (0, common_1.Get)('guardrail-configs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listGuardrailConfigs", null);
__decorate([
    (0, common_1.Patch)('guardrail-configs/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_guardrail_config_dto_1.UpdateGuardrailConfigDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateGuardrailConfig", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
