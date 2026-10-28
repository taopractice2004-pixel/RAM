import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Notification } from "../types";

const ALERT_CATEGORIES = [
  { key: "demand", title: "Demand", types: ["DEMAND_RAISED", "UNMET_DEMAND"] },
  { key: "allocation", title: "Allocation", types: ["REALLOCATION"] },
  { key: "bench", title: "Bench", types: ["BENCH_AGING"] },
  { key: "approvals", title: "Approvals", types: ["TERMINATION_APPROVAL_NEEDED", "ML_APPROVAL_NEEDED"] },
  { key: "termination", title: "Termination", types: ["TERMINATION"] },
  { key: "imports", title: "Import review", types: ["IMPORT_QUARANTINE"] },
  { key: "access", title: "Blocked actions", types: ["BLOCKED_ACTION"] },
] as const;

const titles: Record<string, string> = {
  REALLOCATION: "Resource reallocated",
  BENCH_AGING: "Bench aging",
  TERMINATION: "Termination update",
  TERMINATION_APPROVAL_NEEDED: "Termination approval needed",
  ML_APPROVAL_NEEDED: "Leave approval needed",
  IMPORT_QUARANTINE: "Import needs review",
  BLOCKED_ACTION: "Action blocked",
  UNMET_DEMAND: "Unmet demand",
  DEMAND_RAISED: "New demand raised",
};

export default function Alerts() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Notification | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 30000,
  });
  const active = useMemo(() => notifications.filter((item) => !item.resolvedAt), [notifications]);
  const category = ALERT_CATEGORIES.find((item) => item.key === selectedCategory);
  const visible = category ? notifications.filter((item) => (category.types as readonly string[]).includes(item.type)) : [];

  async function resolve(item: Notification) {
    await api.post(`/notifications/${item.id}/resolve`);
    setSelected(null);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function openAlert(item: Notification) {
    setSelected(item);
    if (!item.read) {
      await api.post(`/notifications/${item.id}/read`);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  function openRelated(item: Notification) {
    if (item.relatedEntityType === "TerminationRequest" || item.relatedEntityType === "MaternityLeaveRequest") navigate("/approvals");
    else if (item.relatedEntityType === "Resource" && item.relatedEntityId) navigate(`/resources/${item.relatedEntityId}`);
    else if (item.relatedEntityType === "DemandRequest") navigate("/demand");
    else if (item.relatedEntityType === "ImportBatch") navigate(`/admin?tab=imports&batch=${encodeURIComponent(item.relatedEntityId || "")}`);
    setSelected(null);
  }

  return <div className="space-y-5">
    <div><h1 className="text-xl font-semibold text-slate-900">Alerts</h1><p className="text-sm text-slate-500">Notifications grouped by category.</p></div>
    {isLoading ? <div className="card p-8 text-center text-sm text-slate-500">Loading alerts…</div> : selectedCategory ? <section className="space-y-4">
      <div className="flex items-center gap-3"><button className="btn-secondary" onClick={() => setSelectedCategory(null)}>All categories</button><h2 className="text-lg font-semibold">{category?.title} notifications</h2></div>
      {visible.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">No notifications in this category.</div> : <div className="space-y-2">{visible.map((item) => <button key={item.id} onClick={() => openAlert(item)} className={`w-full rounded-xl border p-4 text-left transition hover:border-brand-300 hover:shadow-sm ${item.resolvedAt ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-white"}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-800">{titles[item.type] || item.type.replace(/_/g, " ")}</span><span className={`rounded-full px-2 py-0.5 text-xs ${item.resolvedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{item.resolvedAt ? "Resolved" : "Unresolved"}</span>{!item.read && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800">New</span>}</div><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</p></div><span className="shrink-0 text-sm font-medium text-brand-700">Review</span></div></button>)}</div>}
    </section> : <><div className="text-sm text-slate-500">{active.length} unresolved notifications</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{ALERT_CATEGORIES.map((item) => {
      const count = active.filter((notification) => (item.types as readonly string[]).includes(notification.type)).length;
      return <article key={item.key} className="card flex flex-col gap-4 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-800">{item.title}</h2><span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">{count} unresolved</span></div><button className="btn-primary mt-auto self-start" onClick={() => setSelectedCategory(item.key)}>View notifications</button></article>;
    })}</div></>}
    {selected && <div role="dialog" aria-modal="true" aria-label="Alert details" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setSelected(null)}><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{selected.resolvedAt ? "Resolved alert" : "Unresolved alert"}</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{titles[selected.type] || selected.type.replace(/_/g, " ")}</h2></div><button className="text-slate-400 hover:text-slate-700" onClick={() => setSelected(null)} aria-label="Close">×</button></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.message}</p><p className="mt-3 text-xs text-slate-400">Received {new Date(selected.createdAt).toLocaleString()}</p><div className="mt-6 flex flex-wrap justify-end gap-2">{selected.relatedEntityId && <button className="btn-secondary" onClick={() => openRelated(selected)}>Open related item</button>}{!selected.resolvedAt && <button className="btn-primary" onClick={() => resolve(selected)}>Mark resolved</button>}</div></section></div>}
  </div>;
}
