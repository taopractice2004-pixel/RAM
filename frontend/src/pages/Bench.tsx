import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { AuthUser, Resource } from "../types";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import FilterControls from "../resourcesAllocations/FilterControls";
import SortCustomizeControls from "../resourcesAllocations/SortCustomizeControls";
import ExcelExportControls from "../resourcesAllocations/ExcelExportControls";
import * as XLSX from "xlsx";
import { useResourceAllocationViewState } from "../resourcesAllocations/viewState";
import { FIELD_BY_KEY, FieldDefinition, ResourceAllocationRow } from "../resourcesAllocations/fields";

type BenchField = FieldDefinition & { getBenchValue: (resource: Resource) => string | number | null };

const BENCH_FIELDS: BenchField[] = ([
  { ...FIELD_BY_KEY.get("employeeId")!, label: "Emp ID", getBenchValue: (resource) => resource.employeeId },
  { ...FIELD_BY_KEY.get("name")!, label: "Emp name", getBenchValue: (resource) => resource.name },
  { ...FIELD_BY_KEY.get("designation")!, label: "Role", getBenchValue: (resource) => resource.role || resource.designation || null },
  { ...FIELD_BY_KEY.get("skills")!, label: "Skillset", getBenchValue: (resource) => resource.skills.map((entry) => entry.skill.name).join(", ") || null },
  { ...FIELD_BY_KEY.get("totalYearsExperience")!, key: "totalYearsExperience", label: "YOE", getBenchValue: (resource) => resource.totalYearsExperience ?? null },
  { ...FIELD_BY_KEY.get("status")!, label: "Allocation / bench status", getBenchValue: (resource) => resource.status },
  { ...FIELD_BY_KEY.get("daysOnBench")!, label: "Ageing", getBenchValue: (resource) => resource.daysOnBench ?? null },
  { ...FIELD_BY_KEY.get("portfolio")!, label: "Vertical", getBenchValue: (resource) => resource.portfolio?.name ?? null },
  { ...FIELD_BY_KEY.get("managerName")!, label: "Manager", getBenchValue: (resource) => resource.managerName ?? null },
  { ...FIELD_BY_KEY.get("taoExperience")!, label: "TAO experience", getBenchValue: (resource) => resource.taoExperienceYears ?? null },
  { ...FIELD_BY_KEY.get("subCategory")!, label: "Bench subcategory", defaultVisible: false, getBenchValue: (resource) => resource.subCategory ?? null },
  { ...FIELD_BY_KEY.get("availablePercentForDeployment")!, key: "projectedBillability", label: "Projected billability", defaultVisible: false, getBenchValue: (resource) => resource.availablePercentForDeployment ?? null },
  { ...FIELD_BY_KEY.get("dateOfJoining")!, label: "DOJ", defaultVisible: false, getBenchValue: (resource) => resource.dateOfJoining ? Date.parse(resource.dateOfJoining) : null },
  { ...FIELD_BY_KEY.get("resourceLocation")!, label: "Location", defaultVisible: false, getBenchValue: (resource) => resource.workLocation || resource.location || null },
  { ...FIELD_BY_KEY.get("country")!, label: "Country", defaultVisible: false, getBenchValue: (resource) => resource.country ?? null },
  { ...FIELD_BY_KEY.get("project")!, label: "Project", defaultVisible: false, getBenchValue: (resource) => resource.allocations?.map((allocation) => allocation.project?.name).filter(Boolean).join(", ") || null },
  { ...FIELD_BY_KEY.get("allocationPercent")!, label: "Allocation %", defaultVisible: false, getBenchValue: (resource) => resource.allocations?.reduce((sum, allocation) => sum + allocation.allocationPercent, 0) ?? null },
  { ...FIELD_BY_KEY.get("projectEndDate")!, label: "Project end date", defaultVisible: false, getBenchValue: (resource) => { const endDate = resource.allocations?.map((allocation) => allocation.endDate).filter((value): value is string => Boolean(value)).sort()[0]; return endDate ? Date.parse(endDate) : null; } },
  { ...FIELD_BY_KEY.get("priorExperienceYears")!, label: "Prior experience (years)", defaultVisible: false, getBenchValue: (resource) => resource.priorExperienceYears ?? null },
  { ...FIELD_BY_KEY.get("skillExperience")!, label: "Minimum skill experience (years)", defaultVisible: false, getBenchValue: (resource) => resource.skills.length ? Math.max(...resource.skills.map((item) => item.yearsExperience)) : null },
  { ...FIELD_BY_KEY.get("certifications")!, label: "Certification", defaultVisible: false, getBenchValue: (resource) => resource.certifications.map((item) => item.name).join(", ") || null },
  { ...FIELD_BY_KEY.get("willingToRelocate")!, label: "Willing to relocate", defaultVisible: false, getBenchValue: (resource) => resource.willingToRelocate ? "true" : "false" },
  { ...FIELD_BY_KEY.get("costRate")!, label: "Monthly direct cost", defaultVisible: false, getBenchValue: (resource) => resource.costRate == null ? null : Number(resource.costRate) },
] as BenchField[]).map((field) => field.key === "status" || field.key === "daysOnBench" ? { ...field, filterable: true } : field);

