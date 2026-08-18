import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Allocation } from "../types";
import StatusBadge from "../components/StatusBadge";

export default function Allocations() {
  const { data: allocations = [], isLoading } = useQuery<Allocation[]>({
    queryKey: ["allocations"],
    queryFn: async () => (await api.get("/allocations")).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Allocations & Reallocations</h1>
        <p className="text-sm text-slate-500">Full history of assignments, scoped to your authorized portfolios.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Resource</th>
              <th className="py-2 px-4">Project</th>
              <th className="py-2 px-4">%</th>
              <th className="py-2 px-4">Start</th>
              <th className="py-2 px-4">End</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Created By</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {allocations.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4">
                  <Link to={`/resources/${a.resourceId}`} className="text-brand-600 hover:underline font-medium">
                    {a.resource?.name}
                  </Link>
                </td>
                <td className="py-2 px-4">{a.project?.name}</td>
                <td className="py-2 px-4">{a.allocationPercent}%</td>
                <td className="py-2 px-4">{new Date(a.startDate).toLocaleDateString()}</td>
                <td className="py-2 px-4">{a.endDate ? new Date(a.endDate).toLocaleDateString() : "—"}</td>
                <td className="py-2 px-4">
                  <StatusBadge status={a.status} />
                </td>
                <td className="py-2 px-4 text-slate-500">{a.createdBy?.name}</td>
              </tr>
            ))}
            {!isLoading && allocations.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No allocations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
