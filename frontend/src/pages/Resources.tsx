import { Fragment, useEffect, useMemo, useState } from "react";
import { FIELD_BY_KEY, FIELD_REGISTRY, matchesFilter, matchesAgeing, isMovingToBench, joinResourceAllocations, canReadField, fieldValue, ResourceAllocationRow, toResourceAllocationRow, compareRows } from "../resourcesAllocations/fields";
import { normalizeFilters, useResourceAllocationViewState, validRange } from "../resourcesAllocations/viewState";
import AllocationModal from "../components/AllocationModal";
import ExtendAllocationDialog from "../components/ExtendAllocationDialog";
import BulkExtendAllocationDialog from "../components/BulkExtendAllocationDialog";
import { isAxiosError } from "axios";
import FilterControls from "../resourcesAllocations/FilterControls";
import SortCustomizeControls from "../resourcesAllocations/SortCustomizeControls";
import ExcelExportControls from "../resourcesAllocations/ExcelExportControls";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Allocation, Portfolio, Resource, ResourceRecommendation, ResourceStatus } from "../types";
import { canAllocateResource, canEditAllocations, useAuth } from "../context/AuthContext";

const STATUS_OPTIONS: ResourceStatus[] = ["ALLOCATED", "BENCH_COMMITTED", "BENCH_TRUE", "ON_ML", "TERMINATED"];
const STATUS_STYLES: Record<string, string> = {
  ALLOCATED: "bg-[#e3f4ea] text-[#157347]",
  BENCH_COMMITTED: "bg-[#fff4cc] text-[#7a5b00]",
  BENCH_TRUE: "bg-[#ffe9d6] text-[#8a3b00]",
  TERMINATED: "bg-[#fee2e2] text-[#991b1b]",
};
const STATUS_LABELS: Record<string, string> = {
  ALLOCATED: "Allocated", BENCH_COMMITTED: "Bench committed", BENCH_TRUE: "Bench true", ON_ML: "On ML", TERMINATED: "Terminated",
};