const BENCH_DEFAULT_COLUMNS = ["employeeId", "name", "designation", "skills", "totalYearsExperience", "status", "daysOnBench", "portfolio", "managerName", "taoExperience"];
const BENCH_FIELDS_BY_KEY = new Map(BENCH_FIELDS.map((field) => [field.key, field]));
const BENCH_DEFAULT_SORT = [{ key: "daysOnBench", direction: "desc" as const }];
const BENCH_COLUMN_KEY = "bench-management-columns";
const BENCH_SORT_KEY = "bench-management-sort";

function readBenchColumns(user: AuthUser | null) {
  if (!user) return BENCH_DEFAULT_COLUMNS;
  try {
    const value = JSON.parse(localStorage.getItem(`${BENCH_COLUMN_KEY}:${user.id}`) ?? "null");
    return Array.isArray(value) ? ["employeeId", "name", ...value.filter((key): key is string => typeof key === "string" && BENCH_FIELDS_BY_KEY.has(key))].filter((key, index, all) => all.indexOf(key) === index) : BENCH_DEFAULT_COLUMNS;
  } catch { return BENCH_DEFAULT_COLUMNS; }
}

function readBenchSort(user: AuthUser | null) {
  if (!user) return BENCH_DEFAULT_SORT;
  try {
    const value = JSON.parse(localStorage.getItem(`${BENCH_SORT_KEY}:${user.id}`) ?? "null");
    return Array.isArray(value) && value.length ? value.filter((rule) => rule && BENCH_FIELDS_BY_KEY.has(rule.key) && ["asc", "desc"].includes(rule.direction)) : BENCH_DEFAULT_SORT;
  } catch { return BENCH_DEFAULT_SORT; }
}

function asBenchRow(resource: Resource): ResourceAllocationRow {
  return { ...resource, currentAllocation: null, displayAllocations: resource.allocations ?? [], expectedBenchDate: null, daysToBench: null, benchPriority: 0 };
}

