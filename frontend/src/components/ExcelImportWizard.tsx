import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ImportReview from "./ImportReview";
import { Field, Row } from "./importTypes";

type Preview = { expectedVersions?: Record<string, string | null>; headerRow: number; sheetNames: string[]; sheetName: string; headers: string[]; samples: Record<string, string[]>; mapping: Record<string, string>; fieldMetadata: Record<string, Field>; rows: Row[] };
type Result = { notificationPending?: boolean; totals?: Record<string, number>; batchId: string; createdCount: number; updatedCount: number; quarantinedCount: number };
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

export default function ExcelImportWizard({ onImported, standalone = false }: { onImported: (message: string) => void; standalone?: boolean }) {
  const { portfolios } = useAuth();
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
  const [dragging, setDragging] = useState(false);
  const [ignoredHeaders, setIgnoredHeaders] = useState<string[]>([]);
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const committing = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
      if (reset) setIgnoredHeaders([]);
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
    setStep(0);
    setPreview(null);
    setWorkbookBase64("");
    setEditedRows({});
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > MAX_WORKBOOK_BYTES) { setError("Choose an Excel .xlsx workbook no larger than 200 MB. Legacy .xls files must be saved as .xlsx first."); return; }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (id !== generation.current) return;
      const encoded = encodeBase64(bytes);
      setWorkbookBase64(encoded);
      await request({ workbookBase64: encoded }, 1, true);
    } catch {
      if (id === generation.current) { setError("Could not read file."); setBusy(false); }
    }
  }
  function reset() {
    if (committing.current) return;
    invalidate();
    setBusy(false); setStep(0); setPreview(null); setWorkbookBase64(""); setMapping({}); setEditedRows({}); setResult(null); setPending(null); setIgnoredHeaders([]); setNotice(""); setFileName("");
  }
  function assign(header: string, target: string) {
    invalidate();
    setEditedRows({});
    setMapping(assignColumn(mapping, header, target));
    setIgnoredHeaders((current) => target ? current.filter((value) => value !== header) : [...new Set([...current, header])]);
    setPending(null);
    setNotice(target ? `${header} now maps to ${preview?.fieldMetadata[target].label}.` : `${header} is ignored.`);
  }
  function editRow(rowNumber: number, field: string, value: string) {
    invalidate();
    setEditedRows((current) => ({ ...current, [rowNumber]: { ...current[rowNumber], [field]: value } }));
  }
  function revertRow(rowNumber: number) {
    invalidate();
    setEditedRows((current) => {
      const next = { ...current };
      delete next[rowNumber];
      return next;
    });
  }
  function editMany(rowNumbers: number[], field: string, values: string[], overwrite: boolean) {
    invalidate();
    setEditedRows((current) => {
      const next = { ...current };
      rowNumbers.forEach((rowNumber, index) => {
        const row = preview?.rows.find((item) => item.rowNumber === rowNumber);
        const currentValue = current[rowNumber]?.[field] ?? row?.values[field] ?? "";
        const proposed = values[index] ?? values[0] ?? "";
        if (overwrite || !currentValue.trim()) next[rowNumber] = { ...current[rowNumber], [field]: proposed };
      });
      return next;
    });
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
  const ready = preview?.rows.filter(eligible).length || 0;
  const needsFix = preview?.rows.filter((row) => row.status !== "DUPLICATE" && (row.errors.length > 0 || row.status === "BLOCKED")).length || 0;
  const duplicates = preview?.rows.filter((row) => row.status === "DUPLICATE").length || 0;
  const skipped = preview?.rows.filter((row) => ["SKIPPED", "UNCHANGED"].includes(row.status)).length || 0;
  const issueCounts = Object.entries((preview?.rows || []).reduce<Record<string, number>>((counts, row) => {
    [...row.errors, ...(row.status === "DUPLICATE" ? row.notes || [] : [])].forEach((issue) => { counts[issue] = (counts[issue] || 0) + 1; });
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]);
  const requiredFields = fields.filter((field) => field === "employeeId" || preview?.fieldMetadata[field].requiredForNew);
  const mappedRequired = requiredFields.filter((field) => mapping[field]).length;
  const reviewHeaders = preview?.headers.filter((header) => {
    if (ignoredHeaders.includes(header)) return false;
    const field = fields.find((key) => mapping[key] === header);
    return !field || !(preview.samples[header] || []).every((value) => sampleMatches(preview.fieldMetadata[field].type, value));
  }) || [];
  const reviewHeaderCount = reviewHeaders.length;
  const body = { workbookBase64, sheetName, headerRow, mapping, editedRows };
  const autoMappedHeaders = preview?.headers.filter((header) => {
    if (ignoredHeaders.includes(header)) return false;
    const field = fields.find((key) => mapping[key] === header);
    return !!field && (preview.samples[header] || []).every((value) => sampleMatches(preview.fieldMetadata[field].type, value));
  }).length || 0;
  const filePicker = <input ref={fileInput} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />;

  if ((step === 2 || step === 3) && preview) return <>
    {filePicker}
    {error && <p role="alert" className="fixed right-5 top-20 z-50 max-w-lg rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <ImportReview
      fileName={fileName}
      sheetName={sheetName}
      rows={preview.rows}
      fields={fields}
      headers={preview.headers}
      autoMappedCount={autoMappedHeaders}
      mapping={mapping}
      fieldMetadata={preview.fieldMetadata}
      reviewCount={reviewHeaderCount}
      editedRows={editedRows}
      portfolios={portfolios}
      standalone={standalone}
      dirty={dirty}
      busy={busy}
      ready={ready}
      needsFix={needsFix}
      duplicates={duplicates}
      skipped={skipped}
      onChooseFile={() => fileInput.current?.click()}
      onOpenMapping={() => { setStep(1); setPending(null); }}
      onRevalidate={() => request(body, 3, false)}
      onEdit={editRow}
      onRevert={revertRow}
      onBulkEdit={editMany}
      onImport={() => void commit()}
    />
  </>;

  return <div className={`${standalone ? "min-h-[calc(100vh-4rem)] bg-[#f4f5fa]" : ""}`} aria-busy={busy}>
    {filePicker}
    <p className="sr-only" role="status" aria-live="polite">{busy ? (committing.current ? "Importing." : "Reading and validating workbook.") : notice}</p>
    {(step === 0 || step === 1) && <div className={`${standalone ? "min-h-[calc(100vh-4rem)]" : "rounded-xl border border-slate-200 bg-white"} flex flex-col text-[#202a3b]`}>
      {step === 0 && <header className="flex flex-wrap items-center justify-between gap-4 px-6 pb-3 pt-5">
        <div><h1 ref={heading} tabIndex={-1} className="text-[28px] font-bold tracking-[-0.03em] text-slate-900">Import resources</h1><p className="mt-1 text-sm text-[#697386]">Upload your resource workbook to map, review, and import changes.</p></div>
      </header>}
      {step === 1 && preview && <main className="flex flex-1 flex-col px-6 pb-0 pt-5">
        <nav aria-label="Import progress" className="flex items-center gap-2 text-sm text-[#697386]"><span>Upload ✓</span><span aria-hidden="true">›</span><strong aria-current="step" className="text-[#334bd1]">Map columns</strong><span aria-hidden="true">›</span><span>Review</span></nav>
        <header className="mt-5">
          <h1 ref={heading} tabIndex={-1} className="text-[28px] font-bold tracking-[-0.03em] text-slate-900">Map columns</h1>
          <p className="mt-1 text-sm text-[#697386]">Each column in your file must match a resource field. Matched columns are set automatically.</p>
        </header>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-2 text-sm ${mappedRequired === requiredFields.length ? "border-[#cfe6d9] bg-[#effaf4] text-[#26734e]" : "border-[#efe3b4] bg-[#fff9df] text-[#806100]"}`}>{mappedRequired === requiredFields.length ? "✓" : ""} {mappedRequired} of {requiredFields.length} required fields mapped</span>
          <span className="rounded-full border border-[#dce1ea] bg-white px-3 py-2 text-sm text-[#343d4c]">{autoMappedHeaders} auto-mapped · {reviewHeaderCount} to review</span>
          <span className="ml-auto text-sm text-[#697386]">Automatically matched from this workbook · <button className="text-[#3155ce] hover:underline" onClick={() => { invalidate(); setMapping({}); setIgnoredHeaders([]); setPending(null); }}>Reset mapping</button></span>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#dce1ea] bg-white">
          <div className="grid grid-cols-[1fr_1.1fr_1.25fr_.8fr] bg-[#edf1f9] text-[11px] font-semibold uppercase tracking-[0.075em] text-[#606b7f]"><div className="px-3 py-2">Your column</div><div className="px-3 py-2">Sample values</div><div className="px-3 py-2">Maps to</div><div className="px-3 py-2">Status</div></div>
          {reviewHeaders.map((header) => {
            const field = fields.find((key) => mapping[key] === header) || "";
            const meta = preview.fieldMetadata[field];
            const compatible = !meta || (preview.samples[header] || []).every((value) => sampleMatches(meta.type, value));
            return <div key={header} className="grid grid-cols-[1fr_1.1fr_1.25fr_.8fr] items-center border-b border-[#e6e9ef] bg-[#fffdf5] text-sm">
              <strong className="px-3 py-3">{header}</strong>
              <span className="truncate px-3 py-3 text-[#697386]">{preview.samples[header]?.join(" · ") || "No samples"}</span>
              <label className="px-3 py-2"><span className="sr-only">Map {header} to</span><select className="input bg-white" value={field} onChange={(event) => { const target = event.target.value === "__ignore" ? "" : event.target.value; if (target && mapping[target] && mapping[target] !== header) setPending({ header, target }); else assign(header, target); }}><option value="">Select a field</option><option value="__ignore">Ignore column</option>{fields.map((key) => <option key={key} value={key}>{preview.fieldMetadata[key].label}</option>)}</select>{meta?.type === "list" && <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">list · separated by ; <label className="inline-flex items-center gap-1"><input type="checkbox" defaultChecked />Split by ;</label></span>}</label>
              <span className="px-3 py-3 text-xs"><strong className="text-[#a33d31]">Review</strong> · {field ? compatible ? "matched by synonym" : "check sample type" : "no match found"}</span>
            </div>;
          })}
          {autoMappedHeaders > 0 && <details open className="border-b border-[#e6e9ef]">
            <summary className="cursor-pointer bg-[#f8f9fc] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#606b7f]">Auto-mapped ({autoMappedHeaders})</summary>
            {preview.headers.filter((header) => {
              if (ignoredHeaders.includes(header)) return false;
              const field = fields.find((key) => mapping[key] === header);
              return !!field && (preview.samples[header] || []).every((value) => sampleMatches(preview.fieldMetadata[field].type, value));
            }).map((header) => {
              const field = fields.find((key) => mapping[key] === header)!;
              const meta = preview.fieldMetadata[field];
              return <div key={header} className="grid grid-cols-[1fr_1.1fr_1.25fr_.8fr] items-center border-t border-[#e6e9ef] text-sm">
                <span className="px-3 py-2.5">{header}</span><span className="truncate px-3 py-2.5 text-[#697386]">{preview.samples[header]?.join(" · ") || "—"}</span>
                <span className="px-3 py-2.5">{meta.label}<small className="ml-1 text-xs text-[#697386]">· {meta.type}{field === "employeeId" ? " · required" : meta.requiredForNew ? " · required for new" : ""}</small></span>
                <span className="px-3 py-2.5 font-medium text-[#26825d]">✓ Auto</span>
              </div>;
            })}
          </details>}
          {fields.filter((field) => !mapping[field]).length > 0 && <div className="border-t border-[#e6e9ef] bg-[#f8f9fc] px-3 py-2.5 text-sm"><strong className="text-[#606b7f]">Not in file:</strong> <span className="text-[#697386]">{fields.filter((field) => !mapping[field]).map((field) => preview.fieldMetadata[field].label).join(", ")}</span></div>}
          <div className="border-t border-[#e6e9ef] bg-[#f8f9fc] px-3 py-2.5 text-sm"><strong>Row {preview.rows[0]?.rowNumber || "—"} will import as:</strong> <span className="text-[#697386]">{fields.filter((field) => mapping[field] && preview.rows[0]?.values[field]).map((field) => `${preview.fieldMetadata[field].label} ${preview.rows[0].values[field]}`).join(" · ") || "No mapped values"}</span></div>
        </div>
        {pending && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>{preview.fieldMetadata[pending.target].label} is already mapped to {mapping[pending.target]}. Reassigning it to {pending.header} will leave the old column ignored.</p><button className="btn-secondary mt-2" onClick={() => assign(pending.header, pending.target)}>Confirm reassignment</button><button className="btn-secondary ml-2" onClick={() => setPending(null)}>Keep current mapping</button></div>}
        <footer className="sticky bottom-0 -mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#dce1ea] bg-white px-6 py-3.5">
          <span className="text-sm text-[#697386]">Next is disabled until the duplicate target and review rows are resolved.</span>
          <div className="flex gap-2"><button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm" onClick={() => { setStep(0); setPreview(null); }}>← Back</button><button className="h-10 rounded-xl bg-[#334bd1] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!mapping.employeeId || !!pending || reviewHeaderCount > 0 || headerRow !== preview.headerRow} onClick={() => void request(body, 2, false)}>Next: Review</button></div>
        </footer>
      </main>}
      {step === 0 && <div className="flex-1 px-6 pb-6">
        {busy && <p className="mb-3 text-sm text-[#697386]">Reading and validating workbook…</p>}
        <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void upload(file); }}>
          <button className={`flex min-h-[340px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-10 text-center transition-colors ${dragging ? "border-[#334bd1] bg-[#e9edff]" : "border-[#cfd5e1] bg-white hover:border-[#5268d6]"}`} onClick={() => fileInput.current?.click()}>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9edff] text-[#334bd1]" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" /></svg></span>
            <span className="mt-4 text-lg font-semibold text-slate-900">{dragging ? "Drop your workbook here" : "Choose an Excel workbook"}</span>
            <span className="mt-1 text-sm text-[#697386]">Drag and drop an .xlsx file here, or browse files</span>
            <span className="mt-3 rounded-full bg-[#f4f5fa] px-3 py-1 text-xs font-medium text-[#697386]">Up to 200 MB · .xlsx only</span>
          </button>
        </div>
        <p className="mt-4 text-sm text-[#697386]">Preview does not write resources. Email is not imported. Legacy .xls files must be saved as .xlsx.</p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>}
      {step === 1 && !preview && <p role="status" className="p-6 text-sm text-[#697386]">Reading workbook…</p>}
    </div>}
    {step === 4 && result && <section className="card m-6 space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#26825d]">Import complete</p><h1 ref={heading} tabIndex={-1} className="mt-1 text-xl font-semibold text-slate-900">Batch {result.batchId}</h1></div><button className="btn-secondary" onClick={reset}>Start another import</button></header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Created", result.createdCount], ["Updated", result.updatedCount], ["Quarantined", result.quarantinedCount], ["Skipped", result.totals?.SKIPPED ?? 0], ["Failed", result.totals?.FAILED ?? 0]].map(([label, amount]) => <div key={label} className="rounded-xl border border-[#dce1ea] bg-white p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{amount}</div></div>)}</div>
      {(!!result.totals?.FAILED || !!result.totals?.PENDING || result.notificationPending) && <button className="btn-secondary" onClick={() => void commit()}>Retry failed/pending rows and notifications (same batch)</button>}
      <div className="flex flex-wrap gap-4 text-sm font-medium text-[#3155ce]"><a className="underline" href="#import-history">View recent batches</a><a className="underline" href="#import-quarantine">Review quarantine</a></div>
    </section>}
  </div>;
}
