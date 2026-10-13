export const allowedDemandTransitions: Record<string, string[]> = {
  DRAFT: ["PIPELINE", "CANCELLED"],
  PIPELINE: ["COMMITTED", "CANCELLED"],
  COMMITTED: ["FULFILLED", "CANCELLED"],
  FULFILLED: [],
  CANCELLED: [],
};

export function validateDemandTransition(currentStatus: string, nextStatus?: string) {
  if (!nextStatus || nextStatus === currentStatus) return true;
  return (allowedDemandTransitions[currentStatus] ?? []).includes(nextStatus);
}

export function parseDemandCsvList(value?: string | null) {
  if (!value) return [];
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}
