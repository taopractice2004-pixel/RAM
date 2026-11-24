import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import * as XLSX from "xlsx";

const REPORTS = [
  { key: "utilization", label: "Utilization", endpoint: "/reports/utilization" },
  { key: "capacity", label: "Capacity Planning", endpoint: "/reports/capacity" },
  { key: "forecast", label: "Forecast", endpoint: "/reports/forecast" },
  { key: "bench-aging", label: "Bench Aging", endpoint: "/reports/bench-aging" },
  { key: "bench-count", label: "Bench Employee Count", endpoint: "/reports/bench-pivots" },
  { key: "bench-cost", label: "Bench Monthly Cost", endpoint: "/reports/bench-pivots" },
  { key: "termination-trends", label: "Termination Trends", endpoint: "/reports/termination-trends" },
];

interface BenchPivotReport {
  categories: string[];
  countRows: Record<string, string | number>[];
  costRows: Record<string, string | number>[];
  costVisible: boolean;
}

export default function Reports() {
  const [active, setActive] = useState(REPORTS[0]);
  const [expanded, setExpanded] = useState(false);
  const isBenchPivot = active.key === "bench-count" || active.key === "bench-cost";
  const isCostPivot = active.key === "bench-cost";

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeExpanded = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeExpanded);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeExpanded);
    };
  }, [expanded]);

  const { data: rows = [], isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["report", active.key],
    enabled: !isBenchPivot,
    queryFn: async () => (await api.get(active.endpoint)).data,
  });
  const { data: pivots, isLoading: isPivotLoading } = useQuery<BenchPivotReport>({
    queryKey: ["report", "bench-pivots"],
    enabled: isBenchPivot,
    queryFn: async () => (await api.get("/reports/bench-pivots")).data,
  });

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const downloadReportExcel = () => {
    if (!rows.length || !columns.length) return;
    const values = rows.map((row) => columns.map((column) => {
      const value = row[column];
      return value == null ? "" : typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date ? value : String(value);
    }));
    const worksheet = XLSX.utils.aoa_to_sheet([columns, ...values]);
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
    worksheet["!cols"] = columns.map((column, index) => ({ wch: Math.min(40, Math.max(column.length + 2, ...values.map((row) => String(row[index] ?? "").length + 2))) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, active.label.slice(0, 31));
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    const url = window.URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${active.key}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadPivotExcel = () => {
    if (!pivots || (isCostPivot && !pivots.costVisible)) return;
    const reportRows = isCostPivot ? pivots.costRows : pivots.countRows;
    if (!reportRows.length) return;
    const headers = ["Manager", ...pivots.categories, "Grand Total"];
    const values = reportRows.map((row) => headers.map((header) => header === "Manager" ? row.manager : header === "Grand Total" ? row.grandTotal : row[header]));
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...values]);
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: reportRows.length, c: headers.length - 1 } }) };
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(32, Math.max(header.length + 2, ...reportRows.map((row) => String(header === "Manager" ? row.manager : header === "Grand Total" ? row.grandTotal ?? "" : row[header] ?? "").length + 2))) }));
    if (isCostPivot) {
      for (let column = 1; column < headers.length; column += 1) {
        for (let rowIndex = 1; rowIndex <= reportRows.length; rowIndex += 1) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
          if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
        }
      }
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, isCostPivot ? "Bench Monthly Cost" : "Bench Employee Count");
    XLSX.writeFile(workbook, `${isCostPivot ? "BenchMonthlyCost" : "BenchEmployeeCount"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className={expanded ? "fixed inset-0 z-[60] overflow-y-auto bg-[#f4f6fa] px-4 py-5 sm:px-8" : "-m-6 min-h-screen bg-[#f4f6fa] px-4 py-5 sm:px-8"}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#193a8a] via-[#2f4bd8] to-[#5268e8] px-5 py-6 text-white shadow-lg sm:px-8">
          <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full border-[30px] border-white/10" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wider text-white/90">WORKFORCE INTELLIGENCE</span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Reports &amp; Analytics</h1>
              <p className="mt-2 text-sm text-blue-100">Explore capacity, utilization, bench, and lifecycle reporting.</p>
            </div>
            <span className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white/90">{active.label}</span>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label="Reports">
            {REPORTS.map((report) => (
              <button
                key={report.key}
                type="button"
                role="tab"
                aria-selected={active.key === report.key}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${active.key === report.key ? "border-[#2f4bd8] bg-[#2f4bd8] text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-[#cbd4ff] hover:bg-[#f7f8ff] hover:text-[#2f4bd8]"}`}
                onClick={() => setActive(report)}
              >
                {report.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className="btn-secondary" aria-label={expanded ? "Exit expanded report view" : "Expand report view"} onClick={() => setExpanded(!expanded)}>
              {expanded ? "⤡ Exit expanded view" : "⤢ Expand report"}
            </button>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[#157347] bg-[#157347] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#11623c] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isBenchPivot ? isPivotLoading || !pivots || (isCostPivot && !pivots.costVisible) || (isCostPivot ? !pivots?.costRows.length : !pivots?.countRows.length) : isLoading || rows.length === 0}
              onClick={isBenchPivot ? downloadPivotExcel : downloadReportExcel}
            >
              ⬇ Download Excel
            </button>
          </div>
        </section>

        {isBenchPivot ? (
          <div className="space-y-4">
            {isPivotLoading && <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400 shadow-sm">Loading {isCostPivot ? "bench monthly cost" : "bench employee count"} report...</div>}
            {!isPivotLoading && pivots && isCostPivot && !pivots.costVisible && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Monthly direct cost is hidden for your access scope.</div>}
            {!isPivotLoading && pivots && (!isCostPivot || pivots.costVisible) && (
              <PivotTable
                title={isCostPivot ? "Monthly Direct Cost by Manager and Sub Category" : "Employee Count by Manager and Sub Category"}
                description={isCostPivot ? "Monthly direct cost for employees on bench, grouped by manager and bench subcategory." : "Employees on bench, grouped by manager and bench subcategory."}
                categories={pivots.categories}
                rows={isCostPivot ? pivots.costRows : pivots.countRows}
                currency={isCostPivot}
              />
            )}
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div><h2 className="font-semibold text-slate-900">{active.label}</h2><p className="mt-1 text-xs text-slate-500">Current report data</p></div>
              <span className="rounded-full bg-[#eef1ff] px-3 py-1 text-xs font-semibold text-[#354ec4]">{isLoading ? "Loading…" : `${rows.length} rows`}</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f8fc] text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3">{column}</th>)}</tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={Math.max(columns.length, 1)} className="px-4 py-10 text-center text-slate-400">Loading report...</td></tr>}
                  {!isLoading && rows.map((row, index) => (
                    <tr key={index} className="border-t border-slate-100 transition-colors odd:bg-white even:bg-[#fbfcff] hover:bg-[#f1f4ff]">
                      {columns.map((column) => <td key={column} className="whitespace-nowrap px-4 py-3 text-slate-700">{String(row[column] ?? "")}</td>)}
                    </tr>
                  ))}
                  {!isLoading && rows.length === 0 && <tr><td colSpan={Math.max(columns.length, 1)} className="px-4 py-10 text-center text-slate-400">No data available.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PivotTable({ title, description, categories, rows, currency = false }: { title: string; description: string; categories: string[]; rows: Record<string, string | number>[]; currency?: boolean }) {
  const formatValue = (value: string | number | undefined) => currency
    ? Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value ?? 0;
  return <section className="card overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      <span className="badge bg-slate-100 text-slate-600">{rows.length ? `${Math.max(0, rows.length - 1)} managers` : "No data"}</span>
    </header>
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="sticky left-0 bg-slate-50 px-4 py-3">Manager</th>{categories.map((category) => <th key={category} className="whitespace-nowrap px-4 py-3 text-right">{category}</th>)}<th className="whitespace-nowrap px-4 py-3 text-right">Grand Total</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${String(row.manager)}-${index}`} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${row.manager === "Grand Total" ? "bg-slate-50 font-semibold text-slate-900" : ""}`}><td className={`sticky left-0 whitespace-nowrap px-4 py-3 ${row.manager === "Grand Total" ? "bg-slate-50" : "bg-white"}`}>{row.manager}</td>{categories.map((category) => <td key={category} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatValue(row[category])}</td>)}<td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatValue(row.grandTotal)}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={categories.length + 2} className="px-4 py-8 text-center text-slate-400">No data available.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
