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
  const [error, setError] = useState<string | null>(null);

  const { data: authorizations = [] } = useQuery<AuthorizationRow[]>({
    queryKey: ["authorizations"],
    queryFn: async () => (await api.get("/portfolios/authorizations")).data,
  });
  const { data: users = [] } = useQuery<UserRow[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });
  const { data: portfolios = [] } = useQuery<Portfolio[]>({ queryKey: ["portfolios"], queryFn: async () => (await api.get("/portfolios")).data });

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
        <h2 className="text-sm font-semibold text-slate-700">Ad-hoc CSV Upload</h2>
        <textarea
          className="input font-mono text-xs"
          rows={4}
          placeholder="employeeId,name,email,location,willingToRelocate,costRate,currency,portfolioCode,skills,certifications,action"
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
    { key: "authorizations", label: "Portfolio Authorizations", roles: ["ADMIN"] },
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
