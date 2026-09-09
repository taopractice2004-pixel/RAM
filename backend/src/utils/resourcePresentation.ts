import { Allocation, Resource } from "@prisma/client";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_YEAR = MS_PER_DAY * 365.25;

export function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function deriveTaoExperienceYears(dateOfJoining: Date | null | undefined, now: Date = new Date()) {
  if (!dateOfJoining) return 0;
  return Math.max(0, roundOneDecimal((now.getTime() - dateOfJoining.getTime()) / MS_PER_YEAR));
}

export function deriveTotalYearsExperience(priorExperienceYears: number | null | undefined, dateOfJoining: Date | null | undefined, now: Date = new Date()) {
  return roundOneDecimal((priorExperienceYears ?? 0) + deriveTaoExperienceYears(dateOfJoining, now));
}

export function deriveBenchAgingDays(resource: Pick<Resource, "benchSince" | "dateOfJoining" | "status">, now: Date = new Date()) {
  const anchor = resource.benchSince ?? (resource.status === "AVAILABLE" ? resource.dateOfJoining : null);
  if (!anchor) return null;
  return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY));
}

export function deriveAllocationSummary(allocations: Pick<Allocation, "allocationPercent" | "status">[]) {
  const activeLike = allocations.filter((a) => a.status === "ACTIVE" || a.status === "SCHEDULED");
  const totalAllocatedPercent = activeLike.reduce((sum, a) => sum + a.allocationPercent, 0);
  return {
    totalAllocatedPercent,
    availablePercentForDeployment: Math.max(0, 100 - totalAllocatedPercent),
    overallFte: 1,
    empCount: roundOneDecimal(totalAllocatedPercent / 100),
  };
}

export function deriveProjectedBenchStartDate(allocations: Pick<Allocation, "status" | "endDate" | "startDate">[]) {
  const active = allocations.find((a) => a.status === "ACTIVE");
  const scheduled = allocations
    .filter((a) => a.status === "SCHEDULED")
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  if (!active?.endDate) return null;
  if (scheduled && scheduled.startDate <= active.endDate) return null;
  return active.endDate;
}

export function deriveDefaultSubCategory(resource: Pick<Resource, "status" | "subCategory">, opts?: { isInternalProject?: boolean; billingDelayed?: boolean }) {
  if (resource.status === "ON_ML") return "ML";
  if (resource.status === "BENCH_COMMITTED") return "Committed Bench";
  if (resource.status === "BENCH_TRUE") return "Bench";
  if (resource.status === "TERMINATED") return "Termination";
  if (resource.status === "ALLOCATED") {
    if (opts?.isInternalProject) return "Internal Project";
    if (opts?.billingDelayed) return "Billing Delay";
    return "Allocated";
  }
  if (opts?.isInternalProject) return "Internal Project";
  if (opts?.billingDelayed) return "Billing Delay";
  return resource.subCategory;
}
