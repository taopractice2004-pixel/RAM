import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Resource } from "../types";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import AllocationModal from "../components/AllocationModal";
import TerminateModal from "../components/TerminateModal";

// Section 5.3: Allocate/Reallocate/Manually-reallocate-from-bench = Admin + RMG only.
const LIFECYCLE_ACTION_ROLES = ["ADMIN", "RMG"];
const TERMINATION_ROLES = ["ADMIN", "RMG", "HR"];

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<"allocate" | "reallocate" | "terminate" | null>(null);

  const { data: resource, isLoading } = useQuery<Resource>({
    queryKey: ["resource", id],
    queryFn: async () => (await api.get(`/resources/${id}`)).data,
    enabled: !!id,
  });

  async function handleUnassign(allocationId: string) {
    if (!confirm("Unassign this resource from the project? It will automatically move to Bench.")) return;
    await api.post(`/allocations/${allocationId}/unassign`);
    queryClient.invalidateQueries({ queryKey: ["resource", id] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
    queryClient.invalidateQueries({ queryKey: ["bench"] });
  }

  if (isLoading || !resource) return <div className="text-sm text-slate-400">Loading...</div>;

  const canAct = user && LIFECYCLE_ACTION_ROLES.includes(user.role);
  const canTerminate = user && TERMINATION_ROLES.includes(user.role);
  const activeAllocation = resource.allocations?.find((a) => a.status === "ACTIVE");
  const canAllocate = canAct && ["AVAILABLE", "BENCH_COMMITTED", "BENCH_TRUE"].includes(resource.status);
  const canReallocate = canAct && !!activeAllocation;

  return (
    <div className="space-y-6">
      <Link to="/resources" className="text-sm text-brand-600 hover:underline">
        &larr; Back to Resources
      </Link>

      <div className="card p-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{resource.name}</h1>
          <p className="text-sm text-slate-500">
            {resource.employeeId} &middot; {resource.portfolio.name} &middot; {resource.location}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={resource.status} />
            {resource.willingToRelocate && <span className="badge bg-slate-100 text-slate-600">Willing to relocate</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Cost Rate</div>
          <div className="text-lg font-semibold text-slate-800">
            {resource.costRate != null ? `${resource.costRate} ${resource.currency}` : <span className="text-sm text-slate-400 font-normal">Restricted</span>}
          </div>
        </div>
      </div>

      {resource.status !== "TERMINATED" && (
        <div className="flex flex-wrap gap-2">
          {canAllocate && (
            <button className="btn-primary" onClick={() => setModal("allocate")}>
              Allocate
            </button>
          )}
          {canReallocate && (
            <button className="btn-primary" onClick={() => setModal("reallocate")}>
              Reallocate
            </button>
          )}
          {canReallocate && activeAllocation && (
            <button className="btn-secondary" onClick={() => handleUnassign(activeAllocation.id)}>
              Unassign (&rarr; Bench)
            </button>
          )}
          {canTerminate && (
            <button className="btn-danger" onClick={() => setModal("terminate")}>
              Terminate / Offboard
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {resource.skills.map((s) => (
              <span key={s.id} className="badge bg-brand-50 text-brand-700 border border-brand-100">
                {s.skill.name} &middot; L{s.proficiency} &middot; {s.yearsExperience}y
              </span>
            ))}
            {resource.skills.length === 0 && <span className="text-xs text-slate-400">No skills recorded.</span>}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Certifications</h2>
          <ul className="text-sm space-y-1">
            {resource.certifications.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.name}</span>
                {c.issuer && <span className="text-slate-400"> — {c.issuer}</span>}
              </li>
            ))}
            {resource.certifications.length === 0 && <span className="text-xs text-slate-400">No certifications recorded.</span>}
          </ul>
        </div>

        {resource.performanceRecords && (
          <div className="card p-4 md:col-span-2">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">Performance / PIP Status</h2>
            <p className="text-xs text-slate-400 mb-3">Restricted view — visible to HR, RMG, and Delivery only.</p>
            <ul className="text-sm space-y-2">
              {resource.performanceRecords.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="font-medium">{p.rating}</span>
                  {p.pipStatus && <span className="badge bg-red-100 text-red-700">On PIP</span>}
                  <span className="text-slate-400">{new Date(p.reviewDate).toLocaleDateString()}</span>
                </li>
              ))}
              {resource.performanceRecords.length === 0 && <span className="text-xs text-slate-400">No performance records.</span>}
            </ul>
          </div>
        )}

        <div className="card p-4 md:col-span-2 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Allocation History</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Project</th>
                <th className="py-2 pr-4">%</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {resource.allocations?.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4">{a.project?.name}</td>
                  <td className="py-2 pr-4">{a.allocationPercent}%</td>
                  <td className="py-2 pr-4">{new Date(a.startDate).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{a.endDate ? new Date(a.endDate).toLocaleDateString() : "—"}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
              {(!resource.allocations || resource.allocations.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    No allocation history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "allocate" && <AllocationModal resource={resource} mode="allocate" onClose={() => setModal(null)} />}
      {modal === "reallocate" && activeAllocation && (
        <AllocationModal resource={resource} mode="reallocate" currentAllocationId={activeAllocation.id} onClose={() => setModal(null)} />
      )}
      {modal === "terminate" && <TerminateModal resource={resource} onClose={() => setModal(null)} />}
    </div>
  );
}
