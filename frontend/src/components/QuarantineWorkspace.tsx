import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { ImportRecord } from "../types";

type Workspace = { records: ImportRecord[]; counts: Record<string, number>; total: number; pages: number; page: number };
type Detail = ImportRecord & { audits?: Array<{ id: string; action: string; actorId: string | null; createdAt: string; success: boolean; message: string | null }>; capabilities?: { edit: boolean; release: boolean; review: boolean; discard: boolean } };
const FIELDS = ["employeeId", "name", "gender", "country", "workLocation", "location", "willingToRelocate", "costRate", "currency", "portfolioCode", "managerName", "designation", "subCategory", "dateOfJoining", "priorExperienceYears", "totalYoe", "taoExperience", "skills", "certifications"];
const label = (field: string) => field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());

export default function QuarantineWorkspace() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("createdAt");
  const [direction, setDirection] = useState("desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery<Workspace>({ queryKey: ["quarantine-workspace", search, status, page, sort, direction], queryFn: async () => (await api.get("/imports/quarantine/list", { params: { search, status, page, pageSize: 25, sort, direction } })).data });
  const { data: detail } = useQuery<Detail>({ queryKey: ["quarantine-detail", activeId], enabled: !!activeId, queryFn: async () => (await api.get(`/imports/quarantine/${activeId}`)).data });
  useEffect(() => { if (detail) setDraft(detail.rawData ?? {}); }, [detail?.id, detail?.version]);
  const records = data?.records ?? [];
  const unresolved = useMemo(() => Object.values(data?.counts ?? {}).reduce((sum, count) => sum + count, 0), [data?.counts]);
  const summary = [
    ["Unresolved", unresolved], ["Missing data", records.filter((record) => (record.errors ?? []).some((error) => /missing|required/i.test(error))).length],
    ["Invalid values", records.filter((record) => (record.errors ?? []).some((error) => /invalid|must be|exceeds/i.test(error))).length],
    ["Duplicates", records.filter((record) => (record.errors ?? []).some((error) => /duplicate/i.test(error))).length],
    ["Contradictions", records.filter((record) => (record.errors ?? []).some((error) => /conflict|reconcil|contradict/i.test(error))).length],
    ["Manual review", records.filter((record) => Boolean(record.review?.reviewed)).length],
    ["Saved for revalidation", records.filter((record) => Boolean(record.validation)).length],
  ];
  function invalidate() { void client.invalidateQueries({ queryKey: ["quarantine"] }); void client.invalidateQueries({ queryKey: ["quarantine-workspace"] }); void client.invalidateQueries({ queryKey: ["quarantine-detail"] }); void client.invalidateQueries({ queryKey: ["import-batches"] }); void client.invalidateQueries({ queryKey: ["resources"] }); }
  async function mutate(action: "save" | "validate" | "review", values?: Record<string, string>) {
    if (!detail) return;
    setBusy(true); setNotice("");
    try {
      const { data: updated } = await api.patch(`/imports/quarantine/${detail.id}`, { expectedVersion: detail.version, action, values, reviewed: true });
      setNotice(action === "validate" ? `Validation ${updated.validation?.valid ? "passed" : "found issues"}.` : action === "save" ? "Corrections saved." : "Marked for review.");
      invalidate();
    } catch (error: any) { setNotice(error.response?.data?.error ?? "Action failed. Reload the record and retry."); }
    finally { setBusy(false); }
  }
  async function release(record: ImportRecord, values: Record<string, string>) {
    setBusy(true);
    try {
      const { data: result } = await api.post(`/imports/quarantine/${record.id}/resolve`, { expectedVersion: record.version, values });
      setNotice(`Record ${record.employeeId}: ${result.record?.status ?? "processed"}.`); invalidate(); setActiveId(null);
    } catch (error: any) { setNotice(error.response?.data?.error ?? "Release failed; record was revalidated by the server."); }
    finally { setBusy(false); }
  }
  async function discard(record: ImportRecord) {
    if (!window.confirm(`Discard ${record.employeeId}? This record will remain in import history.`)) return;
    setBusy(true);
    try { await api.post(`/imports/quarantine/${record.id}/discard`); setNotice("Record discarded and retained in history."); invalidate(); setActiveId(null); }
    catch (error: any) { setNotice(error.response?.data?.error ?? "Discard failed."); }
    finally { setBusy(false); }
  }
  function sortBy(column: string) { if (sort === column) setDirection(direction === "asc" ? "desc" : "asc"); else { setSort(column); setDirection("asc"); } }
  async function bulkRevalidate() {
    const chosen = records.filter((record) => selected.includes(record.id));
    const eligible = chosen.filter((record) => record.status !== "PENDING" && record.capabilities?.release !== false);
    const excluded = chosen.length - eligible.length;
    if (!window.confirm(`Revalidate and release ${eligible.length} selected saved records? ${excluded} selected records will be excluded. Every record will be revalidated on the server.`)) return;
    setBusy(true);
    const outcomes = await Promise.allSettled(eligible.map((record) => api.post(`/imports/quarantine/${record.id}/resolve`, { expectedVersion: record.version, values: record.rawData })));
    setNotice(`${outcomes.filter((outcome) => outcome.status === "fulfilled").length} processed; ${outcomes.filter((outcome) => outcome.status === "rejected").length} failed; ${excluded} excluded.`);
    setSelected([]); setBusy(false); invalidate();
  }
  return <section className="space-y-4" aria-busy={busy}>
    {notice && <p role="status" aria-live="polite" className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">{notice}</p>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{summary.map(([title, amount]) => <div key={title} className="card p-3"><div className="text-xs font-medium text-slate-500">{title}</div><div className="mt-1 text-xl font-semibold text-slate-900">{amount}</div></div>)}</div>
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4"><h2 className="mr-auto text-sm font-semibold text-slate-800">Quarantine records</h2><input className="input max-w-xs" aria-label="Search quarantine" placeholder="Search ID or name" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select className="input max-w-48" aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All unresolved</option><option value="QUARANTINED">Quarantined</option><option value="FAILED">Failed</option><option value="PENDING">Pending</option></select><button className="btn-secondary" disabled={busy || !selected.length} onClick={() => void bulkRevalidate()}>Revalidate selected ({selected.length})</button></div>
      <div className="max-h-[65vh] overflow-auto"><table className="min-w-full border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-xs text-slate-600"><tr><th className="border-b px-3 py-2"><input aria-label="Select visible records" type="checkbox" checked={records.length > 0 && records.every((record) => selected.includes(record.id))} onChange={(event) => setSelected(event.target.checked ? Array.from(new Set([...selected, ...records.map((record) => record.id)])) : selected.filter((id) => !records.some((record) => record.id === id)))} /></th>{[["employeeId", "Employee / ID"], ["batchId", "Batch"], ["rowNumber", "Worksheet row"], ["createdAt", "Imported"], ["updatedAt", "Updated"], ["status", "Status"]].map(([key, title]) => <th key={key} className="cursor-pointer whitespace-nowrap border-b px-3 py-2" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" onClick={() => sortBy(key)}>{title}{sort === key ? direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}<th className="border-b px-3 py-2">Issues</th><th className="border-b px-3 py-2">Actions</th></tr></thead><tbody>{records.map((record) => { const errors = record.errors ?? []; const rowClass = errors.length ? "bg-red-50/70" : ""; return <tr key={record.id} className={`border-b border-slate-100 ${rowClass}`}><td className="px-3 py-2"><input aria-label={`Select ${record.employeeId}`} type="checkbox" checked={selected.includes(record.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} /></td><td className="px-3 py-2"><button className="font-medium text-brand-800 underline-offset-2 hover:underline" onClick={() => setActiveId(record.id)}>{String(record.rawData?.name || record.employeeId)}</button><span className="block text-xs text-slate-500">{record.employeeId}</span></td><td className="px-3 py-2 font-mono text-xs">{record.batchId.slice(0, 8)} · {record.batch?.source ?? "Import"}</td><td className="px-3 py-2">{record.rowNumber ?? "—"}</td><td className="px-3 py-2 whitespace-nowrap">{record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "—"}</td><td className="px-3 py-2 whitespace-nowrap">{record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "—"}</td><td className="px-3 py-2"><span className="rounded border border-slate-300 px-2 py-1 text-xs">{record.status}</span>{record.review?.reviewed && <span className="ml-1 text-xs">Review flagged</span>}</td><td className="max-w-sm px-3 py-2"><span className="font-medium">{errors.length} issue(s)</span>{errors.slice(0, 2).map((error, index) => <span className="block truncate text-xs text-red-900" key={index}>{error}</span>)}</td><td className="px-3 py-2"><button className="text-xs font-medium text-brand-800 underline" onClick={() => setActiveId(record.id)}>Open details</button></td></tr>; })}{records.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">No unresolved records match these filters.</td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-200 p-3 text-sm"><span>{data?.total ?? 0} records · page {page} of {Math.max(1, data?.pages ?? 1)}</span><div className="flex gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn-secondary" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
    </div>
    {detail && activeId && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveId(null); }}><aside role="dialog" aria-modal="true" aria-labelledby="quarantine-detail-title" className="h-full w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white pb-3"><div><h2 id="quarantine-detail-title" className="text-lg font-semibold">Record {detail.employeeId}</h2><p className="text-xs text-slate-500">{detail.status} · Batch {detail.batchId} · Worksheet row {detail.rowNumber ?? "unavailable"} · Version {detail.version}</p></div><button className="btn-secondary" onClick={() => setActiveId(null)}>Close</button></div>
      <div className="my-4 grid grid-cols-1 gap-4 lg:grid-cols-2"><section><h3 className="mb-2 font-semibold">Corrections</h3><p className="mb-3 text-xs text-slate-600">Original mapped values are preserved separately. Editable values below are saved to the quarantine record, not live resources.</p><div className="space-y-2">{FIELDS.filter((field) => field in (detail.rawData ?? {}) || field === "employeeId" || field === "name" || field === "location" || field === "costRate" || field === "portfolioCode").map((field) => <label key={field} className="block text-xs font-medium text-slate-600">{label(field)}<input className={`input mt-1 ${(detail.errors ?? []).some((error) => error.toLowerCase().includes(field.toLowerCase())) ? "border-red-500 bg-red-50" : ""}`} type={field.includes("Experience") || field === "costRate" || field === "totalYoe" || field === "taoExperience" ? "number" : field === "dateOfJoining" ? "date" : "text"} step="any" disabled={!detail.capabilities?.edit || busy} value={draft[field] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div><div className="mt-4 flex flex-wrap gap-2"><button className="btn-primary" disabled={!detail.capabilities?.edit || busy} onClick={() => void mutate("save", draft)}>Save corrections</button><button className="btn-secondary" disabled={!detail.capabilities?.edit || busy} onClick={() => void mutate("validate")}>Validate saved values</button>{detail.capabilities?.review && <button className="btn-secondary" disabled={busy} onClick={() => void mutate("review")}>Mark for review</button>}<button className="btn-secondary" disabled={!detail.capabilities?.release || busy || detail.status === "PENDING"} onClick={() => void release(detail, draft)}>Revalidate &amp; release</button><button className="btn-danger" disabled={!detail.capabilities?.discard || busy} onClick={() => void discard(detail)}>Discard…</button></div></section>
      <section className="space-y-4"><div><h3 className="font-semibold">Issues and validation</h3>{(detail.errors ?? []).length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900">{detail.errors?.map((error, index) => <li key={index}>{error}</li>)}</ul> : <p className="mt-2 text-sm">No stored errors.</p>}{detail.validation && <p className="mt-2 text-sm">Last validation: {detail.validation.valid ? "Passed" : "Issues found"} · {new Date(detail.validation.at).toLocaleString()}</p>}</div><div><h3 className="font-semibold">Original mapped values</h3><pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(detail.originalMapped ?? "Unavailable for legacy import", null, 2)}</pre></div><div><h3 className="font-semibold">Original source / provenance</h3><pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify({ source: detail.originalSource ?? "Unavailable", import: detail.batch?.provenance ?? "Unavailable", importedAt: detail.createdAt, lastUpdated: detail.updatedAt }, null, 2)}</pre></div><div><h3 className="font-semibold">Resolution history</h3><ol className="mt-2 space-y-2 text-xs">{detail.audits?.map((audit) => <li key={audit.id} className="border-l-2 border-slate-300 pl-3"><strong>{audit.action}</strong> · {new Date(audit.createdAt).toLocaleString()} · {audit.actorId ?? "system"}</li>)}{!detail.audits?.length && <li>No recorded resolution actions.</li>}</ol></div></section></div>
    </aside></div>}
  </section>;
}
