import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DemandRequest, Portfolio } from "../types";

const STAGES = ["DRAFT", "PIPELINE", "COMMITTED", "FULFILLED", "CANCELLED"];

function documentErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? error.message;
  }
  return error instanceof Error ? error.message : "Unable to process the demand document.";
}

export default function Demand() {
  const { user, portfolios } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    portfolioId: portfolios[0]?.id ?? "",
    projectName: "",
    projectCode: "",
    clientName: "",
    roleName: "",
    location: "",
    requiredSkills: "",
    minProficiency: "",
    minExperienceYears: "",
    requiredCertifications: "",
    requiredFte: "1",
    startDate: "",
    endDate: "",
    status: "DRAFT",
    confidenceStage: "DRAFT",
    notes: "",
  });
  const [csvText, setCsvText] = useState("portfolioId,projectName,projectCode,clientName,roleName,location,requiredSkills,minProficiency,minExperienceYears,requiredCertifications,requiredFte,startDate,endDate,status,confidenceStage,notes\n");

  const canManageDemand = !!user && ["ADMIN", "RMG"].includes(user.role);

  const { data: demand = [], isLoading } = useQuery<DemandRequest[]>({
    queryKey: ["demand"],
    queryFn: async () => (await api.get("/demand")).data,
    enabled: canManageDemand,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        requiredSkills: form.requiredSkills.split(",").map((v) => v.trim()).filter(Boolean),
        requiredCertifications: form.requiredCertifications.split(",").map((v) => v.trim()).filter(Boolean),
        minProficiency: form.minProficiency ? Number(form.minProficiency) : null,
        minExperienceYears: form.minExperienceYears ? Number(form.minExperienceYears) : null,
        requiredFte: Number(form.requiredFte || 1),
      };
      return api.post("/demand", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demand"] });
      setForm({ ...form, projectName: "", projectCode: "", clientName: "", roleName: "", location: "", requiredSkills: "", minProficiency: "", minExperienceYears: "", requiredCertifications: "", requiredFte: "1", startDate: "", endDate: "", status: "DRAFT", confidenceStage: "DRAFT", notes: "" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => api.post("/demand/import", { csvText }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["demand"] }),
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ demandId, file }: { demandId: string; file: File }) =>
      api.put(`/demand/${demandId}/document`, file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["demand"] }),
  });

  const downloadDocumentMutation = useMutation({
    mutationFn: async ({ demandId, fileName }: { demandId: string; fileName: string }) => {
      const response = await api.get<Blob>(`/demand/${demandId}/document`, { responseType: "blob" });
      return { blob: response.data, fileName };
    },
    onSuccess: ({ blob, fileName }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  const demandByPortfolio = useMemo(() => {
    const map = new Map<string, Portfolio>();
    for (const item of portfolios) map.set(item.id, item);
    return map;
  }, [portfolios]);

  if (!canManageDemand) {
    return <div className="text-sm text-slate-500">Only Admin and RMG can manage demand.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Demand Management</h1>
        <p className="text-sm text-slate-500">Track pipeline, committed, and fulfilled staffing demand by role and portfolio.</p>
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Create demand</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="label">Portfolio
            <select className="input" value={form.portfolioId} onChange={(e) => setForm({ ...form, portfolioId: e.target.value })}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="label">Project name
            <input className="input" value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} />
          </label>
          <label className="label">Project code
            <input className="input" value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} />
          </label>
          <label className="label">Client
            <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </label>
          <label className="label">Role name
            <input className="input" value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })} />
          </label>
          <label className="label">Location
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="label">Required skills (comma-separated)
            <input className="input" value={form.requiredSkills} onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })} />
          </label>
          <label className="label">Min proficiency
            <input className="input" type="number" min="1" max="5" value={form.minProficiency} onChange={(e) => setForm({ ...form, minProficiency: e.target.value })} />
          </label>
          <label className="label">Min experience (years)
            <input className="input" type="number" min="0" step="0.5" value={form.minExperienceYears} onChange={(e) => setForm({ ...form, minExperienceYears: e.target.value })} />
          </label>
          <label className="label">Required certs
            <input className="input" value={form.requiredCertifications} onChange={(e) => setForm({ ...form, requiredCertifications: e.target.value })} />
          </label>
          <label className="label">Required FTE
            <input className="input" type="number" min="0.1" step="0.1" value={form.requiredFte} onChange={(e) => setForm({ ...form, requiredFte: e.target.value })} />
          </label>
          <label className="label">Start date
            <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label className="label">End date
            <input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
          <label className="label">Status
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="label">Confidence
            <select className="input" value={form.confidenceStage} onChange={(e) => setForm({ ...form, confidenceStage: e.target.value })}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="label md:col-span-3">Notes
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
        <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.projectName || !form.roleName || !form.startDate}>
          {createMutation.isPending ? "Saving..." : "Create demand"}
        </button>
      </div>

      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">CSV import</h2>
        <textarea className="input min-h-[150px] font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
        <button className="btn-secondary" onClick={() => importMutation.mutate()} disabled={importMutation.isPending || !csvText.trim()}>
          {importMutation.isPending ? "Importing..." : "Import CSV"}
        </button>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Demand list</h2>
        {(uploadDocumentMutation.isError || downloadDocumentMutation.isError) && (
          <p className="mt-2 text-sm text-red-600">
            {documentErrorMessage(uploadDocumentMutation.error ?? downloadDocumentMutation.error)}
          </p>
        )}
        {isLoading ? <p className="text-sm text-slate-500">Loading demand...</p> : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Portfolio</th>
                  <th className="py-2 pr-3">FTE</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Dates</th>
                  <th className="py-2 pr-3">Document</th>
                </tr>
              </thead>
              <tbody>
                {demand.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">{item.projectName}</td>
                    <td className="py-2 pr-3">{item.roleName}</td>
                    <td className="py-2 pr-3">{demandByPortfolio.get(item.portfolioId)?.name ?? item.portfolioId}</td>
                    <td className="py-2 pr-3">{item.requiredFte}</td>
                    <td className="py-2 pr-3"><span className="badge bg-slate-100 text-slate-700">{item.status}</span></td>
                    <td className="py-2 pr-3">{new Date(item.startDate).toLocaleDateString()} - {item.endDate ? new Date(item.endDate).toLocaleDateString() : "Open"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex min-w-56 flex-col items-start gap-2">
                        {item.document ? (
                          <button
                            className="text-left text-blue-700 underline"
                            onClick={() => downloadDocumentMutation.mutate({ demandId: item.id, fileName: item.document!.fileName })}
                            disabled={downloadDocumentMutation.isPending}
                          >
                            Download {item.document.fileName}
                          </button>
                        ) : <span className="text-slate-500">No document</span>}
                        <label className="text-xs text-slate-600">
                          {uploadDocumentMutation.isPending ? "Uploading..." : item.document ? "Replace document" : "Upload PDF/DOCX (max 10 MB)"}
                          <input
                            className="mt-1 block max-w-56 text-xs"
                            type="file"
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            disabled={uploadDocumentMutation.isPending}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              if (file) uploadDocumentMutation.mutate({ demandId: item.id, file });
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!demand.length && <p className="text-sm text-slate-500 mt-3">No demand records yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
