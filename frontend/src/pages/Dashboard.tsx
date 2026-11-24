import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "../api/client";
import { DashboardSummary } from "../types";
import { useAuth } from "../context/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  ALLOCATED: "Allocated",
  BENCH_COMMITTED: "Bench (Committed)",
  BENCH_TRUE: "Bench (True)",
  ON_ML: "On ML",
  TERMINATED: "Terminated",
};

const STATUS_STYLES: Record<string, { dot: string }> = {
  ALLOCATED: { dot: "bg-[#157347]" },
  BENCH_COMMITTED: { dot: "bg-[#d19b05]" },
  BENCH_TRUE: { dot: "bg-[#e87932]" },
  ON_ML: { dot: "bg-[#7040a0]" },
  TERMINATED: { dot: "bg-slate-400" },
};

function StatCard({ label, value, sub, icon, tone, accent }: { label: string; value: string | number; sub: string; icon: string; tone: string; accent: string }) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 border-t-[3px] ${accent} bg-white p-3 shadow-sm transition-shadow hover:shadow-md`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-slate-900 tabular-nums">{value}</div>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${tone}`} aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-2 truncate text-[10px] text-slate-400">{sub}</p>
    </article>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard")).data,
  });

  const scope = user?.role === "RMG" || user?.role === "ADMIN" || user?.role === "HR"
    ? "All portfolios · cross-portfolio read access"
    : "Your authorized portfolios";

  if (isLoading) {
    return <div className="-m-6 min-h-screen bg-[#f4f6fa] px-4 py-6 sm:px-8"><div className="mx-auto max-w-[1600px] space-y-5">
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />)}</div>
      <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" />
    </div></div>;
  }

  if (isError || !data) {
    return <div className="-m-6 min-h-screen bg-[#f4f6fa] px-4 py-6 sm:px-8"><div className="mx-auto max-w-[1600px] rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">!</div>
      <h1 className="mt-3 text-lg font-semibold text-slate-900">Dashboard could not be loaded</h1>
      <p className="mt-1 text-sm text-slate-500">Please check your connection and try again.</p>
      <button type="button" className="btn-primary mt-5" onClick={() => void refetch()}>Try again</button>
    </div></div>;
  }

  const statusMap = Object.fromEntries(data.statusCounts.map((status) => [status.status, status.count]));
  const agingTrueBench = data.byPortfolio.reduce((sum, portfolio) => sum + portfolio.agingTrueBench, 0);
  const stats = [
    { label: "Active resources", value: data.totalActiveResources, sub: "In authorized portfolios", icon: "◉", tone: "bg-[#e8edff] text-[#2f4bd8]", accent: "border-t-[#2f4bd8]" },
    { label: "Portfolios", value: data.byPortfolio.length, sub: "In your authorized scope", icon: "▤", tone: "bg-[#e3f4ea] text-[#157347]", accent: "border-t-[#157347]" },
    { label: "Active allocations", value: data.activeAllocationsCount, sub: "Current assignments", icon: "▦", tone: "bg-[#e5f3fa] text-[#13749c]", accent: "border-t-[#13749c]" },
    { label: "Committed bench", value: statusMap.BENCH_COMMITTED ?? 0, sub: "Future assignment scheduled", icon: "◷", tone: "bg-[#fff4cc] text-[#8a6800]", accent: "border-t-[#e3ad19]" },
    { label: "True bench", value: statusMap.BENCH_TRUE ?? 0, sub: `${agingTrueBench} aging past threshold`, icon: "!", tone: "bg-[#ffe9d6] text-[#a34c0a]", accent: "border-t-[#e87932]" },
  ];

  return (
    <div className="-m-6 min-h-screen bg-[#f4f6fa] px-4 py-5 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
          <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:px-6">
            <div className="min-w-0">
              <span className="text-[11px] font-bold tracking-[0.14em] text-[#5268c9]">WORKFORCE OVERVIEW</span>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Make every resource count.</h1>
              <p className="mt-1 text-sm text-slate-500">See availability, allocation, and bench at a glance.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-[#eef1ff] px-3 py-2 text-xs font-semibold text-[#354ec4]">{scope}</span>
            </div>
          </header>
          <section aria-label="Resource state breakdown" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h2 className="text-sm font-semibold text-slate-900">Resource state</h2><p className="mt-0.5 text-[11px] text-slate-500">Current workforce distribution</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">6 statuses</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(STATUS_LABELS).map(([key, label]) => {
                const style = STATUS_STYLES[key];
                return <div key={key} className="min-w-0 rounded-lg bg-[#fafbfe] px-2 py-1.5">
                  <div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} /><span className="truncate text-[10px] leading-tight text-slate-500">{label}</span></div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-slate-800">{statusMap[key] ?? 0}</div>
                </div>;
              })}
            </div>
          </section>
        </div>

        <section aria-label="Resource and bench summary" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 border-l-4 border-l-[#5268c9] px-5 py-3.5">
            <div>
              <h2 className="font-semibold text-slate-900">Portfolio overview</h2>
              <p className="mt-1 text-xs text-slate-500">Resource capacity and utilization by portfolio</p>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{data.byPortfolio.length} portfolios</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap border-r border-slate-200 px-4 py-2.5">Portfolio</th>
                  <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right">Active resources</th>
                  <th className="whitespace-nowrap border-r border-slate-200 bg-emerald-50/60 px-3 py-2.5 text-right text-emerald-800">Allocated</th>
                  <th className="whitespace-nowrap border-r border-slate-200 bg-amber-50/60 px-3 py-2.5 text-right text-amber-800">Bench · committed</th>
                  <th className="whitespace-nowrap border-r border-slate-200 bg-orange-50/60 px-3 py-2.5 text-right text-orange-800">Bench · true</th>
                  <th className="whitespace-nowrap border-r border-slate-200 px-3 py-2.5 text-right">On ML</th>
                  <th className="whitespace-nowrap border-r border-slate-200 bg-rose-50/60 px-3 py-2.5 text-right text-rose-800">Aging</th>
                  <th className="whitespace-nowrap bg-blue-50/60 px-4 py-2.5 text-right text-blue-800">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {data.byPortfolio.map((portfolio) => (
                  <tr key={portfolio.portfolioId} className="border-t border-slate-100 transition-colors even:bg-slate-50/60 hover:bg-blue-50/40">
                    <td className="whitespace-nowrap border-r border-slate-100 px-4 py-2.5 font-medium text-slate-800"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#5268c9]" />{portfolio.portfolioName}</td>
                    <td className="border-r border-slate-100 px-3 py-2.5 text-right tabular-nums text-slate-700">{portfolio.totalActiveResources}</td>
                    <td className="border-r border-slate-100 bg-emerald-50/30 px-3 py-2.5 text-right font-medium tabular-nums text-emerald-800">{portfolio.allocated}</td>
                    <td className="border-r border-slate-100 bg-amber-50/30 px-3 py-2.5 text-right font-medium tabular-nums text-amber-800">{portfolio.benchCommitted}</td>
                    <td className="border-r border-slate-100 bg-orange-50/30 px-3 py-2.5 text-right font-medium tabular-nums text-orange-800">{portfolio.benchTrue}</td>
                    <td className="border-r border-slate-100 px-3 py-2.5 text-right tabular-nums text-slate-700">{portfolio.onMl ?? 0}</td>
                    <td className="border-r border-slate-100 bg-rose-50/30 px-3 py-2.5 text-right tabular-nums">{portfolio.agingTrueBench > 0 ? <span className="font-medium text-rose-700">{portfolio.agingTrueBench}</span> : <span className="text-slate-400">0</span>}</td>
                    <td className="bg-blue-50/30 px-4 py-2.5 text-right font-medium tabular-nums text-blue-800">{portfolio.utilizationRate}%</td>
                  </tr>
                ))}
                {data.byPortfolio.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">No portfolio data is available for your scope.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5" aria-label="Resource and bench analytics">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="font-semibold text-slate-900">Allocation &amp; bench by portfolio</h2>
              <p className="mt-1 text-xs text-slate-500">Compare allocated resources with both bench categories</p>
            </div>
            {data.byPortfolio.length > 0 ? <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.byPortfolio} margin={{ top: 8, right: 8, bottom: 8, left: -12 }} barGap={5}>
                <CartesianGrid stroke="#e9edf5" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="portfolioName" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#f4f6fb" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px #17223a14" }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="allocated" name="Allocated" fill="#2f4bd8" radius={[5, 5, 0, 0]} />
                <Bar dataKey="benchCommitted" name="Bench · committed" fill="#e3ad19" radius={[5, 5, 0, 0]} />
                <Bar dataKey="benchTrue" name="Bench · true" fill="#e87932" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer> : <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">No portfolio data to chart.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
