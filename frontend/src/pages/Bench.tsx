import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Resource } from "../types";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";

export default function Bench() {
  const [classification, setClassification] = useState<string>("");
  const [status, setStatus] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [manager, setManager] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [skill, setSkill] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const { user } = useAuth();
  const canViewCost = user?.role === "ADMIN" || user?.role === "HR" || user?.role === "RMG";

  const { data: portfolios = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["portfolios"],
    queryFn: async () => (await api.get("/portfolios")).data,
  });
  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["bench", classification, status, subCategory, manager, portfolio, location, country, skill, minAge, maxAge],
    queryFn: async () => (await api.get("/bench", { params: {
      classification: classification || undefined,
      status: status || undefined,
      subCategory: subCategory || undefined,
      managerName: manager || undefined,
      portfolioId: portfolio || undefined,
      location: location || undefined,
      country: country || undefined,
      skill: skill || undefined,
    } })).data,
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Bench Management</h1>
        <p className="text-sm text-slate-500">
          Committed Bench (future assignment already scheduled) vs. True Bench (nothing scheduled). Aging past the
          configured threshold is flagged for RMG/TA follow-up.
        </p>
      </div>

      <div className="flex gap-2">
        {["", "BENCH_COMMITTED", "BENCH_TRUE"].map((c) => (
          <button
            key={c}
            className={`badge border ${classification === c ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"}`}
            onClick={() => setClassification(c)}
          >
            {c === "" ? "All Bench" : c.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="card p-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div><label className="label">Skill</label><input className="input" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill name" /></div>
        <div><label className="label">Country</label><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" /></div>
        <div><label className="label">Lifecycle status</label><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{["BENCH_COMMITTED", "BENCH_TRUE", "AVAILABLE", "ALLOCATED", "ON_ML"].map((value) => <option key={value} value={value}>{{ BENCH_COMMITTED: "Committed Bench", BENCH_TRUE: "True Bench", AVAILABLE: "Available", ALLOCATED: "Allocated", ON_ML: "On maternity leave" }[value]}</option>)}</select></div>
        <div><label className="label">Subcategory</label><input className="input" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="Corporate Bench" /></div>
        <div><label className="label">Manager</label><input className="input" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Manager" /></div>
        <div><label className="label">Portfolio / Vertical</label><select className="input" value={portfolio} onChange={(e) => setPortfolio(e.target.value)}><option value="">All authorized</option>{portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div><label className="label">Location</label><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2 px-4">Emp Id</th>
              <th className="py-2 px-4">EMP Name</th>
              <th className="py-2 px-4">Skillset</th>
              <th className="py-2 px-4">YOE</th>
              <th className="py-2 px-4">Allocation / Bench Status</th>
              <th className="py-2 px-4">Bench Subcategory</th>
              <th className="py-2 px-4">Ageing</th>
              <th className="py-2 px-4">Vertical</th>
              <th className="py-2 px-4">Manager</th>
              <th className="py-2 px-4">Projected Billability</th>
              <th className="py-2 px-4">DOJ</th>
              <th className="py-2 px-4">TAO Experience</th>
              <th className="py-2 px-4">Role</th>
              <th className="py-2 px-4">Country</th>
              <th className="py-2 px-4">Work Location</th>
              <th className="py-2 px-4">Bench start date</th>
              {canViewCost && <th className="py-2 px-4">Monthly Direct Cost from Delivery MIS</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={canViewCost ? 17 : 16} className="py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {resources.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-2 px-4">{r.employeeId}</td>
                <td className="py-2 px-4">
                  <Link to={`/resources/${r.id}`} className="text-brand-600 hover:underline font-medium">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 px-4">
                  <div className="flex flex-wrap gap-1">
                    {r.skills.map((s) => (
                      <span key={s.id} className="badge bg-slate-100 text-slate-600">
                        {s.skill.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2 px-4">{r.totalYearsExperience ?? "—"}</td>
                <td className="py-2 px-4"><StatusBadge status={r.status} /></td>
                <td className="py-2 px-4">{r.subCategory || "—"}</td>
                <td className="py-2 px-4">{r.daysOnBench ?? "—"}</td>
                <td className="py-2 px-4">{r.portfolio?.name || "—"}</td>
                <td className="py-2 px-4">{r.managerName || "—"}</td>
                <td className="py-2 px-4">
                  {r.nextScheduledAllocation
                    ? `${r.nextScheduledAllocation.project?.name || "Project"} on ${new Date(r.nextScheduledAllocation.startDate).toLocaleDateString()}`
                    : "—"}
                </td>
                <td className="py-2 px-4">{r.dateOfJoining ? new Date(r.dateOfJoining).toLocaleDateString() : "—"}</td>
                <td className="py-2 px-4">{r.taoExperienceYears ?? "—"}</td>
                <td className="py-2 px-4">{r.role || r.designation || "—"}</td>
                <td className="py-2 px-4">{r.country || "—"}</td>
                <td className="py-2 px-4">{r.workLocation || r.location || "—"}</td>
                <td className="py-2 px-4">{r.benchSince ? new Date(r.benchSince).toLocaleDateString() : "—"}</td>
                {canViewCost && <td className="py-2 px-4">{r.costRate == null ? "—" : `${r.currency} ${Number(r.costRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>}
              </tr>
            ))}
            {!isLoading && resources.length === 0 && (
              <tr>
                <td colSpan={canViewCost ? 17 : 16} className="py-6 text-center text-slate-400">
                  No resources currently on bench.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
