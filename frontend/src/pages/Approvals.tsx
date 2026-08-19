import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ApprovalRequest } from "../types";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function Approvals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ["approvals"],
    queryFn: async () => (await api.get("/approvals")).data,
  });

  async function decide(request: ApprovalRequest, action: "approve" | "reject") {
    const basePath = request.requestType === "ML" ? `/approvals/ml/${request.id}/${action}` : `/terminations/${request.id}/${action}`;
    await api.post(basePath);
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Approvals</h1>
        <p className="text-sm text-slate-500">Termination and maternity leave requests requiring workflow review.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Type</th>
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
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={`${r.requestType}-${r.id}`} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4 font-medium">{r.requestType === "ML" ? "Maternity Leave" : "Termination"}</td>
                <td className="py-2 px-4">
                  <Link to={`/resources/${r.resourceId}`} className="text-brand-600 hover:underline font-medium">
                    {r.resource.name}
                  </Link>
                </td>
                <td className="py-2 px-4">{"reasonCode" in r ? r.reasonCode.replace(/_/g, " ") : r.reason || "—"}</td>
                <td className="py-2 px-4">{r.initiatedBy?.name}</td>
                <td className="py-2 px-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="py-2 px-4">{new Date(r.createdAt).toLocaleDateString()}</td>
                {user?.role === "HR" && (
                  <td className="py-2 px-4">
                    {r.status === "PENDING_HR_APPROVAL" && (
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => decide(r, "approve")}>
                          Approve
                        </button>
                        <button className="btn-secondary" onClick={() => decide(r, "reject")}>
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
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No approval requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
