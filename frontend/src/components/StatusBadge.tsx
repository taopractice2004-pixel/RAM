const COLORS: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  ALLOCATED: "bg-brand-100 text-brand-700",
  BENCH_COMMITTED: "bg-amber-100 text-amber-700",
  BENCH_TRUE: "bg-orange-100 text-orange-700",
  ON_ML: "bg-fuchsia-100 text-fuchsia-700",
  TERMINATED: "bg-slate-200 text-slate-600",
  ACTIVE: "bg-brand-100 text-brand-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  CLOSED: "bg-slate-200 text-slate-600",
  CANCELLED: "bg-slate-200 text-slate-600",
  PENDING_HR_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-brand-100 text-brand-700",
  REJECTED: "bg-red-100 text-red-700",
  COMPLETED: "bg-slate-200 text-slate-600",
};

const LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  CLOSED: "Closed / History",
  CANCELLED: "Cancelled",
};

export default function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${COLORS[status] || "bg-slate-100 text-slate-700"}`}>{LABELS[status] || status.replace(/_/g, " ")}</span>;
}
