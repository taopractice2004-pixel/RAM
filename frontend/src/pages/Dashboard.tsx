import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "../api/client";
import { DashboardSummary } from "../types";
import { useAuth } from "../context/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
  BENCH_COMMITTED: "Bench (Committed)",
  BENCH_TRUE: "Bench (True)",
  ON_ML: "On ML",
  TERMINATED: "Terminated",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard")).data,
  });

  if (isLoading || !data) return <div className="text-sm text-slate-400">Loading dashboard...</div>;

  const statusMap = Object.fromEntries(data.statusCounts.map((s) => [s.status, s.count]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Capacity & Utilization Dashboard</h1>
        <p className="text-sm text-slate-500">
          Scoped to {user?.role === "RMG" || user?.role === "ADMIN" || user?.role === "HR" ? "all portfolios (cross-portfolio read access)" : "your authorized portfolios"}.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Resources" value={data.totalActiveResources} />
        <StatCard label="Utilization Rate" value={`${data.utilizationRate}%`} sub="Allocated / Active" />
        <StatCard label="Active Allocations" value={data.activeAllocationsCount} />
        <StatCard label="Aging True-Bench" value={data.byPortfolio.reduce((s, p) => s + p.agingTrueBench, 0)} sub="Past threshold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Resource State Breakdown</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div key={key} className="flex-1 min-w-[120px] rounded-md bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-lg font-semibold text-slate-800">{statusMap[key] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Utilization by Portfolio</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byPortfolio}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="portfolioName" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="allocated" name="Allocated" fill="#2563eb" />
              <Bar dataKey="benchCommitted" name="Bench (Committed)" fill="#f59e0b" />
              <Bar dataKey="benchTrue" name="Bench (True)" fill="#fb923c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Portfolio Detail</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Portfolio</th>
              <th className="py-2 pr-4">Active Resources</th>
              <th className="py-2 pr-4">Allocated</th>
              <th className="py-2 pr-4">Bench (Committed)</th>
              <th className="py-2 pr-4">Bench (True)</th>
              <th className="py-2 pr-4">On ML</th>
              <th className="py-2 pr-4">Aging Past Threshold</th>
              <th className="py-2 pr-4">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data.byPortfolio.map((p) => (
              <tr key={p.portfolioId} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-medium text-slate-800">{p.portfolioName}</td>
                <td className="py-2 pr-4">{p.totalActiveResources}</td>
                <td className="py-2 pr-4">{p.allocated}</td>
                <td className="py-2 pr-4">{p.benchCommitted}</td>
                <td className="py-2 pr-4">{p.benchTrue}</td>
                <td className="py-2 pr-4">{p.onMl ?? 0}</td>
                <td className="py-2 pr-4">{p.agingTrueBench > 0 ? <span className="text-red-600 font-medium">{p.agingTrueBench}</span> : 0}</td>
                <td className="py-2 pr-4">{p.utilizationRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
