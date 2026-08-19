import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

const REPORTS = [
  { key: "utilization", label: "Utilization", endpoint: "/reports/utilization" },
  { key: "capacity", label: "Capacity Planning", endpoint: "/reports/capacity" },
  { key: "bench-aging", label: "Bench Aging", endpoint: "/reports/bench-aging" },
  { key: "termination-trends", label: "Termination Trends", endpoint: "/reports/termination-trends" },
];

export default function Reports() {
  const [active, setActive] = useState(REPORTS[0]);

  const { data: rows = [], isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["report", active.key],
    queryFn: async () => (await api.get(active.endpoint)).data,
  });

  async function downloadCsv() {
    const res = await api.get(active.endpoint, { params: { format: "csv" }, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${active.key}_report.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reports & Analytics</h1>
        <p className="text-sm text-slate-500">Exportable reporting including experience, availability, bench aging, and lifecycle context.</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              className={`badge border ${active.key === r.key ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}
              onClick={() => setActive(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button className="btn-secondary" onClick={downloadCsv}>
          Download CSV
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              {columns.map((c) => (
                <th key={c} className="py-2 px-4 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="py-6 text-center text-slate-400">Loading...</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                {columns.map((c) => (
                  <td key={c} className="py-2 px-4 whitespace-nowrap">
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="py-6 text-center text-slate-400">No data available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
