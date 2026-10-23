import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ImportBatch, ImportRecord, Portfolio } from "../types";

type Tab = "authorizations" | "users" | "imports" | "audit";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
}

interface AuthorizationRow {
  id: string;
  userId: string;
  portfolioId: string;
  grantedAt: string;
  user: { id: string; name: string; email: string; role: string };
  portfolio: Portfolio;
}

function AuthorizationsTab() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [verticalName, setVerticalName] = useState("");
  const [verticalCode, setVerticalCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: authorizations = [] } = useQuery<AuthorizationRow[]>({
    queryKey: ["authorizations"],
    queryFn: async () => (await api.get("/portfolios/authorizations")).data,
  });
  const { data: users = [] } = useQuery<UserRow[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });
  const { data: portfolios = [] } = useQuery<Portfolio[]>({ queryKey: ["portfolios"], queryFn: async () => (await api.get("/portfolios")).data });

  async function createVertical() {
    setError(null);
    try {
      await api.post("/portfolios", { name: verticalName.trim(), code: verticalCode.trim() });
      setVerticalName("");
      setVerticalCode("");
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["authorizations"] });
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create vertical");
    }
  }

  async function grant() {
    setError(null);
    try {
      await api.post("/portfolios/authorizations", { userId, portfolioId });
      queryClient.invalidateQueries({ queryKey: ["authorizations"] });
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to grant authorization");
    }
  }

  async function revoke(id: string) {
    await api.delete(`/portfolios/authorizations/${id}`);
    queryClient.invalidateQueries({ queryKey: ["authorizations"] });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div><h2 className="text-sm font-semibold text-slate-800">Manage verticals</h2><p className="text-xs text-slate-500">Add a vertical when the organization introduces a new business area.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="label">Vertical name<input className="input" value={verticalName} onChange={(e) => setVerticalName(e.target.value)} placeholder="e.g. Energy" /></label><label className="label">Vertical code<input className="input" value={verticalCode} onChange={(e) => setVerticalCode(e.target.value.toUpperCase())} placeholder="e.g. ENGY" /></label><button className="btn-primary" onClick={createVertical} disabled={!verticalName.trim() || !verticalCode.trim()}>Add vertical</button></div>
        <div className="flex flex-wrap gap-2">{portfolios.map((portfolio) => <span key={portfolio.id} className="badge border border-slate-200 bg-slate-50 text-slate-700">{portfolio.name} · {portfolio.code}</span>)}</div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">User</label>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Portfolio</label>
          <select className="input" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
            <option value="">Select portfolio...</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={grant} disabled={!userId || !portfolioId}>
          Grant Authorization
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">User</th>
              <th className="py-2 px-4">Role</th>
              <th className="py-2 px-4">Portfolio</th>
              <th className="py-2 px-4">Granted</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {authorizations.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4">{a.user.name}</td>
                <td className="py-2 px-4">{a.user.role}</td>
                <td className="py-2 px-4">{a.portfolio.name}</td>
                <td className="py-2 px-4">{new Date(a.grantedAt).toLocaleDateString()}</td>
                <td className="py-2 px-4">
                  <button className="text-xs text-red-600 hover:underline" onClick={() => revoke(a.id)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersTab() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "ADMIN";
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery<UserRow[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "DELIVERY" });
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function createUser() {
    setError(null);
    try {
      await api.post("/users", form);
      setForm({ name: "", email: "", password: "", role: "DELIVERY" });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create user");
    }
  }

  async function toggleActive(u: UserRow) {
    setRowError(null);
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      setRowError(err.response?.data?.error || "Failed to update user");
    }
  }

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="text-sm text-slate-500 bg-slate-100 border border-slate-200 rounded-md p-3">
          Read-only: creating users and changing role/active status is restricted to Administrators.
        </div>
      )}

      {isAdmin && (
        <div className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {["ADMIN", "RMG", "DELIVERY", "HR", "TA", "VIEWER"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={createUser}>
            Create User
          </button>
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {rowError && <div className="text-sm text-red-600">{rowError}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Email</th>
              <th className="py-2 px-4">Role</th>
              <th className="py-2 px-4">Active</th>
              {isAdmin && <th className="py-2 px-4"></th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4">{u.name}</td>
                <td className="py-2 px-4">{u.email}</td>
                <td className="py-2 px-4">{u.role}</td>
                <td className="py-2 px-4">{u.active ? "Yes" : "No"}</td>
                {isAdmin && (
                  <td className="py-2 px-4">
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => toggleActive(u)}>
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportsTab() {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [workbookBase64, setWorkbookBase64] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [acceptedRows, setAcceptedRows] = useState<number[]>([]);
  const [editedRows, setEditedRows] = useState<Record<number, Record<string, string>>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: batches = [] } = useQuery<ImportBatch[]>({ queryKey: ["import-batches"], queryFn: async () => (await api.get("/imports")).data });
  const { data: quarantined = [] } = useQuery<ImportRecord[]>({
    queryKey: ["quarantine"],
    queryFn: async () => (await api.get("/imports/quarantine/list")).data,
  });

  async function runImport() {
    const { data } = await api.post("/imports/run");
    setMessage(`Import complete: created ${data.createdCount}, updated ${data.updatedCount}, quarantined ${data.quarantinedCount}.`);
    queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    queryClient.invalidateQueries({ queryKey: ["quarantine"] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
  }

  async function uploadCsv() {
    const { data } = await api.post("/imports/upload", { csvText });
    setMessage(`Upload complete: created ${data.createdCount}, updated ${data.updatedCount}, quarantined ${data.quarantinedCount}.`);
    setCsvText("");
    queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    queryClient.invalidateQueries({ queryKey: ["quarantine"] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
  }

  async function discard(recordId: string) {
    await api.post(`/imports/quarantine/${recordId}/discard`);
    queryClient.invalidateQueries({ queryKey: ["quarantine"] });
  }

  return (
    <div className="space-y-6">
      <div className="card p-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Daily HRMIS / Manual Sheet Import</h2>
          <p className="text-xs text-slate-400">
            Runs automatically every day at 02:00. Trigger manually here to demo without waiting (FR-1.4).
          </p>
        </div>
        <button className="btn-primary" onClick={runImport}>
          Run Import Now
        </button>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Excel resource import wizard</h2>
        <p className="text-xs text-slate-500">Choose any worksheet, map every resource field, and review changes before importing. Preview does not write data.</p>
        <input id="excel-workbook" className="hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async (event) => {
          const file = event.target.files?.[0];
          setWorkbookBase64(""); setPreview(null); setHeaders([]); setMapping({}); setEditedRows({}); setAcceptedRows([]); setWizardOpen(false); setMessage(null);
          if (!file) return;
          if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 10 * 1024 * 1024) { setMessage("Select an .xlsx workbook no larger than 10 MB."); event.target.value = ""; return; }
          try {
            setLoading(true);
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            const encoded = btoa(binary);
            const { data } = await api.post("/imports/excel-preview", { workbookBase64: encoded });
            setWorkbookBase64(encoded); setHeaders(data.headers); setMapping(data.mapping); setSheetNames(data.sheetNames || []); setSheetName(data.sheetName || data.sheetNames?.[0] || ""); setWizardOpen(true);
          } catch (error: any) { setMessage(error.response?.data?.error || "Could not read workbook."); }
          finally { setLoading(false); }
        }} />
        <button className="btn-secondary" onClick={() => document.getElementById("excel-workbook")?.click()} disabled={loading}>{loading ? "Reading workbook…" : "Select XLSX workbook"}</button>
        <p className="text-xs text-slate-600">Map all available fields, including cost, portfolio, skills and certifications. Blank cells leave existing values unchanged; employee ID, name and email are required to create a resource. Portfolio code must match an existing portfolio.</p>
        {wizardOpen && <div role="dialog" aria-modal="true" aria-label="Map Excel columns" className="fixed inset-0 z-50 overflow-auto bg-black/40 p-4">
          <div className="mx-auto mt-8 max-w-5xl space-y-5 rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold">Set up your import</h3><p className="text-sm text-slate-500">Select the worksheet, then map each resource field to a workbook column. Unused columns are safe to leave unmapped.</p></div><button className="btn-secondary" onClick={() => setWizardOpen(false)}>Close</button></div>
            <label className="block text-sm font-medium">Worksheet<select className="input mt-1" value={sheetName} onChange={(e) => setSheetName(e.target.value)}>{sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">Map every field you want to import. Employee ID identifies rows; new resources require Name, Email, Location, Cost rate and a valid Portfolio code. Blank cells leave existing values unchanged.</p>
            <div className="grid gap-3 md:grid-cols-3">{[["employeeId", "Employee ID"], ["name", "Name"], ["email", "Email"], ["gender", "Gender"], ["country", "Country"], ["workLocation", "Work location"], ["location", "Location"], ["willingToRelocate", "Willing to relocate"], ["costRate", "Cost rate"], ["currency", "Currency"], ["portfolioCode", "Portfolio code"], ["managerName", "Manager"], ["designation", "Designation"], ["subCategory", "Subcategory"], ["dateOfJoining", "Date of joining"], ["priorExperienceYears", "Prior experience (years)"], ["totalYoe", "Total experience (years)"], ["taoExperience", "TAO experience (years)"], ["skills", "Skills"], ["certifications", "Certifications"]].map(([field, label]) => <label key={field} className="text-sm font-medium">{label}<select className="input mt-1" value={mapping[field] || ""} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}><option value="">Not provided</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={header}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div>
            <button className="btn-primary" disabled={loading || !mapping.employeeId || !mapping.name || Object.values(mapping).filter(Boolean).length !== new Set(Object.values(mapping).filter(Boolean)).size} onClick={async () => {
              try { setLoading(true); setMessage(null); const { data } = await api.post("/imports/excel-preview", { workbookBase64, mapping, sheetName }); setPreview(data); setEditedRows({}); setAcceptedRows(data.rows.filter((row: any) => ["NEW", "CHANGED"].includes(row.status)).map((row: any) => row.rowNumber)); setWizardOpen(false); }
              catch (error: any) { setMessage(error.response?.data?.error || "Preview failed."); }
              finally { setLoading(false); }
            }}>{loading ? "Reconciling…" : "Review rows"}</button>
          </div>
        </div>}
        {preview && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Review import · {preview.sheetName}</h3><p className="text-sm text-slate-500">Select rows to import. Select “Edit fields” to correct values before importing.</p><p className="mt-1 text-xs text-slate-500">{preview.rows.filter((row: any) => row.status === "NEW").length} new · {preview.rows.filter((row: any) => row.status === "CHANGED").length} changed · {preview.rows.filter((row: any) => row.status === "UNCHANGED").length} unchanged · {preview.rows.filter((row: any) => ["BLOCKED", "DUPLICATE"].includes(row.status)).length} need attention</p></div><button className="btn-primary" disabled={loading || !acceptedRows.length} onClick={async () => { try { setLoading(true); const { data } = await api.post("/imports/excel-commit", { workbookBase64, sheetName, mapping: preview.mapping, acceptedRowNumbers: acceptedRows, editedRows }); setMessage(`Workbook imported: ${data.createdCount} created, ${data.updatedCount} updated.`); setPreview(null); setAcceptedRows([]); queryClient.invalidateQueries({ queryKey: ["import-batches"] }); queryClient.invalidateQueries({ queryKey: ["resources"] }); } catch (error: any) { setMessage(error.response?.data?.error || "Import failed."); } finally { setLoading(false); } }}>{loading ? "Importing…" : `Import selected (${acceptedRows.length})`}</button></div><div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm"><span><strong>{acceptedRows.length}</strong> selected</span><button className="text-brand-700 hover:underline" onClick={() => setAcceptedRows(preview.rows.filter((row: any) => ["NEW", "CHANGED"].includes(row.status)).map((row: any) => row.rowNumber))}>Select new and changed</button><button className="text-slate-600 hover:underline" onClick={() => setAcceptedRows([])}>Clear selection</button></div><div className="max-h-[36rem] space-y-3 overflow-auto">{preview.rows.map((row: any) => { const selectable = ["NEW", "CHANGED", "UNCHANGED"].includes(row.status); const statusLabel: Record<string, string> = { NEW: "New resource", CHANGED: "Changes found", UNCHANGED: "No changes", DUPLICATE: "Duplicate ID", BLOCKED: "Needs attention" }; const selected = acceptedRows.includes(row.rowNumber); const rowValues = { ...row.values, ...(editedRows[row.rowNumber] || {}) }; const invalid = rowValues.email && !/^\\S+@\\S+\\.\\S+$/.test(rowValues.email); const hasEdits = Object.values(editedRows[row.rowNumber] || {}).some((value) => value.trim() !== ""); return <article key={row.rowNumber} className={`rounded-xl border p-4 ${selected ? "border-brand-300 bg-brand-50/30" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3">{selectable && <input aria-label={`Import row ${row.rowNumber}`} type="checkbox" checked={selected} onChange={() => setAcceptedRows(selected ? acceptedRows.filter((number) => number !== row.rowNumber) : [...acceptedRows, row.rowNumber])} className="mt-1 h-4 w-4" />}<div><div className="font-semibold">{row.values?.name || "Unnamed resource"}</div><div className="text-sm text-slate-500">ID {rowValues.employeeId || "missing"} · Worksheet row {row.rowNumber}</div></div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{hasEdits ? "Edited · recheck on import" : statusLabel[row.status] || row.status}</span></div><details className="mt-3" open={row.status === "CHANGED" || row.status === "NEW"}><summary className="cursor-pointer text-sm font-medium text-brand-700">Edit fields</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(preview.mapping).filter(([field]) => field !== "employeeId").map(([field, header]) => { const original = row.values?.[field] ?? ""; const value = editedRows[row.rowNumber]?.[field] ?? original; const change = row.changes?.find((item: any) => item.field === field); return <label key={field} className="text-xs font-medium text-slate-600"><span className="mb-1 block">{field}{change && <span className="ml-2 text-amber-700">Current: {change.current ?? "—"}</span>}</span><input className="input text-sm" value={value} placeholder={`${header} · blank keeps existing`} onChange={(event) => setEditedRows({ ...editedRows, [row.rowNumber]: { ...editedRows[row.rowNumber], [field]: event.target.value } })} />{change && <span className="mt-1 block text-xs text-slate-500">Workbook: {change.proposed}</span>}</label>; })}</div></details>{row.notes?.map((note: string) => <div key={note} className="mt-2 text-sm text-amber-700">{note}</div>)}{row.errors?.map((error: string) => <div key={error} className="mt-2 text-sm text-red-700">{error}</div>)}</article>; })}</div>{preview.warnings.map((warning: string) => <div key={warning} className="text-sm text-slate-500">{warning}</div>)}</div>}
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Ad-hoc CSV Upload</h2>
        <textarea
          className="input font-mono text-xs"
          rows={4}
          placeholder="employeeId,name,email,gender,country,workLocation,location,costRate,currency,portfolioCode,managerName,designation,subCategory,dateOfJoining,totalYoe,taoExperience,skills,certifications,action"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button className="btn-secondary" onClick={uploadCsv} disabled={!csvText.trim()}>
          Upload & Import
        </button>
      </div>

      {message && <div className="text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-md p-3">{message}</div>}

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 p-4 pb-0">Recent Batches</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Source</th>
              <th className="py-2 px-4">Created</th>
              <th className="py-2 px-4">Updated</th>
              <th className="py-2 px-4">Quarantined</th>
              <th className="py-2 px-4">Started</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4">{b.source}</td>
                <td className="py-2 px-4">{b.createdCount}</td>
                <td className="py-2 px-4">{b.updatedCount}</td>
                <td className="py-2 px-4">{b.quarantinedCount}</td>
                <td className="py-2 px-4">{new Date(b.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-slate-700 p-4 pb-0">Quarantined Records (FR-1.5)</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Employee ID</th>
              <th className="py-2 px-4">Errors</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {quarantined.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 px-4">{r.employeeId}</td>
                <td className="py-2 px-4 text-red-600">{(r.errors || []).join("; ")}</td>
                <td className="py-2 px-4">
                  <button className="text-xs text-red-600 hover:underline" onClick={() => discard(r.id)}>
                    Discard
                  </button>
                </td>
              </tr>
            ))}
            {quarantined.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  No quarantined records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab() {
  const { data: logs = [] } = useQuery<any[]>({ queryKey: ["audit"], queryFn: async () => (await api.get("/audit")).data });
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
            <th className="py-2 px-4">When</th>
            <th className="py-2 px-4">Actor</th>
            <th className="py-2 px-4">Action</th>
            <th className="py-2 px-4">Entity</th>
            <th className="py-2 px-4">Success</th>
            <th className="py-2 px-4">Message</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2 px-4 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="py-2 px-4">{l.actor?.name || "system"}</td>
              <td className="py-2 px-4">{l.action}</td>
              <td className="py-2 px-4">
                {l.entityType} {l.entityId ? `#${l.entityId.slice(0, 8)}` : ""}
              </td>
              <td className="py-2 px-4">{l.success ? "✓" : "✗"}</td>
              <td className="py-2 px-4 text-slate-500">{l.message || l.reason || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();

  const tabs: { key: Tab; label: string; roles: string[] }[] = [
    { key: "authorizations", label: "Verticals & Authorizations", roles: ["ADMIN"] },
    { key: "users", label: "Users", roles: ["ADMIN", "RMG"] },
    { key: "imports", label: "Import & Quarantine", roles: ["ADMIN", "RMG", "HR"] },
    { key: "audit", label: "Audit Log", roles: ["ADMIN", "RMG", "HR"] },
  ];
  const visibleTabs = tabs.filter((t) => user && t.roles.includes(user.role));

  const [tab, setTab] = useState<Tab>(visibleTabs[0]?.key ?? "imports");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Administration</h1>
        <p className="text-sm text-slate-500">Portfolio authorization, user management, import review, and audit trail.</p>
      </div>

      <div className="flex gap-2">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className={`badge border ${tab === t.key ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "authorizations" && <AuthorizationsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "imports" && <ImportsTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}