export default function Bench() {
  const [classification, setClassification] = useState<string>("");
  const { user } = useAuth();
  const { state: resourceView, update: updateResourceView, resetToDefault } = useResourceAllocationViewState(user);
  const [columns, setColumns] = useState(() => readBenchColumns(user));
  const [sort, setSort] = useState(() => readBenchSort(user));
  const [benchSearch, setBenchSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportToast, setExportToast] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [compactRows, setCompactRows] = useState(false);
  const canViewCost = user?.role === "ADMIN" || user?.role === "HR" || user?.role === "RMG";

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(`${BENCH_COLUMN_KEY}:${user.id}`, JSON.stringify(columns.filter((key) => key !== "employeeId" && key !== "name")));
  }, [columns, user]);
  useEffect(() => {
    document.body.style.overflow = expanded ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(`${BENCH_SORT_KEY}:${user.id}`, JSON.stringify(sort));
  }, [sort, user]);

  const { data: portfolios = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["portfolios", user?.id, user?.role, user?.authorizedPortfolioIds],
    enabled: Boolean(user),
    queryFn: async () => (await api.get("/portfolios")).data,
  });
  const { data: subcategoryResources = [] } = useQuery<Resource[]>({
    queryKey: ["bench-subcategories", user?.id, user?.role],
    queryFn: async () => (await api.get("/bench")).data,
  });
  const subcategories = Array.from(new Set(subcategoryResources.map((resource) => resource.subCategory).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["bench", user?.id, user?.role, user?.authorizedPortfolioIds],
    queryFn: async () => (await api.get("/bench")).data,
  });
  const filterFields = useMemo(() => BENCH_FIELDS.filter((field) => field.filterable && !(field.sensitive && !canViewCost) && !(field.key === "portfolio" && user?.role !== "ADMIN" && user?.role !== "HR" && user?.role !== "RMG")), [canViewCost, user?.role]);
  const benchOptions = useMemo<Record<string, string[]>>(() => ({
    status: ["BENCH_COMMITTED", "BENCH_TRUE", "ALLOCATED", "ON_ML"],
    portfolio: portfolios.filter((entry) => user?.role === "ADMIN" || user?.role === "HR" || user?.role === "RMG" || user?.authorizedPortfolioIds.includes(entry.id)).map((entry) => entry.name).sort(),
    subCategory: [...new Set(resources.map((resource) => resource.subCategory).filter((value): value is string => Boolean(value)))].sort(),
    country: [...new Set(resources.map((resource) => resource.country).filter((value): value is string => Boolean(value)))].sort(),
    project: [...new Set(resources.flatMap((resource) => resource.allocations?.map((allocation) => allocation.project?.name).filter((value): value is string => Boolean(value)) ?? []))].sort(),
    gender: [...new Set(resources.map((resource) => resource.gender).filter((value): value is NonNullable<typeof value> => Boolean(value)))].sort(),
  }), [resources, portfolios, user]);
  const activeBenchFilters = useMemo(() => resourceView.filters.filter((filter) => filterFields.some((field) => field.key === filter.key)), [resourceView.filters, filterFields]);
  const matchingResources = useMemo(() => {
    const search = benchSearch.trim().toLocaleLowerCase();
    return resources.filter((resource) => {
      if (classification && resource.status !== classification) return false;
      if (resourceView.statuses.length && !resourceView.statuses.includes(resource.status)) return false;
      if (resourceView.ageingRange !== "all") {
        const days = resource.daysOnBench;
        if (typeof resourceView.ageingRange === "string") {
          if (days == null || (resourceView.ageingRange === "0-30" && (days < 0 || days > 30)) || (resourceView.ageingRange === "31-60" && (days < 31 || days > 60)) || (resourceView.ageingRange === "60+" && days < 61)) return false;
        } else if (days == null || (resourceView.ageingRange.min && days < Number(resourceView.ageingRange.min)) || (resourceView.ageingRange.max && days > Number(resourceView.ageingRange.max))) return false;
      }
      if (search && ![resource.employeeId, resource.name, resource.role ?? resource.designation ?? "", resource.managerName ?? "", resource.portfolio?.name ?? "", ...resource.skills.map((item) => item.skill.name)].some((value) => value.toLocaleLowerCase().includes(search))) return false;
      return activeBenchFilters.every((filter) => {
        const field = BENCH_FIELDS_BY_KEY.get(filter.key);
        if (!field) return true;
        const actual = field.getBenchValue(resource);
        if (actual == null || filter.value == null || filter.value === "") return false;
        if (field.type === "number" || field.type === "date") {
          const range = filter.value as { min: string; max: string };
          const number = typeof actual === "number" ? actual : Number(actual);
          const min = field.type === "date" && range.min ? Date.parse(range.min) : Number(range.min);
          const max = field.type === "date" && range.max ? Date.parse(range.max) : Number(range.max);
          return (range.min === "" || number >= min) && (range.max === "" || number <= max);
        }
        if (field.type === "select") {
          const selected = Array.isArray(filter.value) ? filter.value.map((entry) => String(entry).toLocaleLowerCase()) : [];
          const actualValues = String(actual).split(", ").map((entry) => entry.toLocaleLowerCase());
          return selected.some((entry) => actualValues.includes(entry));
        }
        if (["skills", "certifications"].includes(filter.key)) {
          const values = Array.isArray(filter.value) ? filter.value : [];
          const names = String(actual).split(", ").map((name) => name.toLocaleLowerCase());
          return filter.operator === "all" ? values.every((value) => names.some((name) => name.includes(String(value).toLocaleLowerCase()))) : values.some((value) => names.some((name) => name.includes(String(value).toLocaleLowerCase())));
        }
        if (field.type === "boolean") return String(actual) === String(filter.value);
        const normalized = String(actual).toLocaleLowerCase();
        return filter.operator === "exact" ? normalized === String(filter.value).toLocaleLowerCase() : normalized.includes(String(filter.value).toLocaleLowerCase());
      });
    }).sort((left, right) => {
      for (const rule of sort) {
        const field = BENCH_FIELDS_BY_KEY.get(rule.key);
        if (!field) continue;
        const a = field.getBenchValue(left);
        const b = field.getBenchValue(right);
        if (a == null || b == null) { if (a !== b) return a == null ? 1 : -1; continue; }
        const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
        if (compared) return compared * (rule.direction === "desc" ? -1 : 1);
      }
      return left.name.localeCompare(right.name);
    });
  }, [resources, classification, benchSearch, activeBenchFilters, sort]);
  const visibleFields = columns.map((key) => BENCH_FIELDS_BY_KEY.get(key)).filter((field): field is BenchField => Boolean(field && (!field.sensitive || canViewCost)));
  const exportRows = matchingResources.map(asBenchRow);

  async function exportBench(rows: Resource[], selectedFields: FieldDefinition[], mode: "current" | "all" | "selected") {
    const fields = (mode === "all" ? BENCH_FIELDS : selectedFields).filter((field) => !field.sensitive || canViewCost);
    const worksheet = XLSX.utils.aoa_to_sheet([fields.map((field) => field.label), ...rows.map((resource) => fields.map((field) => BENCH_FIELDS_BY_KEY.get(field.key)?.getBenchValue(resource) ?? ""))]);
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: fields.length - 1 } }) };
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bench Management");
    XLSX.writeFile(workbook, `BenchManagement_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExportToast(`Downloaded ${rows.length} rows`);
    window.setTimeout(() => setExportToast(""), 3000);
  }

  return (
    <div className="-m-6 min-h-screen min-w-0 space-y-4 bg-[#f4f6fa] px-4 py-6 font-['Inter',system-ui,sans-serif] text-[14px] text-[#1b2333] sm:px-8">
      <div><h1 className="text-[28px] font-bold leading-normal">Bench Management</h1><p className="mt-1.5 text-sm text-[#5a6680]">Committed bench has a future assignment scheduled. True bench has nothing scheduled.</p></div>
      <div className={`${expanded ? "fixed inset-0 z-[60] overflow-auto bg-[#f4f6fa] p-4" : "space-y-4"}`}>
      {!expanded && <div className="inline-flex rounded-[10px] bg-[#e6eaf3] p-1">{[["", "All bench"], ["BENCH_COMMITTED", "Committed"], ["BENCH_TRUE", "True bench"]].map(([key, label]) => {
        const count = resources.filter((resource) => key === "" ? true : resource.status === key).length;
        return <button key={key} type="button" aria-pressed={classification === key} className={`rounded-lg px-4 py-2 text-sm ${classification === key ? "bg-white font-semibold shadow-sm" : "text-[#5a6680]"}`} onClick={() => setClassification(key)}>{label} <strong className="ml-1">{count}</strong></button>;
      })}</div>}
      <section className={`flex flex-col gap-3 rounded-[14px] border border-[#dbe1ee] bg-white p-4 ${expanded ? "sticky top-0 z-[61]" : ""}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <label className="relative block min-w-0 flex-[1_1_300px]"><input aria-label="Search name, ID, skill, manager" className="h-10 w-full rounded-[10px] border border-[#cdd5e3] px-3 text-sm placeholder:text-[#757575] focus:border-[#2f4bd8] focus:outline-none focus:ring-2 focus:ring-[#2f4bd8]/20" placeholder="Search name, ID, skill, manager..." value={benchSearch} onChange={(event) => setBenchSearch(event.target.value)} /></label>
          <FilterControls fields={filterFields} filters={activeBenchFilters} onChange={(filters) => updateResourceView({ filters })} onClose={() => undefined} optionValues={benchOptions} />
          <SortCustomizeControls columns={columns} sort={sort} fields={filterFields} onColumnsChange={setColumns} onSortChange={setSort} resetToDefault={() => { setColumns(BENCH_DEFAULT_COLUMNS); setSort(BENCH_DEFAULT_SORT); resetToDefault(); }} />
          <ExcelExportControls rows={exportRows} visibleFields={visibleFields} allFields={BENCH_FIELDS.filter((field) => !field.sensitive || canViewCost)} selectedIds={selectedIds} onExport={(rows, fields, mode) => exportBench(rows, fields, mode)} />
          <button type="button" aria-label={expanded ? "Exit full view" : "Expand table"} className="h-10 rounded-[10px] border border-[#cdd5e3] bg-white px-3 text-lg" onClick={() => setExpanded(!expanded)}>{expanded ? "↙" : "⤢"}</button>
          <button type="button" aria-label={compactRows ? "Use comfortable row spacing" : "Use compact row spacing"} className="h-10 rounded-[10px] border border-[#cdd5e3] bg-white px-3 text-sm" onClick={() => setCompactRows(!compactRows)}>{compactRows ? "↕" : "↕"} {compactRows ? "Comfortable" : "Compact"}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {classification && <button type="button" className="h-[34px] rounded-full bg-[#e8edff] px-3 text-xs text-[#243aa8]" onClick={() => setClassification("")}>{classification === "BENCH_COMMITTED" ? "Committed" : "True bench"} ×</button>}
          {resourceView.ageingRange !== "all" && <button type="button" className="h-[34px] rounded-full bg-[#e8edff] px-3 text-xs text-[#243aa8]" onClick={() => updateResourceView({ ageingRange: "all" })}>Ageing: {typeof resourceView.ageingRange === "string" ? resourceView.ageingRange : `${resourceView.ageingRange.min || "Any"} – ${resourceView.ageingRange.max || "Any"}`} ×</button>}
        </div>
      </section>
      <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#dbe1ee] bg-white">
        <div className="flex items-center justify-between border-b border-[#e6eaf3] px-4 py-3 text-sm"><span><strong>{matchingResources.length}</strong> employees</span><span className="text-xs text-[#5a6680]">Exports exactly what you see here</span></div>
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-left text-[13px]"><thead className="sticky top-0 z-10 bg-[#eef1f7] text-xs uppercase tracking-wide text-[#4a5670]"><tr><th className="px-3 py-2.5"><input type="checkbox" aria-label="Select all bench employees" checked={matchingResources.length > 0 && matchingResources.every((resource) => selectedIds.includes(resource.id))} onChange={(event) => setSelectedIds(event.target.checked ? matchingResources.map((resource) => resource.id) : [])} /></th>{visibleFields.map((field) => <th key={field.key} className="whitespace-nowrap px-3 py-2.5">{field.label}{field.key === "daysOnBench" ? " ▼" : ""}</th>)}</tr></thead>
          <tbody>{isLoading && <tr><td colSpan={visibleFields.length + 1} className="py-6 text-center text-[#5a6680]">Loading bench employees...</td></tr>}
            {!isLoading && matchingResources.map((resource) => <tr key={resource.id} className="h-12 border-b border-[#e6eaf3] hover:bg-[#f7f9ff]"><td className="px-3"><input type="checkbox" aria-label={`Select ${resource.name}`} checked={selectedIds.includes(resource.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, resource.id] : current.filter((id) => id !== resource.id))} /></td>{visibleFields.map((field) => {
              const value = field.getBenchValue(resource);
              const display = field.key === "name" ? <Link to={`/resources/${resource.id}`} className="font-semibold text-[#1b2333] hover:underline">{String(value ?? "—")}</Link> : field.key === "status" ? <StatusBadge status={resource.status} /> : field.key === "skills" ? <span className="text-[#5a6680]">{value || "Add skills"}</span> : field.key === "daysOnBench" && value != null ? <span className="font-semibold tabular-nums text-[#b4380a]">{field.formatValue(value, resource as never)}</span> : field.key === "dateOfJoining" && typeof value === "number" ? new Date(value).toLocaleDateString() : value == null || value === "" ? "—" : String(value);
              return <td key={field.key} className="whitespace-nowrap px-3 py-2">{display}</td>;
            })}</tr>)}
            {!isLoading && matchingResources.length === 0 && <tr><td colSpan={visibleFields.length + 1} className="py-6 text-center text-[#5a6680]">No bench employees match these filters.</td></tr>}
          </tbody></table></div>
      </section>
      {exportToast && <div role="status" className="fixed bottom-6 right-6 z-50 rounded-[10px] bg-[#157347] px-4 py-3 text-sm text-white shadow-lg">{exportToast}</div>}
      </div>
    </div>
  );
}
