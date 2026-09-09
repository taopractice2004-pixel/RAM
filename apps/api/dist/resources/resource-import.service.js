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
exports.ResourceImportService = void 0;
const common_1 = require("@nestjs/common");
const parse_1 = require("@fast-csv/parse");
const client_1 = require("@prisma/client");
const XLSX = __importStar(require("xlsx"));
const prisma_service_1 = require("../prisma/prisma.service");
let ResourceImportService = class ResourceImportService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async importFile(actor, file, sourceSystem) {
        if (!file) {
            throw new common_1.BadRequestException('Resource import file is required');
        }
        const rows = await this.parseRows(file);
        if (!rows.length) {
            throw new common_1.BadRequestException('Import file does not contain any rows');
        }
        const syncLog = await this.prisma.syncLog.create({
            data: {
                sourceSystem: sourceSystem ?? 'MANUAL_UPLOAD',
                status: client_1.SyncStatus.SUCCESS,
            },
        });
        let created = 0;
        let updated = 0;
        let quarantined = 0;
        for (const row of rows) {
            const validationErrors = await this.validateRow(row);
            if (validationErrors.length) {
                quarantined += 1;
                await this.prisma.quarantinedRecord.create({
                    data: {
                        syncId: syncLog.id,
                        rawPayload: row,
                        validationErrors: validationErrors,
                        status: client_1.QuarantineStatus.PENDING,
                    },
                });
                continue;
            }
            const portfolio = await this.prisma.portfolio.findUnique({
                where: { code: row.portfolio_code.toUpperCase() },
                select: { id: true },
            });
            if (!portfolio) {
                quarantined += 1;
                await this.prisma.quarantinedRecord.create({
                    data: {
                        syncId: syncLog.id,
                        rawPayload: row,
                        validationErrors: [{ field: 'portfolio_code', message: 'Portfolio not found' }],
                        status: client_1.QuarantineStatus.PENDING,
                    },
                });
                continue;
            }
            const existing = await this.prisma.resource.findUnique({
                where: { employeeOrContractorNo: row.employee_id },
                select: { id: true },
            });
            const data = {
                fullName: row.full_name,
                resourceType: this.mapResourceType(row.employment_type),
                email: row.email.toLowerCase(),
                employeeOrContractorNo: row.employee_id,
                homePortfolioId: portfolio.id,
                jobTitle: row.job_title,
                location: row.location,
                timezone: row.timezone || null,
                totalYearsExperience: row.total_years_experience ? new client_1.Prisma.Decimal(row.total_years_experience) : null,
                dateOfJoining: new Date(row.date_of_joining),
                lifecycleState: this.mapLifecycleState(row.lifecycle_state),
                capacityPct: Number(row.capacity_pct ?? '100'),
                currentAllocatedPct: 0,
                costRate: row.cost_rate ? new client_1.Prisma.Decimal(row.cost_rate) : null,
                billingRate: row.billing_rate ? new client_1.Prisma.Decimal(row.billing_rate) : null,
                currency: row.currency || 'USD',
                recordStatus: client_1.RecordStatus.ACTIVE,
                sourceSystem: sourceSystem ?? 'MANUAL_UPLOAD',
            };
            let resourceRecordId;
            if (existing) {
                updated += 1;
                const updatedResource = await this.prisma.resource.update({
                    where: { employeeOrContractorNo: row.employee_id },
                    data,
                });
                resourceRecordId = updatedResource.id;
            }
            else {
                created += 1;
                const createdResource = await this.prisma.resource.create({ data });
                resourceRecordId = createdResource.id;
            }
            await this.applySkills(resourceRecordId, row.skills);
        }
        const status = quarantined > 0 ? (created > 0 || updated > 0 ? client_1.SyncStatus.PARTIAL_FAILURE : client_1.SyncStatus.FAILED) : client_1.SyncStatus.SUCCESS;
        return this.prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
                recordsCreated: created,
                recordsUpdated: updated,
                recordsQuarantined: quarantined,
                status,
            },
            include: {
                quarantinedRecords: true,
            },
        });
    }
    async parseRows(file) {
        const extension = file.originalname.split('.').pop()?.toLowerCase();
        if (extension === 'csv') {
            return this.parseCsv(file.buffer);
        }
        if (extension === 'xlsx' || extension === 'xls') {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        }
        throw new common_1.BadRequestException('Only CSV and XLSX imports are supported');
    }
    parseCsv(buffer) {
        return new Promise((resolve, reject) => {
            const rows = [];
            const stream = (0, parse_1.parse)({ headers: true, trim: true })
                .on('error', reject)
                .on('data', (row) => rows.push(row))
                .on('end', () => resolve(rows));
            stream.write(buffer);
            stream.end();
        });
    }
    async validateRow(row) {
        const errors = [];
        if (!row.employee_id)
            errors.push({ field: 'employee_id', message: 'Employee ID is required' });
        if (!row.full_name)
            errors.push({ field: 'full_name', message: 'Full name is required' });
        if (!row.email)
            errors.push({ field: 'email', message: 'Email is required' });
        if (!row.portfolio_code)
            errors.push({ field: 'portfolio_code', message: 'Portfolio code is required' });
        if (!row.job_title)
            errors.push({ field: 'job_title', message: 'Job title is required' });
        if (!row.location)
            errors.push({ field: 'location', message: 'Location is required' });
        if (!row.date_of_joining || Number.isNaN(new Date(row.date_of_joining).getTime())) {
            errors.push({ field: 'date_of_joining', message: 'Valid date of joining is required' });
        }
        const capacityPct = Number(row.capacity_pct ?? '100');
        if (!Number.isFinite(capacityPct) || capacityPct < 0 || capacityPct > 100) {
            errors.push({ field: 'capacity_pct', message: 'Capacity percentage must be between 0 and 100' });
        }
        if (row.employment_type) {
            try {
                this.mapResourceType(row.employment_type);
            }
            catch {
                errors.push({ field: 'employment_type', message: 'Employment type must be Employee or Contractor' });
            }
        }
        else {
            errors.push({ field: 'employment_type', message: 'Employment type is required' });
        }
        if (row.lifecycle_state) {
            try {
                this.mapLifecycleState(row.lifecycle_state);
            }
            catch {
                errors.push({ field: 'lifecycle_state', message: 'Lifecycle state is invalid' });
            }
        }
        return errors;
    }
    mapResourceType(value) {
        const normalized = value.trim().toUpperCase();
        if (normalized === 'EMPLOYEE') {
            return client_1.ResourceType.EMPLOYEE;
        }
        if (normalized === 'CONTRACTOR') {
            return client_1.ResourceType.CONTRACTOR;
        }
        throw new Error('Invalid resource type');
    }
    async applySkills(resourceId, skillsCell) {
        if (!skillsCell?.trim()) {
            return;
        }
        const skillNames = skillsCell
            .split(/[;,]/)
            .map((name) => name.trim())
            .filter(Boolean);
        for (const skillName of skillNames) {
            const skill = await this.prisma.skill.upsert({
                where: { name: skillName },
                update: {},
                create: { name: skillName },
            });
            await this.prisma.resourceSkill.upsert({
                where: { resourceId_skillId: { resourceId, skillId: skill.id } },
                update: {},
                create: { resourceId, skillId: skill.id },
            });
        }
    }
    mapLifecycleState(value) {
        if (!value) {
            return client_1.LifecycleState.AVAILABLE;
        }
        const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
        if (normalized in client_1.LifecycleState) {
            return client_1.LifecycleState[normalized];
        }
        throw new Error('Invalid lifecycle state');
    }
};
exports.ResourceImportService = ResourceImportService;
exports.ResourceImportService = ResourceImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ResourceImportService);
