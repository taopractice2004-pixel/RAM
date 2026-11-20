import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Allocation, Project, Resource } from "../types";
import Modal from "./Modal";
import { canAllocateResource, canEditAllocations, useAuth } from "../context/AuthContext";

interface Props {
  resource?: Resource;
  resources?: Resource[];
  mode: "allocate" | "reallocate";
  currentAllocationId?: string;
  sourceAllocation?: Allocation;
  onClose: () => void;
}

export default function AllocationModal({ resource: initialResource, resources = [], mode, currentAllocationId, sourceAllocation, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [resourceId, setResourceId] = useState(initialResource?.id ?? "");
  const resource = initialResource ?? resources.find((item) => item.id === resourceId);
  const { data: allocationResources = [], isError: resourcePickerError, isFetching: resourcePickerLoading } = useQuery<Resource[]>({
    queryKey: ["allocation-resource-picker", user?.id, user?.role, user?.authorizedPortfolioIds],
    enabled: Boolean(user) && !initialResource,
    queryFn: async () => {
      const params = { page: 1, pageSize: 100 };
      const first = (await api.get("/resources", { params })).data as { total: number; pageSize: number; resources: Resource[] };
      if (!first.pageSize) throw new Error("Could not load the employee list.");
      const later = await Promise.all(Array.from({ length: Math.ceil(first.total / first.pageSize) - 1 }, (_, index) => api.get("/resources", { params: { ...params, page: index + 2 } })));
      const allResources = [...first.resources, ...later.flatMap((response) => response.data.resources as Resource[])];
      if (allResources.length !== first.total || new Set(allResources.map((item) => item.id)).size !== first.total) throw new Error("Employee pages were incomplete.");
      return allResources;
    },
  });
  const eligibleResources = (resources.length ? resources : allocationResources).filter((item) => canAllocateResource(user, item));
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [allocationPercent, setAllocationPercent] = useState(100);
  const [roleOnProject, setRoleOnProject] = useState("");
  const [projectReportingManagerName, setProjectReportingManagerName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [conflict, setConflict] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
      queryKey: ["projects", user?.id, user?.role, user?.authorizedPortfolioIds],
      enabled: Boolean(user),
      queryFn: async () => (await api.get("/projects")).data,
  });

  const selectedProject = projects.find((p) => p.id === projectId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!resource || !projectId || !canEditAllocations(user, [resource.portfolioId, ...(selectedProject ? [selectedProject.portfolioId] : [])])) {
      setError("Select an employee and project you are authorized to allocate.");
      return;
    }
    setConflict(null);
    setSubmitting(true);
    try {
      const payload = {
        projectId,
        taskId: taskId || undefined,
        allocationPercent: Number(allocationPercent),
        roleOnProject: roleOnProject || undefined,
        projectReportingManagerName: projectReportingManagerName || undefined,
        startDate,
        endDate: endDate || undefined,
        notes: notes || undefined,
        override,
      };
      if (mode === "allocate") {
        await api.post("/allocations", { ...payload, resourceId: resource.id });
      } else {
        await api.post(`/allocations/${currentAllocationId}/reallocate`, payload);
      }
      await Promise.all([["resource", resource.id], ["resources"], ["allocations"], ["bench"], ["dashboard"], ["resource-recommendations"]]
        .map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setConflict(err.response.data.capacity);
        setError(err.response.data.error);
      } else {
        setError(err.response?.data?.error || "Request failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={mode === "allocate" ? resource ? `Allocate ${resource.name}` : "New allocation" : `Reallocate ${resource?.name ?? ""}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!initialResource && <label className="label">Employee
          <select className="input" value={resourceId} required disabled={submitting || resourcePickerLoading || resourcePickerError} onChange={(event) => { setResourceId(event.target.value); setConflict(null); setOverride(false); setError(null); }}>
            <option value="">{resourcePickerLoading ? "Loading employees..." : "Select an employee..."}</option>
            {eligibleResources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.employeeId})</option>)}
          </select>
          {resourcePickerError && <span role="alert" className="text-sm text-red-600">Could not load employees. Close and reopen to retry.</span>}
        </label>}
        {mode === "reallocate" && sourceAllocation && (
          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
            Reallocating from <span className="font-medium text-slate-800">{sourceAllocation.project?.name || "selected project"}</span>
            {sourceAllocation.roleOnProject ? ` as ${sourceAllocation.roleOnProject}` : ""}.
          </div>
        )}
        <div>
          <label className="label">Target Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        {selectedProject && (
          <div>
            <label className="label">Task (optional)</label>
            <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">No specific task</option>
              {(selectedProject as any).tasks?.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Allocation %</label>
            <input
              className="input"
              type="number"
              min={1}
              max={100}
              value={allocationPercent}
              onChange={(e) => setAllocationPercent(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="label">Start Date</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Role On Project</label>
            <input className="input" value={roleOnProject} onChange={(e) => setRoleOnProject(e.target.value)} placeholder="Lead Engineer" />
          </div>
          <div>
            <label className="label">Reporting Manager</label>
            <input className="input" value={projectReportingManagerName} onChange={(e) => setProjectReportingManagerName(e.target.value)} placeholder="Venkat" />
          </div>
        </div>
        <div>
          <label className="label">End Date (optional)</label>
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {selectedProject && (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
            {selectedProject.isInternalProject && <div>This project belongs to the internal AI/ML portfolio and will default subcategory to Internal Project.</div>}
            {selectedProject.billingDelayed && <div>This project is marked as Billing Delay.</div>}
            {!selectedProject.isInternalProject && !selectedProject.billingDelayed && <div>This allocation will set the resource subcategory to Allocated.</div>}
          </div>
        )}
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {conflict && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-1">
            <div className="font-medium">Scheduling conflict detected</div>
            <div>
              Committed: {conflict.committedPercent}% + Requested: {conflict.requestedPercent}% = {conflict.totalPercent}% (over
              100%)
            </div>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Override and proceed anyway (will be audit-logged)
            </label>
          </div>
        )}
        {error && !conflict && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting || !projectId || !resource || (!initialResource && (resourcePickerLoading || resourcePickerError))}>
            {submitting ? "Submitting..." : mode === "allocate" ? "Allocate" : "Reallocate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
