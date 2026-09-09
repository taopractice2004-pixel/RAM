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
exports.ResourcesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const client_1 = require("@prisma/client");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const add_resource_skill_dto_1 = require("./dto/add-resource-skill.dto");
const import_resources_dto_1 = require("./dto/import-resources.dto");
const resource_query_dto_1 = require("./dto/resource-query.dto");
const resource_import_service_1 = require("./resource-import.service");
const resources_service_1 = require("./resources.service");
let ResourcesController = class ResourcesController {
    resourcesService;
    resourceImportService;
    constructor(resourcesService, resourceImportService) {
        this.resourcesService = resourcesService;
        this.resourceImportService = resourceImportService;
    }
    listResources(actor, query) {
        return this.resourcesService.listResources(actor, query);
    }
    listSkills() {
        return this.resourcesService.listSkills();
    }
    listSyncLogs() {
        return this.resourcesService.listSyncLogs();
    }
    listQuarantinedRecords() {
        return this.resourcesService.listQuarantinedRecords();
    }
    async resolveQuarantinedRecord(actor, quarantineId) {
        const resolved = await this.resourcesService.resolveQuarantinedRecord(actor, quarantineId);
        if (!resolved) {
            throw new common_1.BadRequestException('Quarantined record not found');
        }
        return resolved;
    }
    importResources(actor, file, query) {
        return this.resourceImportService.importFile(actor, file, query.sourceSystem);
    }
    async getResource(actor, resourceId) {
        const resource = await this.resourcesService.getResource(actor, resourceId);
        if (!resource) {
            throw new common_1.BadRequestException('Resource not found or not accessible');
        }
        return resource;
    }
    async getResourceAuditHistory(actor, resourceId) {
        const history = await this.resourcesService.getResourceAuditHistory(actor, resourceId);
        if (!history) {
            throw new common_1.BadRequestException('Resource not found or not accessible');
        }
        return history;
    }
    async addResourceSkill(actor, resourceId, dto) {
        const result = await this.resourcesService.addResourceSkill(actor, resourceId, dto);
        if (!result) {
            throw new common_1.BadRequestException('Resource not found or not accessible');
        }
        return result;
    }
};
exports.ResourcesController = ResourcesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, resource_query_dto_1.ResourceQueryDto]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "listResources", null);
__decorate([
    (0, common_1.Get)('skills'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "listSkills", null);
__decorate([
    (0, common_1.Get)('imports/sync-logs'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "listSyncLogs", null);
__decorate([
    (0, common_1.Get)('imports/quarantine'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "listQuarantinedRecords", null);
__decorate([
    (0, common_1.Patch)('imports/quarantine/:id/resolve'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "resolveQuarantinedRecord", null);
__decorate([
    (0, common_1.Post)('imports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 5 * 1024 * 1024 } })),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, import_resources_dto_1.ImportResourcesDto]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "importResources", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getResource", null);
__decorate([
    (0, common_1.Get)(':id/audit-history'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getResourceAuditHistory", null);
__decorate([
    (0, common_1.Post)(':id/skills'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.RMG, client_1.Role.HR, client_1.Role.ADMIN),
    __param(0, (0, current_user_decorator_1.CurrentUserDecorator)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, add_resource_skill_dto_1.AddResourceSkillDto]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "addResourceSkill", null);
exports.ResourcesController = ResourcesController = __decorate([
    (0, common_1.Controller)('resources'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [resources_service_1.ResourcesService,
        resource_import_service_1.ResourceImportService])
], ResourcesController);
