import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Resource } from "../types";
import StatusBadge from "../components/StatusBadge";

export default function Bench() {
  const [classification, setClassification] = useState<string>("");

  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["bench", classification],
    queryFn: async () => (await api.get("/bench", { params: { classification: classification || undefined } })).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Bench Management</h1>
        <p className="text-sm text-slate-500">
          Committed Bench (future assignment already scheduled) vs. True Bench (nothing scheduled). Aging past the
          configured threshold is flagged for RMG/TA follow-up.
        </p>
      </div>

      <div className="flex gap-2">
        {["", "BENCH_COMMITTED", "BENCH_TRUE"].map((c) => (
          <button
            key={c}
            className={`badge border ${classification === c ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}
            onClick={() => setClassification(c)}
          >
            {c === "" ? "All Bench" : c.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Portfolio</th>
              <th className="py-2 px-4">Manager</th>
              <th className="py-2 px-4">Sub Category</th>
              <th className="py-2 px-4">Classification</th>
              <th className="py-2 px-4">Days on Bench</th>
              <th className="py-2 px-4">Bench Start</th>
              <th className="py-2 px-4">Next Scheduled Start</th>
              <th className="py-2 px-4">Available %</th>
              <th className="py-2 px-4">Skills</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {resources.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-2 px-4">
                  <Link to={`/resources/${r.id}`} className="text-brand-600 hover:underline font-medium">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 px-4">{r.portfolio?.name}</td>
                <td className="py-2 px-4">{r.managerName || "—"}</td>
                <td className="py-2 px-4">{r.subCategory || "—"}</td>
                <td className="py-2 px-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 px-4">
                  {r.daysOnBench ?? "—"}
                  {r.status === "BENCH_TRUE" && (r.daysOnBench ?? 0) >= 30 && (
                    <span className="ml-2 badge bg-red-100 text-red-700">Aging</span>
                  )}
                </td>
                <td className="py-2 px-4">{r.benchSince ? new Date(r.benchSince).toLocaleDateString() : r.dateOfJoining ? new Date(r.dateOfJoining).toLocaleDateString() : "—"}</td>
                <td className="py-2 px-4">
                  {r.nextScheduledAllocation
                    ? `${r.nextScheduledAllocation.project?.name} on ${new Date(r.nextScheduledAllocation.startDate).toLocaleDateString()}`
                    : "—"}
                </td>
                <td className="py-2 px-4">{r.availablePercentForDeployment ?? 100}%</td>
                <td className="py-2 px-4">
                  <div className="flex flex-wrap gap-1">
                    {r.skills.slice(0, 3).map((s) => (
                      <span key={s.id} className="badge bg-slate-100 text-slate-600">
                        {s.skill.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && resources.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  No resources currently on bench.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
