import type { Allocation, AuthUser, Resource } from "../types";
import { validRange, type AgeingRange } from "./viewState";

export type FieldType = "text" | "number" | "select" | "date" | "boolean";
export type FieldValue = string | number | boolean | null;

export interface ResourceAllocationRow extends Resource {
  currentAllocation: Allocation | null;
  displayAllocations: Allocation[];
  expectedBenchDate: string | null;
  daysToBench: number | null;
  benchPriority: number;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  filterable: boolean;
  sortable: boolean;
  customizable: boolean;
  defaultVisible: boolean;
  defaultOrder: number;
  apiMapping: string;
  sensitive: boolean;
  permission: "read" | "allocation" | "cost" | "performance";
  getValue: (row: ResourceAllocationRow) => FieldValue;
  formatValue: (value: FieldValue, row: ResourceAllocationRow) => string;
}

const text = (value: unknown) => value == null || value === "" ? "—" : String(value);
const numeric = (value: unknown) => typeof value === "number" ? value : null;
const dateValue = (value: string | null | undefined) => value ? new Date(value).getTime() : null;

export function formatAgeing(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days < 60) return `${days} d`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days - years * 365 - months * 30;
  return [years ? `${years} y` : "", months ? `${months} m` : "", remainingDays ? `${remainingDays} d` : ""].filter(Boolean).join(" ") || "0 d";
}

function field(
  key: string,
  label: string,
  type: FieldType,
  defaultOrder: number,
  apiMapping: string,
  getValue: FieldDefinition["getValue"],
  options: Partial<Pick<FieldDefinition, "filterable" | "sortable" | "customizable" | "defaultVisible" | "sensitive">> = {},
  formatValue: FieldDefinition["formatValue"] = (value) => text(value),
): FieldDefinition {
  return { key, label, type, filterable: true, sortable: true, customizable: true, defaultVisible: defaultOrder > 0, defaultOrder, apiMapping, sensitive: false, permission: options.sensitive ? (key === "costRate" ? "cost" : "performance") : apiMapping.startsWith("allocation.") ? "allocation" : "read", getValue, formatValue, ...options };
}

