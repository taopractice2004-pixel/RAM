"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const scope_1 = require("../utils/scope");
const benchService_1 = require("../services/benchService");
const csv_1 = require("../utils/csv");
const resourcePresentation_1 = require("../utils/resourcePresentation");
const forecast_1 = require("../utils/forecast");
const router = (0, express_1.Router)();
function respond(req, res, rows, filename) {
    const format = req.query.format || "json";
    if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send((0, csv_1.toCsv)(rows));
    }
    res.json(rows);
}
// FR-10.1: utilization report by resource / project / department, incl. allocation history.
router.get("/utilization", async (req, res) => {
    const resources = await prisma_1.prisma.resource.findMany({
        where: (0, scope_1.portfolioReadWhere)(req),
        include: {
            portfolio: true,
            allocations: { include: { project: true }, orderBy: { startDate: "desc" } },
        },
    });
    const rows = resources.map((r) => {
        const allocationSummary = (0, resourcePresentation_1.deriveAllocationSummary)(r.allocations);
        return {
            employeeId: r.employeeId,
            name: r.name,
            portfolio: r.portfolio.name,
            managerName: r.managerName,
            designation: r.designation,
            country: r.country,
            workLocation: r.workLocation,
            subCategory: r.subCategory,
            status: r.status,
            taoExperienceYears: (0, resourcePresentation_1.deriveTaoExperienceYears)(r.dateOfJoining),
            totalYearsExperience: (0, resourcePresentation_1.deriveTotalYearsExperience)(r.priorExperienceYears, r.dateOfJoining),
            currentAllocationPercent: allocationSummary.totalAllocatedPercent,
            availablePercentForDeployment: allocationSummary.availablePercentForDeployment,
            overallFte: allocationSummary.overallFte,
            empCount: allocationSummary.empCount,
            activeProjects: r.allocations.filter((a) => a.status === "ACTIVE").map((a) => a.project.name).join("; "),
            totalAllocationsEver: r.allocations.length,
            lastAllocationStart: r.allocations[0]?.startDate?.toISOString().slice(0, 10) ?? "",
        };
    });
    respond(req, res, rows, "utilization_report.csv");
});
// FR-10.3: basic capacity planning - current supply distribution by portfolio/status.
router.get("/capacity", async (req, res) => {
    const resources = await prisma_1.prisma.resource.findMany({
        where: { ...(0, scope_1.portfolioReadWhere)(req), status: { not: "TERMINATED" } },
        include: { portfolio: true, skills: { include: { skill: true } } },
    });
    const byPortfolio = new Map();
    for (const r of resources) {
        const key = r.portfolio.name;
        if (!byPortfolio.has(key)) {
            byPortfolio.set(key, { portfolio: key, available: 0, allocated: 0, benchCommitted: 0, benchTrue: 0, onMl: 0 });
        }
        const entry = byPortfolio.get(key);
        if (r.status === "AVAILABLE")
            entry.available++;
        if (r.status === "ALLOCATED")
            entry.allocated++;
        if (r.status === "BENCH_COMMITTED")
            entry.benchCommitted++;
        if (r.status === "BENCH_TRUE")
            entry.benchTrue++;
        if (r.status === "ON_ML")
            entry.onMl++;
    }
    respond(req, res, Array.from(byPortfolio.values()), "capacity_report.csv");
});
router.get("/forecast", async (req, res) => {
    const scope = (0, scope_1.portfolioReadWhere)(req);
    const [resources, demandRequests] = await Promise.all([
        prisma_1.prisma.resource.findMany({
            where: { ...scope, status: { notIn: ["TERMINATED", "ON_ML"] } },
            include: {
                allocations: {
                    where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
                    select: {
                        status: true,
                        startDate: true,
                        endDate: true,
                        allocationPercent: true,
                    },
                },
            },
        }),
        prisma_1.prisma.demandRequest.findMany({
            where: { ...scope, status: { in: ["DRAFT", "PIPELINE", "COMMITTED", "FULFILLED", "CANCELLED"] } },
            select: {
                id: true,
                status: true,
                requiredFte: true,
                startDate: true,
                endDate: true,
            },
        }),
    ]);
    const rows = (0, forecast_1.buildForecastBuckets)({
        resources,
        demandRequests,
        startDate: new Date(),
        horizonWeeks: 26,
    });
    respond(req, res, rows, "forecast_report.csv");
});
// FR-10.4: bench aging and termination trend report.
router.get("/bench-aging", async (req, res) => {
    const { portfolioId, status, minDays, maxDays, from, to, summary } = req.query;
    const resources = await prisma_1.prisma.resource.findMany({
        where: {
            ...(0, scope_1.portfolioReadWhere)(req),
            ...(portfolioId ? { portfolioId } : {}),
            ...(status ? { status: status } : { status: { in: ["BENCH_COMMITTED", "BENCH_TRUE"] } }),
        },
        include: { portfolio: true },
    });
    const now = Date.now();
    const rows = await Promise.all(resources.map(async (r) => {
        const config = await (0, benchService_1.getBenchConfig)(r.portfolioId);
        const days = r.benchSince ? Math.floor((now - r.benchSince.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        const benchDays = (0, resourcePresentation_1.deriveBenchAgingDays)(r) ?? days;
        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;
        const benchSince = r.benchSince ?? new Date();
        if (minDays && benchDays < Number(minDays))
            return null;
        if (maxDays && benchDays > Number(maxDays))
            return null;
        if (fromDate && benchSince < fromDate)
            return null;
        if (toDate && benchSince > toDate)
            return null;
        return {
            employeeId: r.employeeId,
            name: r.name,
            portfolio: r.portfolio.name,
            managerName: r.managerName,
            subCategory: r.subCategory,
            classification: r.status,
            daysOnBench: benchDays,
            agingPastThreshold: r.status === "BENCH_TRUE" && days >= config.trueBenchAgingThresholdDays,
            benchSince: benchSince.toISOString().slice(0, 10),
        };
    }));
    const filteredRows = rows.filter(Boolean);
    if (summary === "true") {
        const byClassification = filteredRows.reduce((acc, row) => {
            const classification = String(row.classification ?? "UNKNOWN");
            acc[classification] = (acc[classification] ?? 0) + 1;
            return acc;
        }, {});
        const avgDays = filteredRows.length === 0 ? 0 : filteredRows.reduce((sum, row) => sum + Number(row.daysOnBench ?? 0), 0) / filteredRows.length;
        return res.json({
            summary: {
                totalRows: filteredRows.length,
                averageDaysOnBench: Number(avgDays.toFixed(2)),
                byClassification,
                agingThresholdExceeded: filteredRows.filter((row) => row.agingPastThreshold === true).length,
            },
            rows: filteredRows,
        });
    }
    respond(req, res, filteredRows, "bench_aging_report.csv");
});
router.get("/termination-trends", async (req, res) => {
    const { portfolioId, status, reasonCode, from, to, summary } = req.query;
    const requests = await prisma_1.prisma.terminationRequest.findMany({
        where: {
            ...(status ? { status: status } : { status: "COMPLETED" }),
            ...(reasonCode ? { reasonCode } : {}),
            ...(from || to ? {
                decidedAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                },
            } : {}),
        },
        include: { resource: { include: { portfolio: true } } },
        orderBy: { decidedAt: "desc" },
    });
    const scope = (0, scope_1.portfolioReadWhere)(req);
    const filtered = scope.portfolioId ? requests.filter((r) => scope.portfolioId.in.includes(r.resource.portfolioId)) : requests;
    const filteredByPortfolio = portfolioId ? filtered.filter((r) => r.resource.portfolioId === portfolioId) : filtered;
    const rows = filteredByPortfolio.map((r) => ({
        employeeId: r.resource.employeeId,
        name: r.resource.name,
        portfolio: r.resource.portfolio.name,
        status: r.status,
        reasonCode: r.reasonCode,
        decidedAt: r.decidedAt?.toISOString().slice(0, 10) ?? "",
    }));
    if (summary === "true") {
        const byReason = rows.reduce((acc, row) => {
            const reason = String(row.reasonCode ?? "UNKNOWN");
            acc[reason] = (acc[reason] ?? 0) + 1;
            return acc;
        }, {});
        return res.json({
            summary: {
                totalRows: rows.length,
                byReason,
                byStatus: rows.reduce((acc, row) => {
                    const state = String(row.status ?? "UNKNOWN");
                    acc[state] = (acc[state] ?? 0) + 1;
                    return acc;
                }, {}),
            },
            rows,
        });
    }
    respond(req, res, rows, "termination_trends_report.csv");
});
exports.default = router;