export default function Resources() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [extensionRow, setExtensionRow] = useState<ResourceAllocationRow | null>(null);
  const [bulkExtensionOpen, setBulkExtensionOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingEndDate, setEditingEndDate] = useState("");
  const [endDateError, setEndDateError] = useState("");
  const [savingEndDate, setSavingEndDate] = useState(false);
  const { user } = useAuth();
  const canViewCost = canReadField(FIELD_BY_KEY.get("costRate")!, user);
  const { state: viewState, update: updateViewState, resetToDefault } = useResourceAllocationViewState(user);
  const [q, setQ] = useState("");
  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [manager, setManager] = useState("");
  const [certification, setCertification] = useState("");
  const [designation, setDesignation] = useState("");
  const [country, setCountry] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [minTaoExperience, setMinTaoExperience] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [minCost, setMinCost] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [relocation, setRelocation] = useState("");
  const [statuses, setStatuses] = useState<ResourceStatus[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [allocationResource, setAllocationResource] = useState<Resource | null>(null);
  const [creatingAllocation, setCreatingAllocation] = useState(false);
  const [stripHidden, setStripHidden] = useState(false);
  const [upcomingWindow, setUpcomingWindow] = useState<30 | 60 | 90>(60);
  const [ageingDraft, setAgeingDraft] = useState({ min: "", max: "" });
  const [ageingError, setAgeingError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [minProficiency, setMinProficiency] = useState("");
  const [requiredCertifications, setRequiredCertifications] = useState("");
  const [requiredFte, setRequiredFte] = useState("");
  const [requiredStartDate, setRequiredStartDate] = useState("");
  const [requiredEndDate, setRequiredEndDate] = useState("");
  const hasAvailabilityCriteria = Boolean(requiredFte && requiredStartDate && requiredEndDate);

  const { data: portfolios = [] } = useQuery<Portfolio[]>({
    queryKey: ["portfolios", user?.id, user?.role, user?.authorizedPortfolioIds],
    enabled: !!user,
    queryFn: async () => (await api.get("/portfolios")).data,
  });

  const { data, isPending, isFetching, isError, refetch } = useQuery<{ total: number; resources: Resource[] }>({
    queryKey: ["resources", user?.id, user?.role, user?.authorizedPortfolioIds, q, manager, certification, designation, country, minTaoExperience, minCost, subCategory, relocation],
    enabled: !!user,
    queryFn: async () => {
      const params = {
            q: q || undefined,
            managerName: manager || undefined,
            certification: certification || undefined,
            designation: designation || undefined,
            country: country || undefined,

            minTaoExperience: minTaoExperience || undefined,
            minCost: canViewCost ? minCost || undefined : undefined,

            subCategory: subCategory || undefined,
            willingToRelocate: relocation || undefined,
            status: STATUS_OPTIONS.join(","),
            page: 1,
            pageSize: 100,
      };
      const firstPage = (await api.get("/resources", { params })).data as { total: number; pageSize: number; resources: Resource[] };
      const [remainingPages, allocationsResponse] = await Promise.all([
        Promise.all(Array.from({ length: Math.ceil(firstPage.total / firstPage.pageSize) - 1 }, (_, index) =>
          api.get("/resources", { params: { ...params, page: index + 2 } })
        )),
        api.get("/allocations"),
      ]);
       const resources: Resource[] = [...firstPage.resources, ...remainingPages.flatMap((response) => response.data.resources as Resource[])];
       if (!firstPage.pageSize || resources.length !== firstPage.total || new Set(resources.map((resource) => resource.id)).size !== firstPage.total) throw new Error("Resource pages were incomplete.");
       return { ...firstPage, resources: joinResourceAllocations(resources, allocationsResponse.data as Allocation[]) };
    },
  });

  const loadingTable = isPending && !data;
  const refreshingTable = isFetching && !!data;
  const resourceRows = useMemo(() => (data?.resources ?? []).map((resource) => toResourceAllocationRow(resource)), [data]);
  const filterOptions = useMemo<Record<string, string[]>>(() => ({
    status: STATUS_OPTIONS,
    project: Array.from(new Set(resourceRows.flatMap((row) => row.displayAllocations.map((allocation) => allocation.project?.name).filter((name): name is string => !!name)))).sort(),
    allocationStatus: ["ACTIVE", "SCHEDULED", "CLOSED", "CANCELLED"],
    gender: ["FEMALE", "MALE", "OTHER", "UNDISCLOSED"],
    portfolio: portfolios.filter((portfolio) => user?.role !== "RMG" || user.authorizedPortfolioIds.includes(portfolio.id)).map((portfolio) => portfolio.name),
    subCategory: Array.from(new Set(resourceRows.map((row) => row.subCategory).filter((value): value is string => !!value))).sort(),
  }), [resourceRows, portfolios]);
  const activeFilters = useMemo(() => normalizeFilters(viewState.filters, user, data ? filterOptions : undefined), [viewState.filters, user, filterOptions, data]);
  const tableRows = useMemo(() => {
    const search = viewState.search.trim().toLocaleLowerCase();
    const rows = resourceRows;
    const terminatedFilter = activeFilters.find((filter) => filter.key === "status");
    const explicitlyIncludesTerminated = Array.isArray(terminatedFilter?.value) && terminatedFilter.value.includes("TERMINATED");
    const selectedStatuses = viewState.statuses.length
      ? rows.filter((row) => viewState.statuses.includes(row.status))
      : rows.filter((row) => row.status !== "TERMINATED" || explicitlyIncludesTerminated);
     const searched = selectedStatuses.filter((row) => !search || [row.name, row.employeeId, row.managerName ?? "", ...row.displayAllocations.map((allocation) => allocation.project?.name ?? ""), ...row.skills.map((item) => item.skill.name)].some((value) => value.toLocaleLowerCase().includes(search)));
     const byAgeing = searched.filter((row) => matchesAgeing(row.daysOnBench, viewState.ageingRange));
     const filtered = byAgeing.filter((row) => activeFilters.every((filter) => matchesFilter(row, filter, user)));
    const sort = viewState.sort.length ? viewState.sort : [{ key: "benchPriority", direction: "asc" as const }];
    return filtered.sort((a, b) => {
      for (const rule of sort) {
         const compared = compareRows(a, b, rule.key, rule.direction, user);
        if (compared !== 0) return compared;
      }
      return 0;
    });
  }, [resourceRows, viewState.search, viewState.statuses, viewState.ageingRange, activeFilters, viewState.sort, user]);

  const visibleFields = useMemo(() => viewState.columns.map((key) => FIELD_BY_KEY.get(key)).filter((field): field is NonNullable<typeof field> => Boolean(field && canReadField(field, user))), [viewState.columns, user]);
  const pinnedFields = [FIELD_BY_KEY.get("employeeId")!, FIELD_BY_KEY.get("name")!];
  const tableFields = [...pinnedFields, ...visibleFields.filter((field) => !pinnedFields.some((pinned) => pinned.key === field.key))];
  const benchPrioritySort = viewState.sort.length === 1 && viewState.sort[0].key === "benchPriority" && viewState.sort[0].direction === "asc";
  const upcomingBenchRows = useMemo(() => resourceRows.filter((row) => isMovingToBench(row, 90)).sort((a, b) => (a.daysToBench ?? Infinity) - (b.daysToBench ?? Infinity) || a.name.localeCompare(b.name)), [resourceRows]);
  const movingToBench = useMemo(() => upcomingBenchRows.filter((row) => (row.daysToBench ?? Infinity) <= upcomingWindow), [upcomingBenchRows, upcomingWindow]);
  const bulkExtensionRows = resourceRows.filter((row) => selectedIds.includes(row.id) && canEditEndDate(row) && Boolean(row.currentAllocation?.endDate));
  const tableGroups = useMemo(() => {
    if (!benchPrioritySort) return [{ label: "", rows: tableRows }];
    const groups = [
      { label: "On bench · highest ageing first", rows: tableRows.filter((row) => row.benchPriority === 0) },
      { label: "Moving to bench · soonest first", rows: tableRows.filter((row) => row.benchPriority === 1) },
      { label: "Allocated and available", rows: tableRows.filter((row) => row.benchPriority === 2) },
    ];
    return groups.filter((group) => group.rows.length > 0);
  }, [benchPrioritySort, tableRows]);


  const filterFields = useMemo(() => FIELD_REGISTRY.filter((field) => field.filterable && canReadField(field, user)), [user]);
  const exportFieldsForRole = useMemo(() => FIELD_REGISTRY.filter((field) => canReadField(field, user)), [user]);

  useEffect(() => {
    if (!viewState.expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeExpanded = (event: KeyboardEvent) => {
      if (event.key === "Escape") updateViewState({ expanded: false });
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeExpanded);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeExpanded);
    };
  }, [viewState.expanded, updateViewState]);

  async function exportRows(rows: ResourceAllocationRow[], fields: typeof FIELD_REGISTRY, mode: "current" | "all" | "selected") {
    if (loadingTable || !rows.length || !fields.length) return;
    fields = fields.filter((field) => canReadField(field, user));
    if (!fields.length) return;
    const headers = fields.map((field) => field.label);
    const values = rows.map((row) => fields.map((field) => {
      const value = fieldValue(field, row, user);
      if (field.type === "date" && typeof value === "number") return new Date(value);
      return value ?? "";
    }));
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...values]);
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: fields.length - 1 } }) };
    worksheet["!cols"] = fields.map((field, index) => ({ wch: Math.min(40, Math.max(field.label.length + 2, ...values.map((row) => String(row[index] ?? "").length + 2))) }));
    for (let column = 0; column < fields.length; column += 1) {
      const headerCell = XLSX.utils.encode_cell({ r: 0, c: column });
      if (worksheet[headerCell]) worksheet[headerCell].s = { font: { bold: true } };
      if (fields[column].type === "date") {
        for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
          if (cell instanceof Date) worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })] = { t: "d", v: cell, z: "dd/mm/yyyy" };
          else if (cell) cell.z = "dd/mm/yyyy";
        }
      }
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resources & Allocations");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    const blobUrl = window.URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `ResourcesAllocations_${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(blobUrl);
    setToast(`Downloaded ${rows.length} rows`);
    window.setTimeout(() => setToast(""), 3000);
    void mode;
  }

  const {
    data: recommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
  } = useQuery<ResourceRecommendation[]>({
    queryKey: [
      "resource-recommendations", user?.id, user?.role, user?.authorizedPortfolioIds, skills, location, requiredCertifications, minExperience, minProficiency,
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
    enabled: !!user && showRecommendations && skills.split(",").some((skill) => skill.trim().length > 0),
  });

  function canEditEndDate(row: ResourceAllocationRow) {
    return Boolean(row.currentAllocation && ["ACTIVE", "SCHEDULED"].includes(row.currentAllocation.status)
      && canEditAllocations(user, [row.currentAllocation.portfolioId]));
  }

  async function saveEndDate(row: ResourceAllocationRow, mode: "extend" | "edit", endDate: string, reason?: string) {
    const allocation = row.currentAllocation;
    if (!canEditEndDate(row) || !allocation) throw new Error("You are not authorized to update this allocation.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(Date.parse(endDate)) || new Date(endDate).toISOString().slice(0, 10) !== endDate) throw new Error("Enter a valid end date.");
    if (endDate < new Date().toISOString().slice(0, 10)) throw new Error("End date must not be in the past.");
    if (endDate < allocation.startDate.slice(0, 10)) throw new Error("End date must be on or after the start date.");
    if (mode === "extend" && (!allocation.endDate || endDate <= allocation.endDate.slice(0, 10))) {
      throw new Error("New end date must be later than the current end date.");
    }

    try {
      await api.patch(`/allocations/${allocation.id}/end-date`, { projectId: allocation.projectId, mode, endDate, reason: reason?.trim() || undefined });
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.error : undefined;
      throw new Error(typeof message === "string" ? message : "Could not update the end date. Please try again.");
    }
    await Promise.all([
      ["resources"], ["resource", row.id], ["allocations"], ["bench"], ["dashboard"], ["resource-recommendations"],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  }

  async function saveBulkEndDate(allocationIds: string[], endDate: string, reason: string) {
    try {
      const { data: result } = await api.patch<{ updated: number }>("/allocations/bulk-end-date", { allocationIds, endDate, reason: reason.trim() || undefined });
      await Promise.all([
        ["resources"], ["allocations"], ["bench"], ["dashboard"], ["resource-recommendations"],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      setSelectedIds([]);
      setToast(`Extended ${result.updated} ${result.updated === 1 ? "allocation" : "allocations"}`);
      window.setTimeout(() => setToast(""), 3000);
      return result;
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.error : undefined;
      throw new Error(typeof message === "string" ? message : "Could not extend the selected allocations. Please try again.");
    }
  }

  async function saveInlineEndDate(row: ResourceAllocationRow) {
    if (savingEndDate) return;
    setSavingEndDate(true);
    setEndDateError("");
    try {
      await saveEndDate(row, "edit", editingEndDate);
      setEditingRowId(null);
    } catch (error) {
      setEndDateError(error instanceof Error ? error.message : "Could not update the end date.");
    } finally {
      setSavingEndDate(false);
    }
  }

  return (
    <div className="-m-6 min-h-screen min-w-0 space-y-4 bg-[#f4f6fa] px-4 py-6 font-['Inter',system-ui,sans-serif] text-[14px] text-[#1b2333] sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-[28px] font-bold leading-normal">Resources &amp; Allocations</h1><p className="mt-1.5 text-sm leading-normal text-[#5a6680]">Search resources, see who is moving to bench, and extend or change allocations.</p></div>
        <div className="flex flex-wrap gap-2.5"><button type="button" className="h-10 rounded-[10px] border border-[#cdd5e3] bg-white px-3.5 text-sm font-medium" onClick={() => setShowRecommendations(true)}>Recommend by skills</button>{canEditAllocations(user) && <button type="button" className="h-10 rounded-[10px] border border-[#2f4bd8] bg-[#2f4bd8] px-3.5 text-sm font-medium text-white" disabled={loadingTable || isError} onClick={() => setCreatingAllocation(true)}>＋ New allocation</button>}</div>
      </div>
      <section className="rounded-[14px] border border-[#f1d9a8] bg-[#fffdf7]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1d9a8] bg-[#fffaf0] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><span>Upcoming bench</span><span className="rounded-full bg-[#fff4cc] px-2.5 py-1 text-xs font-semibold text-[#7a5b00]">{loadingTable || isError ? "—" : movingToBench.length}</span><span className="hidden text-xs font-normal text-[#5a6680] sm:inline">Allocations ending soon, soonest first</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-[#eef1f7] p-1" role="group" aria-label="Upcoming bench range">
              {([30, 60, 90] as const).map((days) => <button key={days} type="button" aria-pressed={upcomingWindow === days} className={`rounded-md px-3 py-1.5 text-xs font-medium ${upcomingWindow === days ? "bg-white text-[#1b2333] shadow-sm" : "text-[#5a6680]"}`} onClick={() => setUpcomingWindow(days)}>{days} d</button>)}
            </div>
            <button type="button" aria-expanded={!stripHidden} className="px-1 text-xs text-[#5a6680]" onClick={() => setStripHidden(!stripHidden)}>{stripHidden ? "▾ Show" : "▴ Hide"}</button>
          </div>
        </div>
        {!stripHidden && (loadingTable ? <p className="py-5 text-center text-sm text-[#5a6680]">Loading upcoming allocations...</p> : isError ? <p role="alert" className="py-5 text-center text-sm text-[#5a6680]">Upcoming allocations could not be loaded. <button type="button" className="text-[#2f4bd8]" onClick={() => void refetch()}>Retry</button></p> : movingToBench.length === 0 ? <p className="py-5 text-center text-sm text-[#5a6680]">No allocations end in the next {upcomingWindow} days.</p> : <>
          <div className="max-h-[19rem] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#fff4cc] text-[10px] uppercase tracking-wide text-[#6b5700]"><tr>{["Emp ID", "Emp name", "Role", "Project", "Project end date", "Days left", "Manager", "Action"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2.5 font-semibold">{label}</th>)}</tr></thead>
              <tbody>{movingToBench.map((row) => <tr key={row.id} className="h-11 border-b border-[#e6eaf3] last:border-0 hover:bg-[#f7f9ff]">
                <td className="whitespace-nowrap px-3 py-2 text-[#5a6680]">{row.employeeId}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{row.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.role || row.designation || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.currentAllocation?.project?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{row.currentAllocation?.endDate ? new Date(row.currentAllocation.endDate).toLocaleDateString("en-GB") : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2"><span className={`inline-block rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums ${(row.daysToBench ?? 99) <= 30 ? "bg-[#fde8e4] text-[#b4380a]" : "bg-[#fff4cc] text-[#7a5b00]"}`}>{row.daysToBench} d</span></td>
                <td className="whitespace-nowrap px-3 py-2">{row.managerName || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{canEditEndDate(row) && row.currentAllocation?.endDate && <button type="button" className="rounded-lg border border-[#cdd5e3] bg-white px-2.5 py-1.5 font-medium text-[#2f4bd8]" onClick={() => setExtensionRow(row)}>↻ Extend</button>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="border-t border-[#f1d9a8] px-4 py-2 text-xs text-[#5a6680]">Showing {Math.min(6, movingToBench.length)} of {movingToBench.length} · scroll for more</p>
        </>)}
      </section>

      {showRecommendations && (<div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" onKeyDown={(event) => { if (event.key === "Escape") setShowRecommendations(false); }}><section role="dialog" aria-modal="true" aria-label="Skill recommendations" className="card mx-auto my-4 max-w-5xl p-4 space-y-3" aria-live="polite">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Skill recommendations</h2><button type="button" aria-label="Close recommendations" onClick={() => setShowRecommendations(false)}>×</button></div>
          <label className="label">Skills (comma-separated)<input className="input mt-1" value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, Java" /></label>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="label">Requested location<input className="input" value={location} onChange={(event) => setLocation(event.target.value)} /></label>
            <label className="label">Minimum skill experience (years)<input className="input" type="number" min="0" step="0.1" value={minExperience} onChange={(event) => setMinExperience(event.target.value)} /></label>
            <label className="label">Portfolio<select className="input" value={portfolioId} onChange={(event) => setPortfolioId(event.target.value)}><option value="">All portfolios</option>{portfolios.filter((portfolio) => user?.role !== "RMG" || user.authorizedPortfolioIds.includes(portfolio.id)).map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></label>
            {canViewCost && <label className="label">Maximum cost<input className="input" type="number" min="0" value={maxCost} onChange={(event) => setMaxCost(event.target.value)} /></label>}
          </div>
          <p className="text-xs text-slate-500">
            Enter FTE and both dates together to include availability in the score.
          </p>
          {recommendationsLoading && <p className="text-sm text-slate-500">Finding matching resources...</p>}
          {recommendationsError && <p className="text-sm text-red-600">Recommendations could not be loaded. Please try again.</p>}
          {!recommendationsLoading && !recommendationsError && recommendations?.length === 0 && (
            <p className="text-sm text-slate-500">No active resources match the requested skills.</p>
          )}
          <div className="grid gap-2">
            {recommendations?.map(({ resource, matchCount, matchedSkills, matchScore, components, availableFte, pipStatus }) => (
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
                  {pipStatus !== undefined && (
                    <span className="ml-2 text-xs text-slate-500">
                      PIP: {pipStatus === null ? "Unknown" : pipStatus ? "Yes" : "No"}
                    </span>
                  )}
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
        </section></div>)}

      <div className={viewState.expanded ? "fixed inset-0 z-40 flex min-w-0 flex-col gap-4 overflow-auto bg-[#f4f6fa] p-4" : "min-w-0 space-y-4"}>
      <section className="flex flex-col gap-3 rounded-[14px] border border-[#dbe1ee] bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[.04em] text-[#5a6680]">Bench ageing</span>
          <div className="inline-flex max-w-full flex-wrap rounded-[10px] bg-[#e6eaf3] p-[3px]">{([ ["all", "All"], ["0-30", "0–30 d"], ["31-60", "31–60 d"], ["60+", "60+ d"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={viewState.ageingRange === value} onClick={() => updateViewState({ ageingRange: value })} className={`h-8 rounded-lg px-3 text-[13px] font-medium ${viewState.ageingRange === value ? "bg-white text-[#1b2333] shadow-sm" : "text-[#5a6680]"}`}>{label}</button>)}<button type="button" aria-pressed={typeof viewState.ageingRange !== "string"} onClick={() => { if (typeof viewState.ageingRange === "string") { setAgeingDraft({ min: "", max: "" }); setAgeingError(""); updateViewState({ ageingRange: { min: "", max: "" } }); } else { setAgeingError(""); updateViewState({ ageingRange: "all" }); } }} className={`h-8 rounded-lg px-3 text-[13px] font-medium ${typeof viewState.ageingRange !== "string" ? "bg-white text-[#1b2333] shadow-sm" : "text-[#5a6680]"}`}>Custom</button></div>
          {typeof viewState.ageingRange !== "string" && <div className="flex items-center gap-2"><label className="sr-only" htmlFor="ageing-min">Minimum ageing days</label><input id="ageing-min" className="w-20 rounded-lg border border-[#cdd5e3] px-2 py-2 text-xs" type="number" placeholder="Min" value={ageingDraft.min} onChange={(event) => { setAgeingDraft({ ...ageingDraft, min: event.target.value }); setAgeingError(""); }} /><span className="text-xs text-[#5a6680]">to</span><label className="sr-only" htmlFor="ageing-max">Maximum ageing days</label><input id="ageing-max" className="w-20 rounded-lg border border-[#cdd5e3] px-2 py-2 text-xs" type="number" placeholder="Max" value={ageingDraft.max} onChange={(event) => { setAgeingDraft({ ...ageingDraft, max: event.target.value }); setAgeingError(""); }} /><button type="button" className="text-xs text-[#2f4bd8]" onClick={() => { if (!validRange(ageingDraft, "number") || (ageingDraft.min !== "" && Number(ageingDraft.min) < 0) || (ageingDraft.max !== "" && Number(ageingDraft.max) < 0)) setAgeingError("Enter valid non-negative bounds, minimum ≤ maximum."); else { setAgeingError(""); updateViewState({ ageingRange: ageingDraft }); } }}>Apply</button><button type="button" className="text-xs text-[#2f4bd8]" onClick={() => { setAgeingDraft({ min: "", max: "" }); setAgeingError(""); updateViewState({ ageingRange: "all" }); }}>Reset</button>{ageingError && <span role="alert" className="text-xs text-red-700">{ageingError}</span>}</div>}
          {!viewState.expanded && <><span className="mx-1 h-7 border-l border-[#dbe1ee]" /><span className="text-xs font-semibold uppercase tracking-[.04em] text-[#5a6680]">Status</span>
          {STATUS_OPTIONS.map((status) => <button key={status} type="button" aria-pressed={viewState.statuses.includes(status)} onClick={() => updateViewState({ statuses: viewState.statuses.includes(status) ? viewState.statuses.filter((item) => item !== status) : [...viewState.statuses, status] })} className={`h-[34px] rounded-[17px] border px-3 text-[13px] ${viewState.statuses.includes(status) ? "border-[#e8edff] bg-[#e8edff] text-[#243aa8]" : "border-[#cdd5e3] bg-white text-[#1b2333]"}`}>{STATUS_LABELS[status]}</button>)}</>}
        </div>
        <div className={`flex min-w-0 flex-wrap items-center gap-2.5 ${viewState.expanded ? "min-h-[60px] border-b border-[#eef1f7]" : ""}`}>
          {viewState.expanded && <span className="shrink-0 text-sm font-semibold">{tableRows.length} resources</span>}
          <label className={`relative block ${viewState.expanded ? "w-52 shrink-0" : "min-w-0 flex-[1_1_300px]"}`}>
            <svg aria-hidden="true" className="absolute left-3 top-2.5 h-5 w-5 text-[#7d89a3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input aria-label="Search name, ID, skill, project, manager" className="h-10 w-full rounded-[10px] border border-[#cdd5e3] pl-10 pr-2.5 text-sm placeholder:text-[#757575] focus:border-[#2f4bd8] focus:outline-none focus:ring-2 focus:ring-[#2f4bd8]/20" value={viewState.search} onChange={(event) => updateViewState({ search: event.target.value })} placeholder="Search name, ID, skill, project, manager…" />
          </label>
          <FilterControls fields={filterFields} filters={activeFilters} onChange={(filters) => updateViewState({ filters })} onClose={() => undefined} optionValues={filterOptions} />
          <SortCustomizeControls columns={viewState.columns} sort={viewState.sort} fields={exportFieldsForRole} onColumnsChange={(columns) => updateViewState({ columns })} onSortChange={(sort) => updateViewState({ sort })} resetToDefault={resetToDefault} />
          <ExcelExportControls rows={loadingTable ? [] : tableRows} visibleFields={tableFields} allFields={exportFieldsForRole} selectedIds={selectedIds} onExport={exportRows} />
          {selectedIds.length > 0 && canEditAllocations(user) && <button type="button" className="h-[34px] shrink-0 rounded-lg border border-[#cdd5e3] bg-white px-3 text-sm font-medium text-[#2f4bd8]" disabled={bulkExtensionRows.length === 0 || loadingTable || isError} onClick={() => setBulkExtensionOpen(true)}>Bulk extend{bulkExtensionRows.length ? ` (${bulkExtensionRows.length})` : ""}</button>}
          <button type="button" aria-label={viewState.expanded ? "Exit full view" : "Expand table"} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#cdd5e3] bg-white text-sm text-[#2f4bd8]" onClick={() => updateViewState({ expanded: !viewState.expanded })}>{viewState.expanded ? "⤡" : "⤢"}</button>
        </div>
        {selectedIds.length > 0 && canEditAllocations(user) && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[#f7f9fc] px-3 py-2 text-xs text-[#5a6680]">
          <span>{bulkExtensionRows.length} resources selected for bulk end-date update</span>
          <button type="button" className="text-[#2f4bd8]" onClick={() => setSelectedIds([])}>Clear</button>
          {bulkExtensionRows.length === 0 && <span>Select allocated resources with editable project end dates to extend.</span>}
        </div>}
        {(viewState.expanded && (viewState.statuses.length > 0 || viewState.ageingRange !== "all")) && <div className={`flex flex-wrap items-center gap-2 ${viewState.expanded ? "min-h-12 flex-nowrap overflow-x-auto" : ""}`}>
          {viewState.expanded && viewState.ageingRange !== "all" && <span className="shrink-0 rounded-full bg-[#e8edff] px-3 py-2 text-xs text-[#243aa8]">Ageing: {typeof viewState.ageingRange === "string" ? viewState.ageingRange : `${viewState.ageingRange.min || "Any"}–${viewState.ageingRange.max || "Any"}`}</span>}
          {viewState.expanded && viewState.statuses.map((status) => <span key={status} className="shrink-0 rounded-full bg-[#e8edff] px-3 py-2 text-xs text-[#243aa8]">Status: {status.replace(/_/g, " ")}</span>)}
        </div>}
      </section>
      <section className={`min-w-0 overflow-hidden rounded-[14px] border border-[#dbe1ee] bg-white ${viewState.expanded ? "min-h-0 flex-1 rounded-none" : ""}`}>
        {!viewState.expanded && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e6eaf3] px-4 py-2.5 text-sm"><span><strong>{tableRows.length}</strong> resources</span>{benchPrioritySort && <span className="text-xs text-[#5a6680]">Ordered by bench priority{resourceRows.some(canEditEndDate) ? " · Project end date is editable ✎" : ""}</span>}</div>}
         <div className={`max-w-full overflow-x-auto ${viewState.expanded ? "h-full" : ""}`}>
          <table className="w-full min-w-[1200px] border-collapse text-left text-[13px] leading-normal [&_td]:whitespace-nowrap [&_td]:py-[9px] [&_th]:border-b [&_th]:border-[#dbe1ee] [&_th]:font-semibold">
            <thead className="sticky top-0 z-10 bg-[#eef1f7] text-xs uppercase tracking-wide text-[#4a5670]"><tr><th className="w-11 min-w-11 px-3 py-2.5"><input type="checkbox" aria-label="Select all resources" checked={tableRows.length > 0 && tableRows.every((row) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds(event.target.checked ? tableRows.map((row) => row.id) : [])} /></th><th className="w-24 min-w-24 px-3 py-2.5">{pinnedFields[0].label}</th><th className="w-44 min-w-44 border-r border-[#dbe1ee] px-3 py-2.5">{pinnedFields[1].label}</th>{tableFields.slice(2).map((field) => <th key={field!.key} className="whitespace-nowrap px-3 py-2.5">{field!.label}{field!.key === "projectEndDate" && resourceRows.some(canEditEndDate) ? " ✎" : ""}</th>)}<th className="px-3 py-2.5 text-right">Action</th></tr></thead>
            <tbody>
              {(loadingTable || isError || refreshingTable) && <tr><td colSpan={tableFields.length + 2} className="py-6 text-center text-[#5a6680]">{isError ? <>Resources and allocations could not be loaded. <button type="button" className="text-[#2f4bd8]" onClick={() => void refetch()}>Retry</button></> : loadingTable ? "Loading resources and allocations..." : "Refreshing resources and allocations..."}</td></tr>}
              {!isError && tableGroups.map((group, groupIndex) => <Fragment key={group.label || groupIndex}>{group.label && <tr className="h-[34px] bg-[#f7f9fc] text-xs font-semibold uppercase tracking-[.04em] text-[#5a6680] [&_td]:py-1.5"><td colSpan={tableFields.length + 2} className="px-4 py-2.5">{group.label}</td></tr>}{group.rows.map((row) => <tr key={row.id} className="group h-12 border-b border-[#e6eaf3] hover:bg-[#f7f9ff]" onClick={() => navigate(`/resources/${row.id}`)}><td className="w-11 min-w-11 px-3"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selectedIds.includes(row.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} onClick={(event) => event.stopPropagation()} /></td><td className="w-24 min-w-24 px-3 text-[#5a6680]">{fieldValue(pinnedFields[0], row, user)}</td><td className="w-44 min-w-44 border-r border-[#e6eaf3] px-3 font-semibold">{fieldValue(pinnedFields[1], row, user)}</td>{tableFields.slice(2).map((field) => <td key={field!.key} className="whitespace-nowrap px-3">{field!.key === "projectEndDate" && canEditEndDate(row) ? editingRowId === row.id ? <div onClick={(event) => event.stopPropagation()}><input autoFocus type="date" aria-label={`Project end date for ${row.name}`} aria-invalid={Boolean(endDateError)} disabled={savingEndDate} className="rounded border border-[#2f4bd8] px-2 py-1 outline-none ring-2 ring-[#2f4bd8]/20" value={editingEndDate} onChange={(event) => { setEditingEndDate(event.target.value); setEndDateError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void saveInlineEndDate(row); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!savingEndDate) setEditingRowId(null); } }} />{endDateError && <p role="alert" className="max-w-64 whitespace-normal text-xs text-red-600">{endDateError}</p>}</div> :
                <button type="button" aria-label={`Edit project end date for ${row.name}`} className="border-b border-dashed border-[#7d89a3] text-[#2f4bd8] focus:outline-none focus:ring-2 focus:ring-[#2f4bd8]/20" onClick={(event) => { event.stopPropagation(); if (savingEndDate) return; setEditingRowId(row.id); setEditingEndDate(row.currentAllocation?.endDate?.slice(0, 10) ?? ""); setEndDateError(""); }}>{field!.formatValue(fieldValue(field!, row, user), row)}</button> : field!.key === "status" ? <span className={`inline-block rounded-xl px-2.5 py-[3px] text-xs font-semibold ${STATUS_STYLES[row.status] ?? "bg-[#eef1f7] text-[#4a5670]"}`}>{STATUS_LABELS[row.status] ?? row.status.replace(/_/g, " ")}</span> : field!.key === "daysToBench" && row.daysToBench != null ? <span className={`inline-block rounded-xl px-[9px] py-[3px] text-xs font-semibold tabular-nums ${row.daysToBench <= 30 ? "bg-[#fde8e4] text-[#b4380a]" : row.daysToBench <= 60 ? "bg-[#fff4cc] text-[#7a5b00]" : "text-[#5a6680]"}`}>{row.daysToBench} d</span> : field!.key === "daysOnBench" && row.daysOnBench != null ? <span className={row.daysOnBench >= 30 ? "font-semibold text-[#b4380a]" : "text-[#5a6680]"}>{field!.formatValue(row.daysOnBench, row)}</span> : field!.formatValue(fieldValue(field!, row, user), row)}</td>)}<td className="px-3">{row.status === "ALLOCATED" ? canEditEndDate(row) && row.currentAllocation?.endDate ? <button type="button" className="rounded-[10px] border border-[#cdd5e3] bg-white px-3 py-2 text-xs text-[#2f4bd8]" onClick={(event) => { event.stopPropagation(); setExtensionRow(row); }}>Extend</button> : null : canAllocateResource(user, row) ? <button type="button" className="rounded-[10px] border border-[#cdd5e3] bg-white px-3 py-2 text-xs text-[#2f4bd8]" onClick={(event) => { event.stopPropagation(); setAllocationResource(row); }}>Allocate</button> : null}</td></tr>)}</Fragment>)}
              {!loadingTable && !isError && tableRows.length === 0 && <tr><td colSpan={tableFields.length + 2} className="py-6 text-center text-[#5a6680]">{data?.total === 0 ? "No resources available." : "No resources match these filters."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      </div>
      {toast && <div role="status" className="fixed bottom-6 right-6 z-50 rounded-[10px] bg-[#157347] px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
      {extensionRow && <ExtendAllocationDialog key={extensionRow.currentAllocation?.id} row={extensionRow} onClose={() => setExtensionRow(null)} onSave={(endDate, reason) => saveEndDate(extensionRow, "extend", endDate, reason)} onAllocate={() => { setAllocationResource(extensionRow); setExtensionRow(null); }} />}
      {bulkExtensionOpen && <BulkExtendAllocationDialog rows={bulkExtensionRows} onClose={() => setBulkExtensionOpen(false)} onSave={saveBulkEndDate} />}
      {(allocationResource || creatingAllocation) && <AllocationModal resource={allocationResource ?? undefined} resources={allocationResource ? data?.resources ?? [] : []} mode="allocate" onClose={() => { setAllocationResource(null); setCreatingAllocation(false); }} />}
    </div>
  );
}