export const FIELD_REGISTRY: FieldDefinition[] = [
  field("employeeId", "Emp ID", "text", 2, "resource.employeeId", (row) => row.employeeId),
  field("name", "Emp name", "text", 3, "resource.name", (row) => row.name),
  field("designation", "Role", "text", 4, "resource.designation", (row) => row.designation ?? null),
  field("status", "Status", "select", 5, "resource.status", (row) => row.status),
  field("daysOnBench", "Ageing", "number", 6, "resource.daysOnBench", (row) => numeric(row.daysOnBench), { filterable: false }, (value) => formatAgeing(typeof value === "number" ? value : null)),
  field("project", "Project", "select", 7, "allocation.project.name", (row) => row.displayAllocations.map((allocation) => allocation.project?.name ?? "—").join(", ") || null, {}, (value, row) => row.displayAllocations.length > 1 ? `${text(value)} (${row.displayAllocations.length} allocations)` : text(value)),
  field("projectEndDate", "Project end date", "date", 8, "allocation.endDate", (row) => dateValue(row.currentAllocation?.endDate), {}, (value) => typeof value === "number" ? new Date(value).toLocaleDateString("en-GB") : "—"),
  field("daysToBench", "Days to bench", "number", 9, "expectedBenchDate - today", (row) => numeric(row.daysToBench), {}, (value) => value == null ? "—" : `${value} d`),
  field("managerName", "Manager", "text", 10, "resource.managerName", (row) => row.managerName ?? null),
  field("allocationPercent", "Allocation %", "number", 0, "allocation.allocationPercent", (row) => numeric(row.currentAllocation?.allocationPercent), {}, (value) => value == null ? "—" : `${value}%`),
  field("roleOnProject", "Project role", "text", 0, "allocation.roleOnProject", (row) => row.currentAllocation?.roleOnProject ?? null, { customizable: false }),
  field("projectReportingManagerName", "Reporting manager", "text", 0, "allocation.projectReportingManagerName", (row) => row.currentAllocation?.projectReportingManagerName ?? null),
  field("allocationStartDate", "Start date", "date", 0, "allocation.startDate", (row) => dateValue(row.currentAllocation?.startDate), {}, (value, row) => row.currentAllocation?.startDate ? new Date(row.currentAllocation.startDate).toLocaleDateString() : "—"),
  field("allocationStatus", "Allocation status", "select", 0, "allocation.status", (row) => row.currentAllocation?.status ?? null),
  field("reallocated", "Reallocated", "boolean", 0, "allocation.reallocatedFromId", (row) => row.currentAllocation ? Boolean(row.currentAllocation.reallocatedFrom) : null, { customizable: false }),
  field("resourceLocation", "Location", "text", 0, "resource.location", (row) => row.workLocation || row.location, { customizable: false }),
  field("workLocation", "Work location", "text", 0, "resource.workLocation", (row) => row.workLocation ?? null),
  field("country", "Country", "text", 0, "resource.country", (row) => row.country ?? null),
  field("gender", "Gender", "select", 0, "resource.gender", (row) => row.gender ?? null),
  field("portfolio", "Portfolio / vertical", "select", 0, "resource.portfolio.name", (row) => row.portfolio?.name ?? null),
  field("subCategory", "Subcategory", "select", 0, "resource.subCategory", (row) => row.subCategory ?? null),
  field("skills", "Skills / Skillset", "text", 0, "resource.skills[].skill.name", (row) => row.skills.map((item) => item.skill.name).join(", ")),
  field("skillExperience", "Minimum skill experience (years)", "number", 0, "resource.skills[].yearsExperience", (row) => Math.max(0, ...row.skills.map((item) => item.yearsExperience)), { customizable: false }),
  field("taoExperience", "TAO experience (years)", "number", 0, "resource.taoExperienceYears", (row) => numeric(row.taoExperienceYears)),
  field("certifications", "Certification", "text", 0, "resource.certifications[].name", (row) => row.certifications.map((item) => item.name).join(", ")),
  field("willingToRelocate", "Willing to relocate", "boolean", 0, "resource.willingToRelocate", (row) => row.willingToRelocate, {}, (value) => value == null ? "—" : value ? "Yes" : "No"),
  field("costRate", "Cost rate", "number", 0, "resource.costRate", (row) => row.costRate == null ? null : Number(row.costRate), { sensitive: true }, (value, row) => value == null ? "—" : `${value} ${row.currency}`),
  field("email", "Email", "text", 0, "resource.email", (row) => row.email, { filterable: false, sortable: false }),
  field("dateOfJoining", "Date of joining", "date", 0, "resource.dateOfJoining", (row) => dateValue(row.dateOfJoining), {}, (value, row) => row.dateOfJoining ? new Date(row.dateOfJoining).toLocaleDateString() : "—"),
  field("priorExperienceYears", "Prior experience (years)", "number", 0, "resource.priorExperienceYears", (row) => numeric(row.priorExperienceYears)),
  field("totalYearsExperience", "Total experience (years)", "number", 0, "resource.totalYearsExperience", (row) => numeric(row.totalYearsExperience)),
  field("availablePercentForDeployment", "Available %", "number", 0, "resource.availablePercentForDeployment", (row) => numeric(row.availablePercentForDeployment), { customizable: false }, (value) => value == null ? "—" : `${value}%`),
  field("overallFte", "FTE", "number", 0, "resource.overallFte", (row) => numeric(row.overallFte), { customizable: false }),
  field("skillsProficiency", "Skill proficiency", "number", 0, "resource.skills[].proficiency", (row) => row.skills.length ? Math.max(...row.skills.map((item) => item.proficiency)) : null, { filterable: false, customizable: false }),
  field("certificationIssuer", "Certification issuer", "text", 0, "resource.certifications[].issuer", (row) => row.certifications.map((item) => item.issuer).filter(Boolean).join(", "), { filterable: false, customizable: false }),
  field("certificationIssueDate", "Certification issue date", "date", 0, "resource.certifications[].issueDate", (row) => row.certifications.map((item) => dateValue(item.issueDate)).filter((value): value is number => value !== null).sort((a, b) => b - a)[0] ?? null, { filterable: false, customizable: false }),
  field("certificationExpiryDate", "Certification expiry date", "date", 0, "resource.certifications[].expiryDate", (row) => row.certifications.map((item) => dateValue(item.expiryDate)).filter((value): value is number => value !== null).sort((a, b) => a - b)[0] ?? null, { filterable: false }),
  field("pipStatus", "PIP status", "boolean", 0, "resource.performanceRecords[].pipStatus", (row) => row.performanceRecords?.[0]?.pipStatus ?? null, { filterable: false, sortable: false, sensitive: true }, (value) => value == null ? "—" : value ? "Yes" : "No"),
];

