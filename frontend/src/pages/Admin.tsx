import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ImportBatch, ImportRecord, Portfolio } from "../types";
import ExcelImportWizard from "../components/ExcelImportWizard";
import QuarantineWorkspace from "../components/QuarantineWorkspace";

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
  const [verticalCode, setVerticalCode] = useState("");
  const [resolvedPortfolio, setResolvedPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: authorizations = [] } = useQuery<AuthorizationRow[]>({
    queryKey: ["authorizations"],
    queryFn: async () => (await api.get("/portfolios/authorizations")).data,
  });
  const { data: users = [] } = useQuery<UserRow[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });
  const { data: portfolios = [] } = useQuery<Portfolio[]>({ queryKey: ["portfolios"], queryFn: async () => (await api.get("/portfolios")).data });

  const normalizedCode = verticalCode.trim().toUpperCase();
  const matchingPortfolio = portfolios.find((portfolio) => portfolio.code.toUpperCase() === normalizedCode) ?? null;

  async function resolvePortfolioCode() {
    setError(null);
    setResolvedPortfolio(null);
    try {
      const { data } = await api.get("/portfolios/resolve-code", { params: { code: normalizedCode } });
      setResolvedPortfolio(data);
    } catch (err: any) {
      setError(err.response?.data?.error || "No portfolio matches this code.");
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
        <div><h2 className="text-sm font-semibold text-slate-800">Manage verticals</h2><p className="text-xs text-slate-500">Validate a code against existing portfolios and confirm its resolved vertical name. Add new verticals through the existing setup process.</p></div>
        <div className="flex flex-wrap items-end gap-3"><label className="label">Portfolio / vertical code<input className="input" value={verticalCode} onChange={(e) => { setVerticalCode(e.target.value.toUpperCase()); setResolvedPortfolio(null); }} placeholder="e.g. FIN" /></label><button className="btn-primary" onClick={resolvePortfolioCode} disabled={!normalizedCode}>Resolve code</button></div>
        {matchingPortfolio && <p className="text-xs text-slate-500">Matching existing vertical: {matchingPortfolio.name} ({matchingPortfolio.code}).</p>}
        {resolvedPortfolio && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Code confirmed: <strong>{resolvedPortfolio.name}</strong> · {resolvedPortfolio.code}</div>}
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
  const [csvKey, setCsvKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const { data: batches = [] } = useQuery<ImportBatch[]>({ queryKey: ["import-batches"], queryFn: async () => (await api.get("/imports")).data });

  async function uploadCsv() {
    const { data } = await api.post("/imports/upload", { csvText, idempotencyKey: csvKey });
    setMessage(`Batch ${data.id}: created ${data.createdCount}, updated ${data.updatedCount}, quarantined ${data.quarantinedCount}, failed ${data.totals?.FAILED ?? 0}, pending ${data.totals?.PENDING ?? 0}.${data.notificationPending ? " Notification delivery pending; retry unchanged input." : ""}`);
    if (!data.notificationPending && !data.totals?.PENDING && !data.totals?.FAILED) { setCsvText(""); setCsvKey(crypto.randomUUID()); }
    queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    queryClient.invalidateQueries({ queryKey: ["quarantine"] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
  }


  return (
    <div className="space-y-6">
      <ExcelImportWizard onImported={(text) => {
        setMessage(text);
        queryClient.invalidateQueries({ queryKey: ["quarantine"] });
        queryClient.invalidateQueries({ queryKey: ["import-batches"] });
        queryClient.invalidateQueries({ queryKey: ["resources"] });
      }} />

      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Bulk Add Records</h2>
        <textarea
          className="input font-mono text-xs"
          rows={4}
          placeholder="employeeId,name,gender,country,workLocation,location,costRate,currency,portfolioCode,managerName,designation,subCategory,dateOfJoining,totalYoe,taoExperience,skills,certifications"
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setCsvKey(crypto.randomUUID()); }}
        />
        <button className="btn-secondary" onClick={uploadCsv} disabled={!csvText.trim()}>
          Add Records
        </button>
      </div>

      {message && <div className="text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-md p-3">{message}</div>}

      <div className="card overflow-x-auto">
        <h2 id="import-history" tabIndex={-1} className="text-sm font-semibold text-slate-700 p-4 pb-0">Recent Batches</h2>
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
                <td className="py-2 px-4">{b.source}<div className="text-xs text-slate-500">{b.id} · {b.status}</div></td>
                <td className="py-2 px-4">{b.createdCount}</td>
                <td className="py-2 px-4">{b.updatedCount}</td>
                <td className="py-2 px-4">{b.quarantinedCount}</td>
                <td className="py-2 px-4">{new Date(b.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <QuarantineWorkspace />
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

  const [tab, setTab] = useState<Tab>(new URLSearchParams(window.location.search).get("tab") === "imports" ? "imports" : visibleTabs[0]?.key ?? "imports");

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
