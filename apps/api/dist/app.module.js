"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const admin_module_1 = require("./admin/admin.module");
const allocations_module_1 = require("./allocations/allocations.module");
const bench_module_1 = require("./bench/bench.module");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("./auth/auth.module");
const health_controller_1 = require("./health.controller");
const prisma_module_1 = require("./prisma/prisma.module");
const reporting_module_1 = require("./reporting/reporting.module");
const resources_module_1 = require("./resources/resources.module");
const termination_module_1 = require("./terminations/termination.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            admin_module_1.AdminModule,
            resources_module_1.ResourcesModule,
            bench_module_1.BenchModule,
            allocations_module_1.AllocationsModule,
            termination_module_1.TerminationModule,
            reporting_module_1.ReportingModule,
        ],
        controllers: [health_controller_1.HealthController],
    })
], AppModule);