export const DEFAULT_COLUMNS = FIELD_REGISTRY.filter((definition) => definition.defaultVisible).sort((a, b) => a.defaultOrder - b.defaultOrder).map((definition) => definition.key);
export const FIELD_BY_KEY = new Map(FIELD_REGISTRY.map((definition) => [definition.key, definition]));

export function canReadField(definition: FieldDefinition, user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return (definition.permission !== "cost" && definition.permission !== "performance") || ["ADMIN", "RMG", "HR"].includes(user.role);
}

export function fieldValue(definition: FieldDefinition, row: ResourceAllocationRow, user: AuthUser | null | undefined): FieldValue {
  if (!canReadField(definition, user)) return null;
  if ((definition.permission === "cost" || definition.permission === "performance") && user?.role === "RMG" && !user.authorizedPortfolioIds.includes(row.portfolioId)) return null;
  return definition.getValue(row);
}

export function joinResourceAllocations(resources: Resource[], readableAllocations: Allocation[]): Resource[] {
  const ids = new Set(resources.map((resource) => resource.id));
  const byResource = new Map<string, Allocation[]>();
  for (const { resource: _resource, ...allocation } of readableAllocations) {
    if (!ids.has(allocation.resourceId)) continue;
    const existing = byResource.get(allocation.resourceId) ?? [];
    if (!existing.some((entry) => entry.id === allocation.id)) byResource.set(allocation.resourceId, [...existing, allocation]);
  }
  return resources.map((resource) => {
    const readable = byResource.get(resource.id) ?? [];
    const hidden = (resource.allocations ?? []).some((allocation) => !readable.some((entry) => entry.id === allocation.id));
    return {
      ...resource,
      allocations: readable,
      projectedBenchStartDate: hidden ? null : resource.projectedBenchStartDate,
    };
  });
}

export function getExpectedBenchDate(resource: Resource): string | null {
  const active = (resource.allocations ?? []).filter((allocation) => allocation.status === "ACTIVE");
  if (active.length !== 1 || (resource.allocations ?? []).length !== 1 || !active[0].endDate) return null;
  if (resource.projectedBenchStartDate === null) return null;
  const expected = new Date(active[0].endDate);
  if (!Number.isFinite(expected.getTime())) return null;
  expected.setUTCDate(expected.getUTCDate() + 1);
  return expected.toISOString();
}

export function toResourceAllocationRow(resource: Resource, today = new Date(), windowDays = 60): ResourceAllocationRow {
  const allocations = (resource.allocations ?? []).filter((allocation) => allocation.status === "ACTIVE" || allocation.status === "SCHEDULED").sort((a, b) => a.status === b.status ? Date.parse(a.startDate) - Date.parse(b.startDate) || a.id.localeCompare(b.id) : a.status === "ACTIVE" ? -1 : 1);
  const selected = allocations.length === 1 ? allocations[0] : null;
  const expectedBenchDate = getExpectedBenchDate({ ...resource, allocations });
  const daysToBench = expectedBenchDate ? Math.round((Date.parse(expectedBenchDate.slice(0, 10)) - Date.parse(today.toISOString().slice(0, 10))) / 86400000) : null;
  return { ...resource, allocations, displayAllocations: allocations, currentAllocation: selected, expectedBenchDate, daysToBench, benchPriority: getBenchPriority(resource.status, resource.daysOnBench ?? null, daysToBench, windowDays) };
}

