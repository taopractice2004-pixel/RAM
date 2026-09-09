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
exports.TerminationController = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const initiate_termination_dto_1 = require("./dto/initiate-termination.dto");
const termination_service_1 = require("./termination.service");
let TerminationController = class TerminationController {
    terminationService;
    constructor(terminationService) {
        this.terminationService = terminationService;
    }
    listTerminations(actor) {
        return this.terminationService.listTerminations(actor);
    }
    initiateTermination(actor, dto) {
        return this.terminationService.initiateTermination(actor, dto);
    }
    approveTermination(actor, terminationId) {
        return this.terminationService.approveTermination(actor, terminationId);
    }
};
exports.TerminationController = TerminationController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TerminationController.prototype, "listTerminations", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, initiate_termination_dto_1.InitiateTerminationDto]),
    __metadata("design:returntype", void 0)
], TerminationController.prototype, "initiateTermination", null);
__decorate([
    (0, common_1.Patch)(':id/approve'),
    (0, roles_decorator_1.Roles)(client_1.Role.HR, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TerminationController.prototype, "approveTermination", null);
exports.TerminationController = TerminationController = __decorate([
    (0, common_1.Controller)('terminations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [termination_service_1.TerminationService])
], TerminationController);
