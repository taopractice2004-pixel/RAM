export type ForecastAllocationLike = {
  status?: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  allocationPercent: number | string;
};

export type ForecastResourceLike = {
  id: string;
  status: string;
  allocations?: ForecastAllocationLike[];
};

export type ForecastDemandLike = {
  id: string;
  status: string;
  requiredFte: number | string | { toString(): string };
  startDate: Date | string;
  endDate?: Date | string | null;
};

export type ForecastBucket = {
  weekStart: string;
  weekEnd: string;
  supplyFte: number;
  demandFte: number;
  gapFte: number;
  draftFte: number;
  pipelineFte: number;
  committedFte: number;
  fulfilledFte: number;
  cancelledFte: number;
  stageBasedNote: string;
};

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(value: Date | string): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }
  return date;
}

function toNumber(value: number | string | { toString(): string } | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfWeek(date: Date): Date {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = normalized.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  normalized.setDate(normalized.getDate() + diff);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function overlappingWeek(start: Date, end: Date, weekStart: Date, weekEnd: Date) {
  return start <= weekEnd && end >= weekStart;
}

export function buildForecastBuckets({
  resources,
  demandRequests,
  startDate = new Date(),
  horizonWeeks = 26,
}: {
  resources: ForecastResourceLike[];
  demandRequests: ForecastDemandLike[];
  startDate?: Date | string;
  horizonWeeks?: number;
}): ForecastBucket[] {
  const baseStart = startOfWeek(toDate(startDate));

  return Array.from({ length: horizonWeeks }, (_, index) => {
    const weekStart = addDays(baseStart, index * 7);
    const weekEnd = addDays(weekStart, 6);

    let supplyFte = 0;
    for (const resource of resources) {
      if (resource.status === "ON_ML" || resource.status === "TERMINATED") continue;

      let scheduledPercent = 0;
      for (const allocation of resource.allocations ?? []) {
        if (allocation.status && !["ACTIVE", "SCHEDULED"].includes(allocation.status)) continue;

        const allocStart = toDate(allocation.startDate);
        const allocEnd = allocation.endDate ? toDate(allocation.endDate) : allocStart;
        if (!overlappingWeek(allocStart, allocEnd, weekStart, weekEnd)) continue;

        scheduledPercent += toNumber(allocation.allocationPercent);
      }

      supplyFte += Math.max(0, 1 - scheduledPercent / 100);
    }

    let draftFte = 0;
    let pipelineFte = 0;
    let committedFte = 0;
    let fulfilledFte = 0;
    let cancelledFte = 0;

    for (const demand of demandRequests) {
      const demandStart = toDate(demand.startDate);
      const demandEnd = demand.endDate ? toDate(demand.endDate) : demandStart;
      if (!overlappingWeek(demandStart, demandEnd, weekStart, weekEnd)) continue;

      const fte = toNumber(demand.requiredFte);
      if (demand.status === "DRAFT") draftFte += fte;
      if (demand.status === "PIPELINE") pipelineFte += fte;
      if (demand.status === "COMMITTED") committedFte += fte;
      if (demand.status === "FULFILLED") fulfilledFte += fte;
      if (demand.status === "CANCELLED") cancelledFte += fte;
    }

    const demandFte = draftFte + pipelineFte + committedFte;
    const gapFte = supplyFte - demandFte;

    return {
      weekStart: formatDateLocal(weekStart),
      weekEnd: formatDateLocal(weekEnd),
      supplyFte: Number(supplyFte.toFixed(2)),
      demandFte: Number(demandFte.toFixed(2)),
      gapFte: Number(gapFte.toFixed(2)),
      draftFte: Number(draftFte.toFixed(2)),
      pipelineFte: Number(pipelineFte.toFixed(2)),
      committedFte: Number(committedFte.toFixed(2)),
      fulfilledFte: Number(fulfilledFte.toFixed(2)),
      cancelledFte: Number(cancelledFte.toFixed(2)),
      stageBasedNote: "Stage-based weekly forecast; confidence weights are pending approval.",
    };
  });
}