export function getBenchPriority(status: Resource["status"], daysOnBench: number | null, daysToBench: number | null, windowDays = 60): number {
  if (status === "BENCH_COMMITTED" || status === "BENCH_TRUE") return 0;
  if (status === "ALLOCATED" && daysToBench !== null && daysToBench >= 0 && daysToBench <= windowDays) return 1;
  return 2;
}

export function matchesAgeing(days: number | null | undefined, range: AgeingRange): boolean {
  if (range === "all") return true;
  if (days == null || !Number.isFinite(days)) return false;
  if (range === "0-30") return days >= 0 && days <= 30;
  if (range === "31-60") return days >= 31 && days <= 60;
  if (range === "60+") return days > 60;
  return (range.min === "" && range.max === "" || validRange(range, "number")) && (range.min === "" || days >= Number(range.min)) && (range.max === "" || days <= Number(range.max));
}

export function isMovingToBench(row: ResourceAllocationRow, windowDays = 60): boolean {
  return row.status === "ALLOCATED" && row.daysToBench !== null && row.daysToBench >= 0 && row.daysToBench <= windowDays;
}

export function compareRows(a: ResourceAllocationRow, b: ResourceAllocationRow, key: string, direction: "asc" | "desc", user?: AuthUser | null): number {
  if (key === "benchPriority") {
    return a.benchPriority - b.benchPriority ||
      (a.benchPriority === 0 ? (b.daysOnBench ?? -1) - (a.daysOnBench ?? -1) :
        a.benchPriority === 1 ? (a.daysToBench ?? Infinity) - (b.daysToBench ?? Infinity) : a.name.localeCompare(b.name));
  }
  const definition = FIELD_BY_KEY.get(key);
  if (!definition || !definition.sortable || !canReadField(definition, user)) return 0;
  const left = fieldValue(definition, a, user);
  const right = fieldValue(definition, b, user);
  if (left == null || right == null) return left == null && right == null ? 0 : left == null ? 1 : -1;
  const natural = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  return natural * (direction === "desc" ? -1 : 1);
}

export function matchesFilter(row: ResourceAllocationRow, filter: { key: string; operator: string; value: unknown }, user?: AuthUser | null): boolean {
  const definition = FIELD_BY_KEY.get(filter.key);
  if (!definition || !definition.filterable || !canReadField(definition, user)) return true;
  const actual = fieldValue(definition, row, user);
  const value = filter.value;
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return true;
  if (definition.type === "number" || definition.type === "date") {
    if (actual == null || typeof actual !== "number" || !Number.isFinite(actual) || !validRange(value, definition.type)) return false;
    return (value.min === "" || actual >= (definition.type === "date" ? Date.parse(value.min) : Number(value.min))) && (value.max === "" || actual <= (definition.type === "date" ? Date.parse(value.max) + 86400000 - 1 : Number(value.max)));
  }
  if (definition.type === "boolean") return actual != null && String(actual) === String(value);
  if (definition.key === "skills" || definition.key === "certifications") {
    const entries = (definition.key === "skills" ? row.skills.map((item) => item.skill.name) : row.certifications.map((item) => item.name)).map((entry) => entry.toLocaleLowerCase());
    if (!Array.isArray(value) || !value.length) return false;
    const matches = (tag: unknown) => typeof tag === "string" && entries.some((entry) => entry.includes(tag.toLocaleLowerCase()));
    return filter.operator === "all" ? value.every(matches) : value.some(matches);
  }
  const normalized = String(actual ?? "").toLocaleLowerCase();
  const expectedValues = Array.isArray(value) ? value.map((entry) => String(entry).toLocaleLowerCase()) : [String(value).toLocaleLowerCase()];
  if (definition.type === "select") return actual != null && expectedValues.some((expected) => definition.key === "project" ? row.displayAllocations.some((allocation) => allocation.project?.name.toLocaleLowerCase() === expected) : normalized === expected);
  if (filter.operator === "all") return expectedValues.every((expected) => normalized.includes(expected));
  if (filter.operator === "any" && Array.isArray(value)) return expectedValues.some((expected) => normalized.includes(expected));
  return filter.operator === "exact" ? normalized === expectedValues[0] : normalized.includes(expectedValues[0] ?? "");
}
