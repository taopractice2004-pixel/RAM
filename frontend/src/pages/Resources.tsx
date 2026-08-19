import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Portfolio, Resource } from "../types";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

const STATUS_OPTIONS = ["AVAILABLE", "ALLOCATED", "BENCH_COMMITTED", "BENCH_TRUE", "ON_ML", "TERMINATED"];
// Section 5.3: Delivery/TA/Viewer never see cost data, so a cost filter would be a blind oracle for them.
const COST_VISIBLE_ROLES = ["ADMIN", "RMG", "HR"];

export default function Resources() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canViewCost = !!user && COST_VISIBLE_ROLES.includes(user.role);
  const [q, setQ] = useState("");
  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [manager, setManager] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ["portfolios"],
    queryFn: async () => (await api.get("/portfolios")).data,
  });

  const { data, isLoading } = useQuery<{ total: number; resources: Resource[] }>({
    queryKey: ["resources", q, skills, location, manager, maxCost, portfolioId, statuses],
    queryFn: async () =>
      (
        await api.get("/resources", {
          params: {
            q: [q, manager].filter(Boolean).join(" ") || undefined,
            skills: skills || undefined,
            location: location || undefined,
            maxCost: maxCost || undefined,
            portfolioId: portfolioId || undefined,
            status: statuses.length ? statuses.join(",") : undefined,
            pageSize: 50,
          },
        })
      ).data,
  });

  function toggleStatus(s: string) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Resource Repository</h1>
        <p className="text-sm text-slate-500">Search and filter by skill, experience, cost, location, and availability.</p>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="label">Search (name/email/ID)</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alicia Chen" />
        </div>
        <div>
          <label className="label">Skills (comma-separated)</label>
          <input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React,AWS" />
        </div>
        <div>
          <label className="label">Location</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote" />
        </div>
        <div>
          <label className="label">Manager</label>
          <input className="input" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Venkat" />
        </div>
        {canViewCost && (
          <div>
            <label className="label">Max Cost Rate</label>
            <input className="input" type="number" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} placeholder="150" />
          </div>
        )}
        <div>
          <label className="label">Portfolio</label>
          <select className="input" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
            <option value="">All authorized</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-5 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`badge border ${
                statuses.includes(s) ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Employee ID</th>
              <th className="py-2 px-4">Portfolio</th>
              <th className="py-2 px-4">Manager</th>
              <th className="py-2 px-4">Designation</th>
              <th className="py-2 px-4">Gender</th>
              <th className="py-2 px-4">Country</th>
              <th className="py-2 px-4">Location</th>
              <th className="py-2 px-4">Sub Category</th>
              <th className="py-2 px-4">TAO Exp</th>
              <th className="py-2 px-4">Total YOE</th>
              <th className="py-2 px-4">Avail %</th>
              <th className="py-2 px-4">FTE</th>
              <th className="py-2 px-4">Skills</th>
              {canViewCost && <th className="py-2 px-4">Cost Rate</th>}
              <th className="py-2 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={canViewCost ? 15 : 14} className="py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {data?.resources.map((r) => (
              <tr
                key={r.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                onClick={() => navigate(`/resources/${r.id}`)}
              >
                <td className="py-2 px-4 font-medium text-slate-800">{r.name}</td>
                <td className="py-2 px-4 text-slate-500">{r.employeeId}</td>
                <td className="py-2 px-4">{r.portfolio?.name}</td>
                <td className="py-2 px-4">{r.managerName || "—"}</td>
                <td className="py-2 px-4">{r.designation || "—"}</td>
                <td className="py-2 px-4">{r.gender || "UNDISCLOSED"}</td>
                <td className="py-2 px-4">{r.country || "—"}</td>
                <td className="py-2 px-4">{r.workLocation || r.location}</td>
                <td className="py-2 px-4">{r.subCategory || "—"}</td>
                <td className="py-2 px-4">{r.taoExperienceYears?.toFixed(1) ?? "0.0"}</td>
                <td className="py-2 px-4">{r.totalYearsExperience?.toFixed(1) ?? "0.0"}</td>
                <td className="py-2 px-4">{r.availablePercentForDeployment ?? 100}%</td>
                <td className="py-2 px-4">{r.overallFte?.toFixed(1) ?? "1.0"}</td>
                <td className="py-2 px-4">
                  <div className="flex flex-wrap gap-1">
                    {r.skills.slice(0, 3).map((s) => (
                      <span key={s.id} className="badge bg-slate-100 text-slate-600">
                        {s.skill.name}
                      </span>
                    ))}
                    {r.skills.length > 3 && <span className="text-xs text-slate-400">+{r.skills.length - 3}</span>}
                  </div>
                </td>
                {canViewCost && (
                  <td className="py-2 px-4">{r.costRate != null ? `${r.costRate} ${r.currency}` : <span className="text-slate-400">Restricted</span>}</td>
                )}
                <td className="py-2 px-4">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {!isLoading && data?.resources.length === 0 && (
              <tr>
                <td colSpan={canViewCost ? 15 : 14} className="py-6 text-center text-slate-400">
                  No resources match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <div className="text-xs text-slate-400">{data.total} total resources in scope.</div>}
    </div>
  );
}
