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
exports.ReportingService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const portfolio_auth_service_1 = require("../auth/portfolio-auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
let ReportingService = class ReportingService {
    prisma;
    portfolioAuthService;
    constructor(prisma, portfolioAuthService) {
        this.prisma = prisma;
        this.portfolioAuthService = portfolioAuthService;
    }
    async refreshViews() {
        await this.ensureViewsExist();
        await this.prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW utilization_summary_mv;');
        await this.prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW bench_aging_summary_mv;');
        await this.prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW active_allocation_summary_mv;');
        await this.prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW portfolio_capacity_summary_mv;');
        return { refreshed: true };
    }
    async getUtilizationSummary(actor) {
        await this.ensureViewsExist();
        const rows = await this.prisma.$queryRawUnsafe('SELECT * FROM utilization_summary_mv ORDER BY full_name ASC');
        return this.filterByPortfolio(actor, this.serializeRows(rows), 'home_portfolio_id');
    }
    async getBenchAgingSummary(actor) {
        await this.ensureViewsExist();
        const rows = await this.prisma.$queryRawUnsafe('SELECT * FROM bench_aging_summary_mv ORDER BY aging_days DESC, full_name ASC');
        return this.filterByPortfolio(actor, this.serializeRows(rows), 'home_portfolio_id');
    }
    async getActiveAllocationSummary(actor) {
        await this.ensureViewsExist();
        const rows = await this.prisma.$queryRawUnsafe('SELECT * FROM active_allocation_summary_mv ORDER BY start_date ASC');
        return this.filterByPortfolio(actor, this.serializeRows(rows), 'portfolio_id');
    }
    async getPortfolioCapacitySummary(actor) {
        await this.ensureViewsExist();
        const rows = await this.prisma.$queryRawUnsafe('SELECT * FROM portfolio_capacity_summary_mv ORDER BY portfolio_name ASC');
        return this.filterByPortfolio(actor, this.serializeRows(rows), 'portfolio_id');
    }
    toCsv(rows) {
        if (!rows.length) {
            return '';
        }
        const headers = Object.keys(rows[0]);
        const escape = (value) => {
            const text = value === null || value === undefined ? '' : String(value);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const lines = [headers.join(',')];
        for (const row of rows) {
            lines.push(headers.map((header) => escape(row[header])).join(','));
        }
        return lines.join('\n');
    }
    async filterByPortfolio(actor, rows, portfolioColumn) {
        if (actor.role === client_1.Role.ADMIN || actor.role === client_1.Role.HR || actor.role === client_1.Role.RMG) {
            return rows;
        }
        const visible = [];
        for (const row of rows) {
            const portfolioId = row[portfolioColumn];
            if (typeof portfolioId !== 'string') {
                continue;
            }
            const allowed = await this.portfolioAuthService.canReadPortfolio(actor.id, actor.role, portfolioId);
            if (allowed) {
                visible.push(row);
            }
        }
        return visible;
    }
    async ensureViewsExist() {
        await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS utilization_summary_mv AS
      SELECT
        r.id AS resource_id,
        r."fullName" AS full_name,
        r."homePortfolioId" AS home_portfolio_id,
        COALESCE(SUM(CASE WHEN a.status IN ('ACTIVE','SCHEDULED') THEN a."allocationPct" ELSE 0 END), 0) AS allocated_pct
      FROM "Resource" r
      LEFT JOIN "Allocation" a ON a."resourceId" = r.id
      GROUP BY r.id, r."fullName", r."homePortfolioId";
    `);
        await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS bench_aging_summary_mv AS
      SELECT
        b.id AS bench_record_id,
        b."resourceId" AS resource_id,
        r."fullName" AS full_name,
        r."homePortfolioId" AS home_portfolio_id,
        b."benchType" AS bench_type,
        b."agingDays" AS aging_days,
        b."alertSent" AS alert_sent
      FROM "BenchRecord" b
      JOIN "Resource" r ON r.id = b."resourceId"
      WHERE b."benchEndDate" IS NULL;
    `);
        await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS active_allocation_summary_mv AS
      SELECT
        a.id AS allocation_id,
        a."resourceId" AS resource_id,
        r."fullName" AS full_name,
        p.code AS project_code,
        p.name AS project_name,
        p."portfolioId" AS portfolio_id,
        a."allocationPct" AS allocation_pct,
        a.status,
        a."startDate" AS start_date,
        a."endDate" AS end_date
      FROM "Allocation" a
      JOIN "Resource" r ON r.id = a."resourceId"
      JOIN "Project" p ON p.id = a."projectId"
      WHERE a.status IN ('ACTIVE', 'SCHEDULED');
    `);
        await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS portfolio_capacity_summary_mv AS
      SELECT
        p.id AS portfolio_id,
        p.code AS portfolio_code,
        p.name AS portfolio_name,
        COUNT(r.id) AS resource_count,
        COALESCE(SUM(r."capacityPct"), 0) AS total_capacity_pct,
        COALESCE(SUM(r."currentAllocatedPct"), 0) AS current_allocated_pct
      FROM "Portfolio" p
      LEFT JOIN "Resource" r ON r."homePortfolioId" = p.id AND r."lifecycleState" != 'TERMINATED'
      GROUP BY p.id, p.code, p.name;
    `);
    }
    serializeRows(rows) {
        return JSON.parse(JSON.stringify(rows, (_key, value) => {
            if (typeof value === 'bigint') {
                return value.toString();
            }
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        }));
    }
};
exports.ReportingService = ReportingService;
exports.ReportingService = ReportingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        portfolio_auth_service_1.PortfolioAuthService])
], ReportingService);
