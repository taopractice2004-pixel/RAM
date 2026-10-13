"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundOneDecimal = roundOneDecimal;
exports.deriveTaoExperienceYears = deriveTaoExperienceYears;
exports.deriveTotalYearsExperience = deriveTotalYearsExperience;
exports.deriveBenchAgingDays = deriveBenchAgingDays;
exports.deriveAllocationSummary = deriveAllocationSummary;
exports.deriveProjectedBenchStartDate = deriveProjectedBenchStartDate;
exports.deriveDefaultSubCategory = deriveDefaultSubCategory;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_YEAR = MS_PER_DAY * 365.25;
function roundOneDecimal(value) {
    return Math.round(value * 10) / 10;
}
function deriveTaoExperienceYears(dateOfJoining, now = new Date()) {
    if (!dateOfJoining)
        return 0;
    return Math.max(0, roundOneDecimal((now.getTime() - dateOfJoining.getTime()) / MS_PER_YEAR));
}
function deriveTotalYearsExperience(priorExperienceYears, dateOfJoining, now = new Date()) {
    return roundOneDecimal((priorExperienceYears ?? 0) + deriveTaoExperienceYears(dateOfJoining, now));
}
function deriveBenchAgingDays(resource, now = new Date()) {
    const anchor = resource.benchSince ?? (resource.status === "AVAILABLE" ? resource.dateOfJoining : null);
    if (!anchor)
        return null;
    return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY));
}
function deriveAllocationSummary(allocations) {
    const activeLike = allocations.filter((a) => a.status === "ACTIVE" || a.status === "SCHEDULED");
    const totalAllocatedPercent = activeLike.reduce((sum, a) => sum + a.allocationPercent, 0);
    return {
        totalAllocatedPercent,
        availablePercentForDeployment: Math.max(0, 100 - totalAllocatedPercent),
        overallFte: 1,
        empCount: roundOneDecimal(totalAllocatedPercent / 100),
    };
}
function deriveProjectedBenchStartDate(allocations) {
    const active = allocations.find((a) => a.status === "ACTIVE");
    const scheduled = allocations
        .filter((a) => a.status === "SCHEDULED")
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
    if (!active?.endDate)
        return null;
    if (scheduled && scheduled.startDate <= active.endDate)
        return null;
    return active.endDate;
}
function deriveDefaultSubCategory(resource, opts) {
    if (resource.status === "ON_ML")
        return "ML";
    if (resource.status === "BENCH_COMMITTED")
        return "Committed Bench";
    if (resource.status === "BENCH_TRUE")
        return "Bench";
    if (resource.status === "TERMINATED")
        return "Termination";
    if (resource.status === "ALLOCATED") {
        if (opts?.isInternalProject)
            return "Internal Project";
        if (opts?.billingDelayed)
            return "Billing Delay";
        return "Allocated";
    }
    if (opts?.isInternalProject)
        return "Internal Project";
    if (opts?.billingDelayed)
        return "Billing Delay";
    return resource.subCategory;
}
