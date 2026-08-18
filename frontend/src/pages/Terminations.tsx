import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { TerminationRequest } from "../types";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function Terminations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery<TerminationRequest[]>({
    queryKey: ["terminations"],
    queryFn: async () => (await api.get("/terminations")).data,
  });

  async function decide(id: string, action: "approve" | "reject") {
    await api.post(`/terminations/${id}/${action}`);
    queryClient.invalidateQueries({ queryKey: ["terminations"] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Termination / Offboarding Requests</h1>
        <p className="text-sm text-slate-500">
          HR approval is required for every termination regardless of who initiates it (Workflow 7.5).
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Resource</th>
              <th className="py-2 px-4">Reason</th>
              <th className="py-2 px-4">Initiated By</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Created</th>
              {user?.role === "HR" && <th className="py-2 px-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4">
                  <Link to={`/resources/${r.resourceId}`} className="text-brand-600 hover:underline font-medium">
                    {r.resource.name}
                  </Link>
                </td>
                <td className="py-2 px-4">{r.reasonCode.replace(/_/g, " ")}</td>
                <td className="py-2 px-4">{r.initiatedBy?.name}</td>
                <td className="py-2 px-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 px-4">{new Date(r.createdAt).toLocaleDateString()}</td>
                {user?.role === "HR" && (
                  <td className="py-2 px-4">
                    {r.status === "PENDING_HR_APPROVAL" && (
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => decide(r.id, "approve")}>
                          Approve
                        </button>
                        <button className="btn-secondary" onClick={() => decide(r.id, "reject")}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!isLoading && requests.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  No termination requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
