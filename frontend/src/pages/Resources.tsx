import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Portfolio, Resource, ResourceRecommendation } from "../types";
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
  const [certification, setCertification] = useState("");
  const [designation, setDesignation] = useState("");
  const [country, setCountry] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [minCost, setMinCost] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [relocation, setRelocation] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [minProficiency, setMinProficiency] = useState("");
  const [requiredCertifications, setRequiredCertifications] = useState("");
  const [requiredFte, setRequiredFte] = useState("");
  const [requiredStartDate, setRequiredStartDate] = useState("");
  const [requiredEndDate, setRequiredEndDate] = useState("");
  const hasAvailabilityCriteria = Boolean(requiredFte && requiredStartDate && requiredEndDate);

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ["portfolios"],
    queryFn: async () => (await api.get("/portfolios")).data,
  });

  const { data, isLoading } = useQuery<{ total: number; resources: Resource[] }>({
    queryKey: ["resources", q, skills, location, manager, certification, designation, country, minExperience, minCost, maxCost, portfolioId, relocation, statuses],
    queryFn: async () =>
      (
        await api.get("/resources", {
          params: {
            q: q || undefined,
            managerName: manager || undefined,
            skills: skills || undefined,
            certification: certification || undefined,
            designation: designation || undefined,
            country: country || undefined,
            location: location || undefined,
            minExperience: minExperience || undefined,
            minCost: canViewCost ? minCost || undefined : undefined,
            maxCost: canViewCost ? maxCost || undefined : undefined,
            portfolioId: portfolioId || undefined,
            willingToRelocate: relocation || undefined,
            status: statuses.length ? statuses.join(",") : undefined,
            pageSize: 50,
          },
        })
      ).data,
  });

  const {
    data: recommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
  } = useQuery<ResourceRecommendation[]>({
    queryKey: [
      "resource-recommendations", skills, location, requiredCertifications, minExperience, minProficiency,
      requiredFte, requiredStartDate, requiredEndDate, portfolioId, canViewCost ? maxCost : "",
    ],
    queryFn: async () =>
      (
        await api.get("/resources/recommendations/search", {
          params: {
            skills,
            certifications: requiredCertifications || undefined,
            minExperience: minExperience || undefined,
            minProficiency: minProficiency || undefined,
            location: location || undefined,
            ...(hasAvailabilityCriteria ? {
              requiredFte,
              startDate: requiredStartDate,
              endDate: requiredEndDate,
            } : {}),
            portfolioId: portfolioId || undefined,
            maxCost: canViewCost ? maxCost || undefined : undefined,
          },
        })
      ).data,
    enabled: showRecommendations && skills.split(",").some((skill) => skill.trim().length > 0),
  });

  function toggleStatus(s: string) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Resource Repository</h1>
        <p className="text-sm text-slate-500">Search active resources by profile, skills, experience, certifications, cost, location, and availability.</p>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-3">
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
        <div>
          <label className="label">Designation</label>
          <input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Engineer" />
        </div>
        <div>
          <label className="label">Country</label>
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" />
        </div>
        <div>
          <label className="label">Certification</label>
          <input className="input" value={certification} onChange={(e) => setCertification(e.target.value)} placeholder="AWS" />
        </div>
        <div>
          <label className="label">Minimum skill experience (years)</label>
          <input className="input" type="number" min="0" step="0.5" value={minExperience} onChange={(e) => setMinExperience(e.target.value)} />
        </div>
        <div>
          <label className="label">Willing to relocate</label>
          <select className="input" value={relocation} onChange={(e) => setRelocation(e.target.value)}>
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
        {canViewCost && (
          <>
            <div>
              <label className="label">Min Cost Rate</label>
              <input className="input" type="number" min="0" value={minCost} onChange={(e) => setMinCost(e.target.value)} />
            </div>
            <div>
              <label className="label">Max Cost Rate</label>
              <input className="input" type="number" min="0" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} placeholder="150" />
            </div>
          </>
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
        <div className="md:col-span-4 xl:col-span-6 flex flex-wrap gap-2">
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
        <div className="md:col-span-4 xl:col-span-6 flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowRecommendations(true)}
            disabled={!skills.trim()}
          >
            Recommend by skills
          </button>
          {!skills.trim() && <span className="text-xs text-slate-500">Enter one or more skills to get recommendations.</span>}
        </div>
      </div>

      {showRecommendations && skills.trim() && (
        <section className="card p-4 space-y-3" aria-live="polite">
          <h2 className="font-semibold text-slate-900">Skill recommendations</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="label">Required certifications (comma-separated)</label>
              <input className="input" value={requiredCertifications} onChange={(e) => setRequiredCertifications(e.target.value)} placeholder="AWS, PMP" />
            </div>
            <div>
              <label className="label">Minimum skill proficiency (1-5)</label>
              <input className="input" type="number" min="1" max="5" step="1" value={minProficiency} onChange={(e) => setMinProficiency(e.target.value)} />
            </div>
            <div>
              <label className="label">Required FTE</label>
              <input className="input" type="number" min="0.01" step="0.01" value={requiredFte} onChange={(e) => setRequiredFte(e.target.value)} />
            </div>
            <div>
              <label className="label">Required start date</label>
              <input className="input" type="date" value={requiredStartDate} onChange={(e) => setRequiredStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Required end date</label>
              <input className="input" type="date" value={requiredEndDate} onChange={(e) => setRequiredEndDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Requested location and minimum skill experience use the repository filters above.
            Enter FTE and both dates together to include availability in the score.
          </p>
          {recommendationsLoading && <p className="text-sm text-slate-500">Finding matching resources...</p>}
          {recommendationsError && <p className="text-sm text-red-600">Recommendations could not be loaded. Please try again.</p>}
          {!recommendationsLoading && !recommendationsError && recommendations?.length === 0 && (
            <p className="text-sm text-slate-500">No active resources match the requested skills.</p>
          )}
          <div className="grid gap-2">
            {recommendations?.map(({ resource, matchCount, matchedSkills, matchScore, components, availableFte }) => (
              <button
                key={resource.id}
                type="button"
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-left hover:bg-slate-50"
                onClick={() => navigate(`/resources/${resource.id}`)}
              >
                <span>
                  <span className="font-medium text-slate-800">{resource.name}</span>
                  <span className="ml-2 text-sm text-slate-500">{resource.portfolio?.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{resource.status.replace(/_/g, " ")}</span>
                  {availableFte !== undefined && <span className="ml-2 text-xs text-slate-500">{availableFte.toFixed(2)} FTE available</span>}
                </span>
                <span className="text-sm font-medium text-slate-700">{matchScore}% match · {matchCount} skill{matchCount === 1 ? "" : "s"}: {matchedSkills.join(", ") || "none"}</span>
                <span className="w-full space-y-1 text-xs text-slate-500">
                  {components.map((component) => (
                    <span key={component.key} className="block">
                      {component.explanation}
                      {component.missing.length > 0 && ` · Missing: ${component.missing.join(", ")}`}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

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
