"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const resourcePresentation_1 = require("../utils/resourcePresentation");
const router = (0, express_1.Router)();
/**
 * FR-4.2 / FR-6.1 / Workflow 7.4: bench view, split into Committed vs True Bench.
 * Visible org-wide per Section 5.3 row 1 (non-sensitive profile data, no cost/PIP
 * shown here) - matches TA's persona goal of checking bench talent across the org
 * before opening an external requisition. Allocation/reallocation actions on a bench
 * resource reuse POST /api/allocations (FR-4.4), which remains portfolio-gated.
 */
router.get("/", async (req, res) => {
    const { classification } = req.query;
    const where = {
        status: classification
            ? { in: classification.split(",") }
            : { in: ["BENCH_COMMITTED", "BENCH_TRUE"] },
    };
    const resources = await prisma_1.prisma.resource.findMany({
        where,
        include: {
            portfolio: true,
            skills: { include: { skill: true } },
            allocations: {
                where: { status: "SCHEDULED" },
                orderBy: { startDate: "asc" },
                take: 1,
                include: { project: true },
            },
        },
        orderBy: { benchSince: "asc" },
    });
    const now = new Date();
    const enriched = resources.map((r) => ({
        ...r,
        taoExperienceYears: (0, resourcePresentation_1.deriveTaoExperienceYears)(r.dateOfJoining),
        totalYearsExperience: (0, resourcePresentation_1.deriveTotalYearsExperience)(r.priorExperienceYears, r.dateOfJoining),
        daysOnBench: (0, resourcePresentation_1.deriveBenchAgingDays)(r, now),
        nextScheduledAllocation: r.allocations[0] ?? null,
        projectedBenchStartDate: (0, resourcePresentation_1.deriveProjectedBenchStartDate)(r.allocations),
        subCategory: (0, resourcePresentation_1.deriveDefaultSubCategory)({ status: r.status, subCategory: r.subCategory }),
        ...(0, resourcePresentation_1.deriveAllocationSummary)(r.allocations),
    }));
    res.json(enriched);
});
exports.default = router;
