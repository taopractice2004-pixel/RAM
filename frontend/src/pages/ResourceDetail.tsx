import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Resource } from "../types";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import AllocationModal from "../components/AllocationModal";
import TerminateModal from "../components/TerminateModal";
import MlModal from "../components/MlModal";

// Section 5.3: Allocate/Reallocate/Manually-reallocate-from-bench = Admin + RMG only.
const LIFECYCLE_ACTION_ROLES = ["ADMIN", "RMG"];
const TERMINATION_ROLES = ["ADMIN", "RMG", "HR"];

const EMPTY_SKILL = { name: "", proficiency: 3, yearsExperience: 0 };
const EMPTY_CERTIFICATION = { name: "", issuer: "", issueDate: "" };
const EMPTY_PERFORMANCE = { rating: "", pipStatus: false, reviewDate: new Date().toISOString().slice(0, 10), notes: "" };

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<"allocate" | "reallocate" | "terminate" | "ml" | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);

  const { data: resource, isLoading } = useQuery<Resource>({
    queryKey: ["resource", id],
    queryFn: async () => (await api.get(`/resources/${id}`)).data,
    enabled: !!id,
  });

  useEffect(() => {
    if (!resource) return;
      setDraft({
        managerName: resource.managerName || "",
        designation: resource.designation || "",
        subCategory: resource.subCategory || "",
        country: resource.country || "",
        gender: resource.gender || "UNDISCLOSED",
        workLocation: resource.workLocation || resource.location,
        location: resource.location,
      dateOfJoining: resource.dateOfJoining ? resource.dateOfJoining.slice(0, 10) : "",
      priorExperienceYears: resource.priorExperienceYears ?? 0,
      costRate: resource.costRate ? Number(resource.costRate) : 0,
      skillIds: resource.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency, yearsExperience: s.yearsExperience })),
      certifications: resource.certifications.map((c) => ({ name: c.name, issuer: c.issuer, issueDate: c.issueDate ? c.issueDate.slice(0, 10) : "" })),
      performanceRecords: (resource.performanceRecords || []).map((p) => ({ rating: p.rating, pipStatus: p.pipStatus, reviewDate: p.reviewDate.slice(0, 10), notes: p.notes || "" })),
    });
  }, [resource]);

  const activeAllocations = resource?.allocations?.filter((a) => a.status === "ACTIVE") || [];
  const activeAllocation = activeAllocations[0];

  useEffect(() => {
    if (!activeAllocations.length) {
      setSelectedAllocationId(null);
      return;
    }
    setSelectedAllocationId((current) => {
      if (current && activeAllocations.some((a) => a.id === current)) return current;
      return activeAllocations[0].id;
    });
  }, [activeAllocations]);

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
  const canRequestMl = user && ["ADMIN", "RMG", "HR", "DELIVERY"].includes(user.role);
  const canEdit = user && ["ADMIN", "RMG"].includes(user.role);
  // FR-2.4: partial allocation across projects. An ALLOCATED resource can still take
  // another project while under 100% capacity; the backend's capacity check is the
  // authority on whether the new assignment fits, so it stays selectable here.
  const canAllocate = canAct && ["AVAILABLE", "BENCH_COMMITTED", "BENCH_TRUE", "ALLOCATED"].includes(resource.status);
  const canReallocate = canAct && activeAllocations.length > 0;
  const canTerminateNow = canTerminate && resource.status !== "ON_ML";

  const selectedAllocation = activeAllocations.find((a) => a.id === selectedAllocationId) || activeAllocation;

  async function saveChanges() {
    if (!resource) return;
    setSaving(true);
    setEditError(null);
    try {
      await api.patch(`/resources/${resource.id}`, {
        ...draft,
        subCategory: draft.subCategory || null,
        country: draft.country || null,
        workLocation: draft.workLocation || null,
        dateOfJoining: draft.dateOfJoining || null,
        certifications: draft.certifications,
        performanceRecords: draft.performanceRecords,
      });
      queryClient.invalidateQueries({ queryKey: ["resource", id] });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["bench"] });
      setEditMode(false);
    } catch (err: any) {
      setEditError(err.response?.data?.error || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  function updateSkill(index: number, field: string, value: string | number) {
    setDraft((prev: any) => {
      const next = [...prev.skillIds];
      next[index] = { ...next[index], [field]: field === "proficiency" || field === "yearsExperience" ? Number(value) : value };
      return { ...prev, skillIds: next };
    });
  }

  function updateCertification(index: number, field: string, value: string) {
    setDraft((prev: any) => {
      const next = [...prev.certifications];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, certifications: next };
    });
  }

  function updatePerformance(index: number, field: string, value: string | boolean) {
    setDraft((prev: any) => {
      const next = [...prev.performanceRecords];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, performanceRecords: next };
    });
  }

  function addSkill() {
    setDraft((prev: any) => ({ ...prev, skillIds: [...prev.skillIds, { ...EMPTY_SKILL }] }));
  }

  function removeSkill(index: number) {
    setDraft((prev: any) => ({ ...prev, skillIds: prev.skillIds.filter((_: unknown, i: number) => i !== index) }));
  }

  function addCertification() {
    setDraft((prev: any) => ({ ...prev, certifications: [...prev.certifications, { ...EMPTY_CERTIFICATION }] }));
  }

  function removeCertification(index: number) {
    setDraft((prev: any) => ({ ...prev, certifications: prev.certifications.filter((_: unknown, i: number) => i !== index) }));
  }

  function addPerformanceRecord() {
    setDraft((prev: any) => ({ ...prev, performanceRecords: [...prev.performanceRecords, { ...EMPTY_PERFORMANCE }] }));
  }

  function removePerformanceRecord(index: number) {
    setDraft((prev: any) => ({ ...prev, performanceRecords: prev.performanceRecords.filter((_: unknown, i: number) => i !== index) }));
  }

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
          <p className="text-sm text-slate-500 mt-1">
            Manager: {resource.managerName || "—"} &middot; Role: {resource.designation || "—"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={resource.status} />
            {resource.subCategory && <span className="badge bg-slate-100 text-slate-600">{resource.subCategory}</span>}
            {resource.willingToRelocate && <span className="badge bg-slate-100 text-slate-600">Willing to relocate</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Cost Rate</div>
          <div className="text-lg font-semibold text-slate-800">
            {resource.costRate != null ? `${resource.costRate} ${resource.currency}` : <span className="text-sm text-slate-400 font-normal">Restricted</span>}
          </div>
          <div className="text-xs text-slate-500 mt-2">FTE / Availability</div>
          <div className="text-sm text-slate-700">{resource.overallFte?.toFixed(1) ?? "1.0"} FTE &middot; {resource.availablePercentForDeployment ?? 100}% available</div>
        </div>
      </div>

      {resource.status !== "TERMINATED" && (
        <div className="flex flex-wrap gap-2">
          {canAllocate && (
            <button className="btn-primary" onClick={() => setModal("allocate")}>
              Allocate
            </button>
          )}
          {canReallocate && activeAllocations.length > 1 && (
            <select className="input min-w-[260px]" value={selectedAllocationId || ""} onChange={(e) => setSelectedAllocationId(e.target.value)}>
              {activeAllocations.map((allocation) => (
                <option key={allocation.id} value={allocation.id}>
                  {allocation.project?.name || "Project"} - {allocation.allocationPercent}%
                  {allocation.roleOnProject ? ` - ${allocation.roleOnProject}` : ""}
                </option>
              ))}
            </select>
          )}
          {canReallocate && selectedAllocation && (
            <button className="btn-primary" onClick={() => setModal("reallocate")}>
              Reallocate
            </button>
          )}
          {canReallocate && selectedAllocation && (
            <button className="btn-secondary" onClick={() => handleUnassign(selectedAllocation.id)}>
              Unassign (&rarr; Bench)
            </button>
          )}
          {canTerminateNow && (
            <button className="btn-danger" onClick={() => setModal("terminate")}>
              Terminate / Offboard
            </button>
          )}
          {canRequestMl && resource.status !== "ON_ML" && (
            <button className="btn-secondary" onClick={() => setModal("ml")}>
              Request ML Approval
            </button>
          )}
          {canEdit && (
            <button className="btn-secondary" onClick={() => setEditMode((v) => !v)}>
              {editMode ? "Cancel Edit" : "Edit Profile"}
            </button>
          )}
        </div>
      )}

      <div className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
        <div>
          <div className="text-xs text-slate-500">Country</div>
          <div className="font-medium text-slate-800">{resource.country || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Gender</div>
          <div className="font-medium text-slate-800">{resource.gender || "UNDISCLOSED"}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Work Location</div>
          <div className="font-medium text-slate-800">{resource.workLocation || resource.location}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">TAO Experience</div>
          <div className="font-medium text-slate-800">{resource.taoExperienceYears?.toFixed(1) ?? "0.0"} years</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Total YOE</div>
          <div className="font-medium text-slate-800">{resource.totalYearsExperience?.toFixed(1) ?? "0.0"} years</div>
        </div>
      </div>

      {editMode && draft && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Edit Resource Profile</h2>
            <button className="btn-primary" onClick={saveChanges} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          {editError && <div className="text-sm text-red-600">{editError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Manager</label>
              <input className="input" value={draft.managerName} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} />
            </div>
            <div>
              <label className="label">Designation</label>
              <input className="input" value={draft.designation} onChange={(e) => setDraft({ ...draft, designation: e.target.value })} />
            </div>
            <div>
              <label className="label">Sub Category</label>
              <input className="input" value={draft.subCategory} onChange={(e) => setDraft({ ...draft, subCategory: e.target.value })} />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })}>
                {["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Work Location</label>
              <input className="input" value={draft.workLocation} onChange={(e) => setDraft({ ...draft, workLocation: e.target.value })} />
            </div>
            <div>
              <label className="label">DOJ</label>
              <input className="input" type="date" value={draft.dateOfJoining} onChange={(e) => setDraft({ ...draft, dateOfJoining: e.target.value })} />
            </div>
            <div>
              <label className="label">Prior Experience</label>
              <input className="input" type="number" step="0.1" value={draft.priorExperienceYears} onChange={(e) => setDraft({ ...draft, priorExperienceYears: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Monthly Cost (USD)</label>
              <input className="input" type="number" step="0.01" value={draft.costRate} onChange={(e) => setDraft({ ...draft, costRate: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Skills</h3>
              <button type="button" className="btn-secondary" onClick={addSkill}>
                Add Skill
              </button>
            </div>
            <div className="space-y-2">
              {draft.skillIds.length === 0 && <div className="text-xs text-slate-400">No skills yet. Add one to start editing.</div>}
              {draft.skillIds.map((skill: any, index: number) => (
                <div key={`${skill.name}-${index}`} className="grid grid-cols-1 md:grid-cols-[1.5fr_0.7fr_0.9fr_auto] gap-2 items-center">
                  <input className="input" value={skill.name} onChange={(e) => updateSkill(index, "name", e.target.value)} placeholder="Skill name" />
                  <input className="input" type="number" min={1} max={5} value={skill.proficiency} onChange={(e) => updateSkill(index, "proficiency", e.target.value)} placeholder="Level" />
                  <input className="input" type="number" step="0.1" min={0} value={skill.yearsExperience} onChange={(e) => updateSkill(index, "yearsExperience", e.target.value)} placeholder="Years" />
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeSkill(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Certifications</h3>
              <button type="button" className="btn-secondary" onClick={addCertification}>
                Add Certification
              </button>
            </div>
            <div className="space-y-2">
              {draft.certifications.length === 0 && <div className="text-xs text-slate-400">No certifications yet. Add one to start editing.</div>}
              {draft.certifications.map((cert: any, index: number) => (
                <div key={`${cert.name}-${index}`} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-center">
                  <input className="input" value={cert.name} onChange={(e) => updateCertification(index, "name", e.target.value)} placeholder="Certification name" />
                  <input className="input" value={cert.issuer} onChange={(e) => updateCertification(index, "issuer", e.target.value)} placeholder="Issuer" />
                  <input className="input" type="date" value={cert.issueDate} onChange={(e) => updateCertification(index, "issueDate", e.target.value)} />
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeCertification(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">Performance</h3>
              <button type="button" className="btn-secondary" onClick={addPerformanceRecord}>
                Add Performance
              </button>
            </div>
            <div className="space-y-2">
              {draft.performanceRecords.length === 0 && <div className="text-xs text-slate-400">No performance records yet. Add one to start editing.</div>}
              {draft.performanceRecords.map((record: any, index: number) => (
                <div key={`${record.reviewDate}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_0.9fr_1.2fr_auto] gap-2 items-center">
                  <input className="input" value={record.rating} onChange={(e) => updatePerformance(index, "rating", e.target.value)} placeholder="Rating" />
                  <input className="input" type="date" value={record.reviewDate} onChange={(e) => updatePerformance(index, "reviewDate", e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={record.pipStatus} onChange={(e) => updatePerformance(index, "pipStatus", e.target.checked)} />
                    On PIP
                  </label>
                  <input className="input" value={record.notes} onChange={(e) => updatePerformance(index, "notes", e.target.value)} placeholder="Notes" />
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removePerformanceRecord(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
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
            <p className="text-xs text-slate-400 mb-3">Restricted view — visible to Admin, HR, and authorized RMG only.</p>
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
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Reporting Manager</th>
                <th className="py-2 pr-4">%</th>
                <th className="py-2 pr-4">FTE</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {resource.allocations?.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4">{a.project?.name}</td>
                  <td className="py-2 pr-4">{a.roleOnProject || "—"}</td>
                  <td className="py-2 pr-4">{a.projectReportingManagerName || "—"}</td>
                  <td className="py-2 pr-4">{a.allocationPercent}%</td>
                  <td className="py-2 pr-4">{(a.allocationPercent / 100).toFixed(2)}</td>
                  <td className="py-2 pr-4">{new Date(a.startDate).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{a.endDate ? new Date(a.endDate).toLocaleDateString() : "—"}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
              {(!resource.allocations || resource.allocations.length === 0) && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-slate-400">
                    No allocation history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "allocate" && <AllocationModal resource={resource} mode="allocate" onClose={() => setModal(null)} />}
      {modal === "reallocate" && selectedAllocation && (
        <AllocationModal
          resource={resource}
          mode="reallocate"
          currentAllocationId={selectedAllocation.id}
          sourceAllocation={selectedAllocation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "terminate" && <TerminateModal resource={resource} onClose={() => setModal(null)} />}
      {modal === "ml" && <MlModal resource={resource} onClose={() => setModal(null)} />}
    </div>
  );
}
