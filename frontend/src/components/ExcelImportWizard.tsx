import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

type Field = { label: string; type: string; requiredForNew: boolean };
type Row = { rowNumber: number; values: Record<string, string>; errors: string[]; status: string; notes?: string[]; changes?: Array<{ field: string; current: string | null; proposed: string }> };
type Preview = { expectedVersions?: Record<string, string | null>; headerRow: number; sheetNames: string[]; sheetName: string; headers: string[]; samples: Record<string, string[]>; mapping: Record<string, string>; fieldMetadata: Record<string, Field>; rows: Row[] };
type Result = { notificationPending?: boolean; totals?: Record<string, number>; batchId: string; createdCount: number; updatedCount: number; quarantinedCount: number };
const steps = ["Upload", "Map columns", "Preview", "Validate", "Results"];
const eligible = (row: Row) => ["NEW", "CHANGED"].includes(row.status);
const MAX_WORKBOOK_BYTES = 200 * 1024 * 1024;
const encodeBase64 = (bytes: Uint8Array) => {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  return btoa(chunks.join(""));
};
export function assignColumn(mapping: Record<string, string>, header: string, target: string) {
  const next = Object.fromEntries(Object.entries(mapping).filter(([, source]) => source !== header));
  if (target) next[target] = header;
  return next;
}
export function sampleMatches(type: string, value: string) {
  if (!value.trim()) return true;
  if (type === "number") return Number.isFinite(Number(value)) && Number(value) >= 0;
  if (type === "boolean") return ["yes", "no", "true", "false", "1", "0"].includes(value.toLowerCase());
  if (type === "date") return !Number.isNaN(new Date(value).getTime());
  if (type === "enum") return ["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].includes(value.toUpperCase());
  return true;
}

export default function ExcelImportWizard({ onImported }: { onImported: (message: string) => void }) {
  const [step, setStep] = useState(0);
  const [workbookBase64, setWorkbookBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [editedRows, setEditedRows] = useState<Record<number, Record<string, string>>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<{ header: string; target: string } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const committing = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  function invalidate() {
    idempotencyKey.current = crypto.randomUUID();
    generation.current++;
    controller.current?.abort();
    setSelected([]);
    setDirty(true);
    setError("");
  }
  async function request(body: Record<string, unknown>, nextStep: number, reset: boolean) {
    const id = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<Preview>("/imports/rmg-mis-import/preview", body, { signal: abort.signal });
      if (id !== generation.current) return;
      setPreview(data);
      setMapping(data.mapping);
      setSheetName(data.sheetName);
      setHeaderRow(data.headerRow);
      setSelected(data.rows.filter(eligible).map((row) => row.rowNumber));
      if (reset) setEditedRows({});
      setDirty(false);
      setPage(0);
      setStep(nextStep);
      setNotice(`${data.rows.length} rows reviewed by the server.`);
    } catch (err: any) {
      if (id === generation.current) {
        const apiError = typeof err.response?.data?.error === "string" ? err.response.data.error : null;
        const networkError = !err.response ? "Cannot reach the RAM backend. Confirm it is running at the configured API URL." : null;
        setError(apiError || networkError || "Workbook preview failed. Check the file and try again.");
      }
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  async function upload(file: File) {
    invalidate();
    const id = generation.current;
    setPreview(null);
    setWorkbookBase64("");
    setEditedRows({});
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > MAX_WORKBOOK_BYTES) { setError("Choose an Excel .xlsx workbook no larger than 200 MB. Legacy .xls files must be saved as .xlsx first."); return; }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (id !== generation.current) return;
      const encoded = encodeBase64(bytes);
      setWorkbookBase64(encoded);
      setFileName(file.name);
      await request({ workbookBase64: encoded }, 1, true);
    } catch {
      if (id === generation.current) { setError("Could not read file."); setBusy(false); }
    }
  }
  function reset() {
    if (committing.current) return;
    invalidate();
    setBusy(false); setStep(0); setPreview(null); setWorkbookBase64(""); setMapping({}); setEditedRows({}); setResult(null); setPending(null); setNotice(""); setFileName("");
  }
  function assign(header: string, target: string) {
    invalidate();
    setEditedRows({});
    setMapping(assignColumn(mapping, header, target));
    setPending(null);
    setNotice(target ? `${header} now maps to ${preview?.fieldMetadata[target].label}.` : `${header} is ignored.`);
  }
  async function commit() {
    if (committing.current || busy || dirty || !preview) return;
    if (!preview.expectedVersions) { setError("Revalidate on the server before committing."); return; }
    committing.current = true;
    setBusy(true); setError("");
    const id = generation.current;
    try {
      const { data } = await api.post<Result>("/imports/rmg-mis-import/commit", { workbookBase64, sheetName, headerRow, mapping, editedRows, acceptedRowNumbers: selected, idempotencyKey: idempotencyKey.current, filename: fileName, expectedVersions: preview.expectedVersions });
      onImported(`Batch ${data.batchId}: ${data.createdCount} created, ${data.updatedCount} updated, ${data.quarantinedCount} quarantined.`);
      if (id === generation.current) { setResult(data); setStep(4); }
    } catch (err: any) {
      if (id === generation.current) setError(typeof err.response?.data?.error === "string" ? err.response.data.error : "Import response unavailable. Check Recent Batches before retrying to avoid a duplicate import.");
    } finally {
      committing.current = false;
      if (id === generation.current) setBusy(false);
    }
  }
  const fields = Object.keys(preview?.fieldMetadata || {});
  const blocked = preview?.rows.filter((row) => ["BLOCKED", "DUPLICATE"].includes(row.status)).length || 0;
  const pages = Math.max(1, Math.ceil((preview?.rows.length || 0) / 20));
  const body = { workbookBase64, sheetName, headerRow, mapping, editedRows };
  return <section className="card space-y-5 p-5 sm:p-6" aria-busy={busy}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Excel resource import</h2>{(step > 0 || busy) && <button className="btn-secondary" disabled={committing.current} onClick={reset}>{step === 4 ? "Start another import" : "Cancel import"}</button>}</div>
    <ol aria-label="Import progress" className="grid grid-cols-2 gap-2 sm:grid-cols-5">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`rounded-lg p-3 text-sm ${step === index ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"}`}>{index + 1}. {label}</li>)}</ol>
    <h3 ref={heading} tabIndex={-1} className="font-semibold text-slate-900">{steps[step]}</h3>
    <p role="status" aria-live="polite" className="text-sm text-slate-600">{busy ? (committing.current ? "Importing. Please wait before leaving this page." : "Reading and validating workbook…") : notice}</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      {step === 0 && <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8"><label className="block text-sm font-medium">Choose Excel workbook (.xlsx, up to 200 MB)<input className="mt-3 block max-w-full focus-visible:ring-2 focus-visible:ring-brand-500" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label><p className="mt-3 text-sm text-slate-500">Preview does not write resources. Email is not imported. Large workbooks may take time to upload and process. Legacy .xls files must be saved as .xlsx.</p></div>}
      {step === 1 && preview && <>
        <p className="text-sm text-slate-600">Employee ID is required for every row. Name, Location, Cost rate and Portfolio code are required only for new resources. Blank cells leave existing values unchanged.</p>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Worksheet<select className="input" value={sheetName} onChange={(event) => { invalidate(); setPending(null); void request({ workbookBase64, sheetName: event.target.value }, 1, true); }}>{preview.sheetNames.map((name) => <option key={name}>{name}</option>)}</select></label><label className="text-sm">Header row<input className="input" type="number" min={1} max={5000} value={headerRow} onChange={(event) => { invalidate(); setHeaderRow(Number(event.target.value)); }} /></label><button className="btn-secondary" onClick={() => { setPending(null); void request({ workbookBase64, sheetName, headerRow }, 1, true); }}>Read header row</button></div>
        {preview.headers.map((header) => {
          const field = fields.find((key) => mapping[key] === header) || "";
          const meta = preview.fieldMetadata[field];
          const compatible = !meta || (preview.samples[header] || []).every((value) => sampleMatches(meta.type, value));
          return <div key={header} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><div><strong className="text-sm">{header}</strong><p className="text-xs text-slate-500">{preview.samples[header]?.join(" · ") || "No samples"}</p></div><label className="text-sm">Target for {header}<select className="input" value={field} onChange={(event) => { const target = event.target.value; if (target && mapping[target] && mapping[target] !== header) setPending({ header, target }); else assign(header, target); }}><option value="">Ignore column</option>{fields.map((key) => <option key={key} value={key}>{preview.fieldMetadata[key].label}{mapping[key] && mapping[key] !== header ? ` (assigned to ${mapping[key]})` : ""}</option>)}</select></label><div className="text-xs text-slate-600"><span className={`badge ${compatible ? "bg-brand-50 text-brand-800" : "bg-amber-50 text-amber-800"}`}>{!field ? "Ignored" : compatible ? "Mapped" : "Check sample type"}</span>{meta && <p className="mt-2">{meta.type} · {field === "employeeId" ? "Required for all" : meta.requiredForNew ? "Required for new" : "Optional"}{meta.type === "number" ? " · non-negative number" : meta.type === "date" ? " · YYYY-MM-DD" : meta.type === "boolean" ? " · Yes/No" : meta.type === "list" ? " · semicolon-separated entries" : ""}</p>}</div></div>;
        })}
        {pending && <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm"><p>{preview.fieldMetadata[pending.target].label} is assigned to {mapping[pending.target]}. Reassigning it to {pending.header} will leave {mapping[pending.target]} ignored.</p><button className="btn-secondary mt-2" onClick={() => assign(pending.header, pending.target)}>Confirm reassignment</button><button className="btn-secondary ml-2" onClick={() => setPending(null)}>Keep current mapping</button></div>}
        <p className="text-sm text-amber-800">Unmapped requirements: {fields.filter((key) => preview.fieldMetadata[key].requiredForNew && !mapping[key]).map((key) => `${preview.fieldMetadata[key].label}${key === "employeeId" ? " (all rows)" : " (new only)"}`).join(", ") || "None"}</p>
        <button className="btn-secondary" onClick={reset}>Back to upload</button><button className="btn-primary ml-2" disabled={!mapping.employeeId || !!pending || headerRow !== preview.headerRow} onClick={() => void request(body, 2, false)}>Continue to preview</button>
      </>}
      {(step === 2 || step === 3) && preview && <>
        <p className="text-sm text-slate-600">{fileName} · {sheetName} · {preview.rows.length} rows. {selected.length} selected; {blocked} blocked or duplicate. Invalid rows are automatically quarantined at import, even when unselected. Unchanged and unselected eligible rows are skipped.</p>
        {step === 2 && <p className="text-sm text-slate-600">Correct values below, then revalidate on the server. Blank values do not clear existing resource fields.</p>}
        {step === 3 && <label className="flex gap-2 text-sm"><input type="checkbox" checked={selected.length > 0 && selected.length === preview.rows.filter(eligible).length} onChange={(event) => setSelected(event.target.checked ? preview.rows.filter(eligible).map((row) => row.rowNumber) : [])} />Select all new and changed rows</label>}
        <div className="overflow-auto rounded-xl border border-slate-200"><table className="min-w-max border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-100"><tr><th className="sticky left-0 z-20 border border-slate-200 bg-slate-100 px-3 py-2">Select</th><th className="border border-slate-200 px-3 py-2">Row</th>{fields.map((field) => <th key={field} className="border border-slate-200 px-3 py-2">{preview.fieldMetadata[field].label}</th>)}<th className="border border-slate-200 px-3 py-2">Status and issues</th></tr></thead><tbody>{preview.rows.slice(page * 20, (page + 1) * 20).map((row) => { const rowErrors = row.errors.map((error) => error.toLowerCase()); const isBlocked = rowErrors.length > 0 || row.status === "BLOCKED" || row.status === "DUPLICATE"; return <tr key={row.rowNumber} className="odd:bg-white even:bg-slate-50"><td className="sticky left-0 border border-slate-200 bg-inherit px-3 py-2"><input aria-label={`Select import row ${row.rowNumber}`} type="checkbox" disabled={step === 3 && !eligible(row)} checked={step === 3 ? selected.includes(row.rowNumber) : false} onChange={(event) => setSelected(event.target.checked ? [...selected, row.rowNumber] : selected.filter((number) => number !== row.rowNumber))} /></td><td className="border border-slate-200 px-3 py-2 font-medium">{row.rowNumber}<span className="block text-xs text-slate-500">{row.status}</span></td>{fields.map((field) => { const value = editedRows[row.rowNumber]?.[field] ?? row.values[field] ?? ""; const requiredMissing = preview.fieldMetadata[field].requiredForNew && !value.trim() && (!row.values.employeeId || !row.changes?.length); const invalid = requiredMissing || rowErrors.some((error) => error.includes(field.toLowerCase()) || (field === "costRate" && error.includes("cost")) || (field === "employeeId" && error.includes("employee"))); return <td key={field} className={`border border-slate-200 p-1 ${invalid ? "bg-red-50" : ""}`}><label className="sr-only">{preview.fieldMetadata[field].label}, row {row.rowNumber}</label>{step === 2 ? <input aria-invalid={invalid} className={`w-44 rounded px-2 py-2 outline-none focus:ring-2 focus:ring-brand-500 ${invalid ? "text-red-800" : "text-slate-800"}`} value={value} onChange={(event) => { invalidate(); setEditedRows({ ...editedRows, [row.rowNumber]: { ...editedRows[row.rowNumber], [field]: event.target.value } }); }} /> : <span className="block w-44 truncate px-2 py-2" title={value}>{value || <span className="text-slate-400">—</span>}</span>}</td>})}<td className="max-w-sm border border-slate-200 px-3 py-2"><span className={isBlocked ? "font-medium text-red-800" : "font-medium text-slate-700"}>{isBlocked ? `Needs attention · ${row.errors.length} issue(s)` : row.status}</span>{[...row.errors, ...(row.notes || [])].map((text, index) => <div key={index} className="mt-1 text-xs text-red-800">{text}</div>)}</td></tr>})}</tbody></table></div>
        <nav aria-label="Preview pages" className="flex items-center gap-3"><button className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button><span className="text-sm" role="status">Page {page + 1} of {pages}</span><button className="btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next page</button></nav>
        {step === 2 ? <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => { setStep(1); setPending(null); }}>Back to mapping</button><button className="btn-primary" onClick={() => void request(body, 3, false)}>Revalidate and continue</button></div> : <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setStep(2)}>Back to preview</button><button className="btn-primary" disabled={dirty || (!selected.length && !blocked)} onClick={() => void commit()}>Import {selected.length} selected; quarantine {blocked}</button></div>}
      </>}
      {step === 4 && result && <div className="space-y-3 rounded-xl bg-brand-50 p-5"><h4 className="font-semibold">Import results</h4>{(!!result.totals?.FAILED || !!result.totals?.PENDING || result.notificationPending) && <button className="btn-secondary" onClick={() => void commit()}>Retry failed/pending rows and notifications (same batch)</button>}<p>Batch {result.batchId}</p><p>{result.createdCount} created · {result.updatedCount} updated · {result.quarantinedCount} quarantined · {result.totals?.SKIPPED ?? 0} skipped · {result.totals?.FAILED ?? 0} failed · {result.totals?.PENDING ?? 0} pending</p><div className="flex gap-4 text-sm text-brand-700"><a className="underline" href="#import-history">View recent batches</a><a className="underline" href="#import-quarantine">Review quarantine</a></div></div>}
    </fieldset>
  </section>;
}
