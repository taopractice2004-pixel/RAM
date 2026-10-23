import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Allocation } from "../types";
import StatusBadge from "../components/StatusBadge";

export default function Allocations() {
  const [resource, setResource] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { data: allocations = [], isLoading } = useQuery<Allocation[]>({
    queryKey: ["allocations", resource, project, status, startDate, endDate],
    queryFn: async () => (await api.get("/allocations", { params: {
      resource: resource || undefined,
      project: project || undefined,
      status: status || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    } })).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Allocations & Reallocations</h1>
        <p className="text-sm text-slate-500">Full history of assignments, scoped to your authorized portfolios.</p>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div><label className="label">Resource</label><input className="input" value={resource} onChange={(event) => setResource(event.target.value)} placeholder="Name or employee ID" /></div>
          <div><label className="label">Project</label><input className="input" value={project} onChange={(event) => setProject(event.target.value)} placeholder="Project name" /></div>
          <div><label className="label">Status</label><select className="input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Default active and scheduled</option><option value="ACTIVE,SCHEDULED">Active and scheduled</option><option value="ACTIVE">Active</option><option value="SCHEDULED">Scheduled</option><option value="CLOSED">Closed history</option></select></div>
          <div><label className="label">Starting on or after</label><input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div><label className="label">Starting on or before</label><input className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
        </div>
        <button type="button" className="btn-secondary mt-3" onClick={() => { setResource(""); setProject(""); setStatus(""); setStartDate(""); setEndDate(""); }}>Reset filters</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Resource</th>
              <th className="py-2 px-4">Project</th>
              <th className="py-2 px-4">Role</th>
              <th className="py-2 px-4">Reporting Manager</th>
              <th className="py-2 px-4">%</th>
              <th className="py-2 px-4">FTE</th>
              <th className="py-2 px-4">Start</th>
              <th className="py-2 px-4">End</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Created By</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-slate-400">
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
                <td className="py-2 px-4">{a.roleOnProject || "—"}</td>
                <td className="py-2 px-4">{a.projectReportingManagerName || "—"}</td>
                <td className="py-2 px-4">{a.allocationPercent}%</td>
                <td className="py-2 px-4">{(a.allocationPercent / 100).toFixed(2)}</td>
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
                <td colSpan={10} className="py-6 text-center text-slate-400">
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
