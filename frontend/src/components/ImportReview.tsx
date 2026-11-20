import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Portfolio } from "../types";
import { Field, Row } from "./importTypes";

type Props = {
  fileName: string;
  sheetName: string;
  rows: Row[];
  fields: string[];
  headers: string[];
  autoMappedCount: number;
  mapping: Record<string, string>;
  fieldMetadata: Record<string, Field>;
  reviewCount: number;
  editedRows: Record<number, Record<string, string>>;
  portfolios: Portfolio[];
  dirty: boolean;
  busy: boolean;
  ready: number;
  needsFix: number;
  duplicates: number;
  skipped: number;
  standalone: boolean;
  onChooseFile: () => void;
  onOpenMapping: () => void;
  onRevalidate: () => Promise<void>;
  onEdit: (rowNumber: number, field: string, value: string) => void;
  onRevert: (rowNumber: number) => void;
  onBulkEdit: (rowNumbers: number[], field: string, values: string[], overwrite: boolean) => void;
  onImport: () => void;
};

const tableFields = ["employeeId", "name", "country", "location", "costRate", "portfolioCode"];
const humanize = (field: string) => field.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());

function issueLabel(issue: string) {
  if (/duplicate|occurs more than once/i.test(issue)) return "Duplicate Emp ID";
  if (/missing location/i.test(issue)) return "Missing location";
  if (/missing portfolioCode/i.test(issue)) return "Missing portfolio code";
  if (/portfolio code was not found/i.test(issue)) return "Portfolio code not found";
  if (/missing costRate/i.test(issue)) return "Missing monthly cost";
  if (/missing employeeId/i.test(issue)) return "Missing Emp ID";
  return issue.replace(/^missing\s+/i, "Missing ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function rowIssues(row: Row) {
  return [...new Set([...row.errors, ...(row.notes || [])].filter((issue) => !/ready to create resource/i.test(issue)))];
}

function similarCodes(value: string, portfolios: Portfolio[]) {
  const source = value.toUpperCase();
  const distance = (target: string) => {
    const previous = Array.from({ length: target.length + 1 }, (_, index) => index);
    for (let i = 1; i <= source.length; i++) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= target.length; j++) {
        const above = previous[j];
        previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (source[i - 1] === target[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return previous[target.length];
  };
  return portfolios.map((portfolio) => portfolio.code).map((code) => ({ code, distance: distance(code.toUpperCase()) }))
    .filter((item) => item.distance > 0 && item.distance <= 2)
    .sort((a, b) => a.distance - b.distance || a.code.localeCompare(b.code))
    .slice(0, 3).map((item) => item.code);
}

export default function ImportReview({
  fileName, sheetName, rows, fields, headers, autoMappedCount, mapping, fieldMetadata, reviewCount, editedRows, portfolios, dirty, busy,
  ready, needsFix, duplicates, skipped, standalone, onChooseFile, onOpenMapping, onRevalidate, onEdit, onRevert,
  onBulkEdit, onImport,
}: Props) {
  const [statusFilter, setStatusFilter] = useState("Needs fix");
  const [activeIssue, setActiveIssue] = useState("");
  const [search, setSearch] = useState("");
  const [bulkRows, setBulkRows] = useState<number[]>([]);
  const [bulkField, setBulkField] = useState("location");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkValues, setBulkValues] = useState<string[]>([]);
  const [pasteColumn, setPasteColumn] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [activeRowNumber, setActiveRowNumber] = useState<number | null>(null);

  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => rowIssues(row).forEach((issue) => {
      const label = issueLabel(issue);
      counts.set(label, (counts.get(label) || 0) + 1);
    }));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  useEffect(() => {
    if (activeIssue && issueCounts.some(([label]) => label === activeIssue)) return;
    setActiveIssue(issueCounts[0]?.[0] || "");
  }, [activeIssue, issueCounts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!busy) void onRevalidate();
      } else if (activeRowNumber !== null && event.key === "ArrowUp") {
        event.preventDefault();
        openNextIssue(-1);
      } else if (activeRowNumber !== null && event.key === "ArrowDown") {
        event.preventDefault();
        openNextIssue(1);
      } else if (activeRowNumber !== null && event.key === "Escape") {
        setActiveRowNumber(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeRowNumber, busy, onRevalidate]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "Needs fix" && !row.errors.length && !["BLOCKED", "DUPLICATE"].includes(row.status)) return false;
      if (statusFilter === "Ready" && !["NEW", "CHANGED"].includes(row.status)) return false;
      if (statusFilter === "Duplicate" && row.status !== "DUPLICATE") return false;
      if (statusFilter === "Skipped" && !["UNCHANGED", "SKIPPED"].includes(row.status)) return false;
      if (activeIssue && statusFilter === "Needs fix" && !rowIssues(row).some((issue) => issueLabel(issue) === activeIssue)) return false;
      if (normalizedSearch && ![row.values.employeeId, row.values.name].some((value) => value?.toLowerCase().includes(normalizedSearch))) return false;
      return true;
    });
  }, [rows, statusFilter, activeIssue, search]);

  const activeRowIndex = filteredRows.findIndex((row) => row.rowNumber === activeRowNumber);
  const activeRow = activeRowIndex >= 0 ? filteredRows[activeRowIndex] : null;
  const selectedRows = rows.filter((row) => bulkRows.includes(row.rowNumber));
  const overwriteCount = selectedRows.filter((row) => Boolean(editedRows[row.rowNumber]?.[bulkField] ?? row.values[bulkField])).length;
  const selectedIssue = activeIssue || "Selected rows";
  const requiredCount = fields.filter((field) => field === "employeeId" || fieldMetadata[field]?.requiredForNew).length;
  function applyBulk() {
    const values = bulkValues.length ? bulkValues : Array.from({ length: bulkRows.length }, () => bulkValue);
    onBulkEdit(bulkRows, bulkField, values, overwrite);
    setBulkRows([]);
    setBulkValues([]);
    setBulkValue("");
    setPasteColumn(false);
    setShowBulkPreview(false);
  }

  function downloadIssues() {
    const data = rows.filter((row) => rowIssues(row).length).map((row) => ({
      Row: row.rowNumber,
      "Employee ID": row.values.employeeId || "",
      Name: row.values.name || "",
      Country: row.values.country || "",
      Location: row.values.location || "",
      "Cost rate": row.values.costRate || "",
      "Portfolio code": row.values.portfolioCode || "",
      Issues: rowIssues(row).map(issueLabel).join("; "),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Import issues");
    XLSX.writeFile(workbook, `${fileName.replace(/\.xlsx$/i, "")}-issues.xlsx`);
  }

  function toggleBulkRow(rowNumber: number, checked: boolean) {
    setBulkRows((current) => checked ? [...new Set([...current, rowNumber])] : current.filter((value) => value !== rowNumber));
  }

  function toggleAllVisible(checked: boolean) {
    setBulkRows((current) => checked
      ? [...new Set([...current, ...filteredRows.map((row) => row.rowNumber)])]
      : current.filter((rowNumber) => !filteredRows.some((row) => row.rowNumber === rowNumber)));
  }

  function openNextIssue(direction: -1 | 1) {
    const next = filteredRows[activeRowIndex + direction];
    if (next) setActiveRowNumber(next.rowNumber);
  }

  return <section className={`flex flex-col bg-[#f4f5fa] text-[#202a3b] ${standalone ? "min-h-[calc(100vh-4rem)]" : "min-h-[70vh] rounded-xl border border-slate-200"}`} aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-4 px-6 pb-3 pt-5">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Import review</h1>
        <p className="mt-1 text-sm text-[#697386]">{fileName} · {sheetName} · {rows.length} rows</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm font-medium hover:border-[#3552ce] hover:text-[#2947be]" onClick={onChooseFile}>Choose another file</button>
        <button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm font-medium hover:border-[#3552ce] hover:text-[#2947be]" onClick={onOpenMapping}>Mapping</button>
      </div>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3">
      <div className="flex flex-wrap gap-2">
        {[
          ["Total", rows.length],
          ["Needs fix", needsFix],
          ["Ready", ready],
          ["Duplicate", duplicates],
          ["Skipped", skipped],
        ].map(([label, count]) => <button key={label} aria-pressed={statusFilter === label} onClick={() => setStatusFilter(String(label))} className={`flex h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${statusFilter === label ? "border-[#354fd1] bg-[#e9edff] text-[#263e9d]" : "border-[#dce1ea] bg-white text-[#343d4c] hover:border-[#aeb9d6]"}`}><span>{label}</span><strong className="tabular-nums">{count}</strong></button>)}
      </div>
      <div className="flex min-w-[340px] flex-1 justify-end gap-2">
        <label className="sr-only" htmlFor="import-review-search">Search Emp ID or name</label>
        <input id="import-review-search" className="h-11 min-w-48 max-w-64 flex-1 rounded-xl border border-[#d5dbe5] bg-white px-3 text-sm outline-none focus:border-[#3a54d1] focus:ring-2 focus:ring-[#354fd1]/10" placeholder="Search Emp ID or name" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className="h-11 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm font-medium hover:border-[#3552ce] disabled:opacity-50" disabled={busy} onClick={() => void onRevalidate()}>Revalidate on server</button>
      </div>
    </div>

    <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 px-6 pb-3 lg:grid-cols-[184px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 rounded-2xl border border-[#dce1ea] bg-white p-2.5">
        <section>
          <h2 className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#606b7f]">Issues</h2>
          <div className="space-y-1">
            {issueCounts.map(([label, count]) => <button key={label} aria-pressed={activeIssue === label} onClick={() => { setActiveIssue(label); setStatusFilter("Needs fix"); }} className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-xs ${activeIssue === label ? "border-[#3b55cb] bg-[#e9edff] text-[#263e9d]" : "border-[#dce1ea] text-[#343d4c] hover:bg-slate-50"}`}><span>{label}</span><strong className="text-sm tabular-nums">{count}</strong></button>)}
            {issueCounts.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">No issues found.</p>}
          </div>
        </section>
        <section className="mt-auto border-t border-slate-100 pt-4">
          <h2 className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#606b7f]">Mapped columns</h2>
          <p className="px-2 text-xs leading-5 text-[#697386]">{autoMappedCount} of {headers.length} mapped automatically. <button className="font-medium text-[#3155ce] underline-offset-2 hover:underline" onClick={onOpenMapping}>Review {reviewCount}</button></p>
          <p className="px-2 pt-2 text-xs text-slate-500">{requiredCount} required fields</p>
        </section>
      </aside>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-[#dce1ea] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e6ed] px-4 py-2.5">
          <p className="text-sm text-[#697386]">Showing {filteredRows.length} {statusFilter === "Needs fix" ? "rows with issues" : statusFilter === "Total" ? "rows" : statusFilter.toLowerCase() + " rows"}</p>
          <p className="text-xs text-[#697386]">Ctrl+Enter revalidate · ↑↓ move · Enter edit</p>
        </div>
        {bulkRows.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-[#cfd8ff] bg-[#e9edff] p-3">
          <div className="mr-auto flex items-center gap-2"><strong className="text-sm text-[#263e9d]">{bulkRows.length} rows selected</strong><span className="text-xs text-[#697386]">{selectedIssue}</span></div>
          <label className="sr-only" htmlFor="bulk-field">Field to bulk fix</label>
          <select id="bulk-field" className="h-10 rounded-lg border border-[#d5dbe5] bg-white px-3 text-sm" value={bulkField} onChange={(event) => setBulkField(event.target.value)}>{fields.map((field) => <option key={field} value={field}>{humanize(field)}</option>)}</select>
          <label className="sr-only" htmlFor="bulk-value">Bulk value</label>
          <input id="bulk-value" className="h-10 w-36 rounded-lg border border-[#d5dbe5] bg-white px-3 text-sm" placeholder={`${humanize(bulkField)} value`} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} />
          <button className="h-10 rounded-lg bg-[#334bd1] px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!bulkValue.trim()} onClick={() => { setBulkValues([]); setShowBulkPreview(true); }}>Apply to {bulkRows.length} rows</button>
          <button className="h-10 rounded-lg border border-[#d4dae4] bg-white px-3 text-sm" onClick={() => { const first = selectedRows[0]; setBulkValue(first ? editedRows[first.rowNumber]?.[bulkField] ?? first.values[bulkField] ?? "" : ""); setBulkValues([]); setShowBulkPreview(true); }}>Fill down</button>
          <button className="h-10 rounded-lg border border-[#d4dae4] bg-white px-3 text-sm" onClick={() => setPasteColumn((open) => !open)}>Paste column</button>
          <button className="h-10 rounded-lg border border-[#d4dae4] bg-white px-3 text-sm" onClick={() => { setBulkRows([]); setShowBulkPreview(false); }}>Clear selection</button>
        </div>}
        {pasteColumn && bulkRows.length > 0 && <div className="space-y-2 border-b border-[#e2e6ed] bg-white p-3"><label className="block text-xs font-medium text-slate-600">Paste one value per row<textarea className="input mt-1 min-h-16 font-mono text-xs" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} placeholder={"Pune\nBangalore\nHyderabad"} /></label><button className="btn-secondary" onClick={() => { const values = bulkValue.split(/\r?\n/); setBulkValues(values); setShowBulkPreview(true); }}>Preview pasted values</button></div>}

        <div className="max-h-[calc(100vh-290px)] min-h-[300px] overflow-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#edf1f9] text-[11px] font-semibold uppercase tracking-[0.075em] text-[#606b7f]"><tr>
              <th className="w-10 px-2 py-2.5"><input type="checkbox" aria-label="Select visible import rows" checked={filteredRows.length > 0 && filteredRows.every((row) => bulkRows.includes(row.rowNumber))} onChange={(event) => toggleAllVisible(event.target.checked)} /></th>
              <th className="px-2 py-2.5">Row</th>
              {tableFields.filter((field) => fields.includes(field)).map((field) => <th key={field} className="px-2 py-2.5">{field === "employeeId" ? "Emp ID" : field === "costRate" ? "Cost rate" : field === "portfolioCode" ? "Portfolio code" : humanize(field)}</th>)}
              <th className="px-2 py-2.5">Status</th>
            </tr></thead>
            <tbody>{filteredRows.map((row) => {
              const errors = rowIssues(row);
              const chosen = bulkRows.includes(row.rowNumber);
              return <tr key={row.rowNumber} className={`border-b border-[#e6e9ef] last:border-0 ${chosen ? "bg-[#e9edff]" : "hover:bg-[#fafbff]"}`} onDoubleClick={() => setActiveRowNumber(row.rowNumber)}>
                <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select import row ${row.rowNumber}`} checked={chosen} onChange={(event) => toggleBulkRow(row.rowNumber, event.target.checked)} /></td>
                <td className="px-2 py-2 text-slate-600">{row.rowNumber}</td>
                {tableFields.filter((field) => fields.includes(field)).map((field) => {
                  const value = editedRows[row.rowNumber]?.[field] ?? row.values[field] ?? "";
                  const hasError = errors.some((issue) => issue.toLowerCase().includes(field.toLowerCase()) || (field === "costRate" && issue.toLowerCase().includes("cost")) || (field === "employeeId" && issue.toLowerCase().includes("employee")));
                  return <td key={field} className="px-2 py-2">
                    <button className={`block min-h-8 max-w-48 truncate rounded-lg border px-2 py-1 text-left ${hasError || !value && fieldMetadata[field]?.requiredForNew ? "border-red-500 bg-red-50/60 text-[#9c352f]" : "border-[#d8deea] bg-white text-[#273244]"}`} title={value || "Empty"} onClick={() => setActiveRowNumber(row.rowNumber)}>{value || "Empty"}</button>
                  </td>;
                })}
                <td className="whitespace-nowrap px-2 py-2"><button className={`text-xs font-medium ${errors.length ? "text-[#a33d31]" : "text-[#26825d]"}`} onClick={() => setActiveRowNumber(row.rowNumber)}>{errors.length ? `${errors.length} issues` : row.status === "UNCHANGED" ? "Skipped" : "Ready"}</button></td>
              </tr>;
            })}{filteredRows.length === 0 && <tr><td colSpan={tableFields.length + 3} className="p-8 text-center text-sm text-slate-500">No rows match these filters.</td></tr>}</tbody>
          </table>
        </div>
        {showBulkPreview && bulkRows.length > 0 && <div className="border-t border-[#dce1ea] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Preview before applying</h3><p className="mt-1 text-sm text-slate-600">{bulkValues.length ? `Pasted values will be applied to ${bulkRows.length} rows in ${humanize(bulkField)}.` : `${bulkValue || "No value"} will be set on ${bulkRows.length} rows.`} {overwriteCount} rows already have a value and will not change unless you tick “Overwrite”.</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => setShowBulkPreview(false)}>Cancel</button><button className="btn-primary" onClick={applyBulk}>Apply</button></div></div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />Overwrite existing values ({overwriteCount} rows)</label><label className="flex items-center gap-2"><input type="checkbox" checked={!overwrite} onChange={(event) => setOverwrite(!event.target.checked)} />Only fill empty cells</label></div>
        </div>}
      </section>
    </div>

    <footer className="sticky bottom-0 z-20 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#dce1ea] bg-white px-6 py-3.5">
      <p className="text-sm text-[#697386]">Skipped and blocked rows stay here until fixed.</p>
      <div className="flex gap-2"><button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm font-medium hover:border-[#3552ce]" onClick={downloadIssues}>Export issues (.xlsx)</button><button className="h-10 rounded-xl bg-[#167448] px-4 text-sm font-semibold text-white hover:bg-[#12623d] disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || dirty || ready === 0} onClick={onImport}>Import {ready} ready rows</button></div>
    </footer>

    {activeRow && <div className="fixed inset-0 z-50 flex justify-end bg-[#1a2333]/25" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveRowNumber(null); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="import-row-title" className="flex h-full w-full max-w-[780px] flex-col bg-white shadow-2xl sm:w-[min(760px,75vw)]">
        <header className="flex items-center gap-3 border-b border-[#e7eaf0] px-5 py-4">
          <button className="h-10 w-10 rounded-xl border border-[#d4dae4] text-lg disabled:opacity-40" aria-label="Previous issue" disabled={activeRowIndex <= 0} onClick={() => openNextIssue(-1)}>↑</button>
          <button className="h-10 w-10 rounded-xl border border-[#d4dae4] text-lg disabled:opacity-40" aria-label="Next issue" disabled={activeRowIndex >= filteredRows.length - 1} onClick={() => openNextIssue(1)}>↓</button>
          <div className="min-w-0 flex-1"><h2 id="import-row-title" className="truncate font-bold text-slate-900">{activeRow.values.name || "Unnamed resource"} · Row {activeRow.rowNumber}</h2><p className="text-xs text-slate-500">Emp ID {activeRow.values.employeeId || "—"} · Issue {activeRowIndex + 1} of {filteredRows.length}</p></div>
          <button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm" onClick={() => setActiveRowNumber(null)}>Close</button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-xl border border-[#edc8c4] bg-[#fff5f4] p-3 text-sm text-[#963b35]"><strong>{rowIssues(activeRow).length} issues:</strong> {rowIssues(activeRow).map(issueLabel).join(" · ") || "No stored issues."}</div>
          <div className="mt-5 grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <div className="col-span-3 mb-1 text-xs font-bold uppercase tracking-[0.08em] text-[#697386]">Fields</div>
            <span className="text-xs text-slate-500">Field</span><span className="text-xs text-slate-500">From file</span><span className="text-xs text-slate-500">Corrected</span>
            {fields.filter((field) => field !== "employeeId" || activeRow.values.employeeId).map((field) => {
              const value = editedRows[activeRow.rowNumber]?.[field] ?? activeRow.values[field] ?? "";
              const sourceHeader = mapping[field];
              const sourceValue = sourceHeader ? activeRow.source?.[sourceHeader] ?? activeRow.values[field] ?? "" : "";
              const hasError = rowIssues(activeRow).some((issue) => issue.toLowerCase().includes(field.toLowerCase()) || (field === "costRate" && issue.toLowerCase().includes("cost")));
              return <div key={field} className="contents">
                <label htmlFor={`corrected-${activeRow.rowNumber}-${field}`} className="self-center text-sm text-[#273244]">{humanize(field)}{fieldMetadata[field]?.requiredForNew && <strong className="text-red-600"> *</strong>}</label>
                <span className="self-center truncate text-sm text-[#697386]" title={sourceValue}>{sourceValue || "—"}</span>
                <input id={`corrected-${activeRow.rowNumber}-${field}`} className={`h-10 min-w-0 rounded-lg border px-2.5 text-sm outline-none focus:border-[#3a54d1] focus:ring-2 focus:ring-[#354fd1]/10 ${hasError ? "border-red-500 bg-red-50/50 text-[#963b35]" : "border-[#d5dbe5] bg-white"}`} placeholder={value ? "" : "Empty"} value={value} onChange={(event) => onEdit(activeRow.rowNumber, field, event.target.value)} />
              </div>;
            })}
          </div>
          <p className="mt-3 text-xs text-[#697386]">Blank values do not clear existing resource fields.</p>
          {rowIssues(activeRow).some((issue) => /portfolio code was not found/i.test(issue)) && <div className="mt-4 rounded-xl border border-[#e1e5ed] bg-[#f8f9fc] p-3"><h3 className="font-semibold text-slate-900">Suggestions</h3><p className="mt-1 text-sm text-[#697386]">{similarCodes(activeRow.values.portfolioCode || "", portfolios).length ? `Portfolio codes similar to “${activeRow.values.portfolioCode}”: ${similarCodes(activeRow.values.portfolioCode || "", portfolios).join(", ")}` : "Check the portfolio code against the available portfolios."}</p></div>}
          <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-[#3155ce]">Show raw data</summary><pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(activeRow.source ?? {}, null, 2)}</pre></details>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e7eaf0] p-4">
          <button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm" onClick={() => onRevert(activeRow.rowNumber)}>Revert edits</button>
          <button className="h-10 rounded-xl border border-[#d4dae4] bg-white px-4 text-sm" disabled={busy} onClick={() => void onRevalidate()}>Save and recheck</button>
          <button className="h-10 rounded-xl bg-[#334bd1] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || activeRowIndex >= filteredRows.length - 1} onClick={async () => { await onRevalidate(); openNextIssue(1); }}>Save and next issue</button>
        </footer>
      </aside>
    </div>}
  </section>;
}
