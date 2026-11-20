import { describe, expect, it } from "vitest";
import { Allocation, AuthUser, Resource } from "../types";
import { FIELD_BY_KEY, canReadField, compareRows, fieldValue, getExpectedBenchDate, isMovingToBench, joinResourceAllocations, matchesAgeing, matchesFilter, toResourceAllocationRow } from "./fields";
import { normalizeFilters, normalizePreferences, validRange } from "./viewState";
import { filterSummary, quickDateRange } from "./FilterControls";
import { canAllocateResource, canEditAllocations } from "../context/AuthContext";

const user: AuthUser = { id: "u", email: "a@b.c", name: "A", role: "RMG", authorizedPortfolioIds: ["p"] };
const allocation = (id: string, status: Allocation["status"], endDate: string | null = "2026-11-20T00:00:00.000Z"): Allocation => ({ id, resourceId: "r", projectId: id, portfolioId: "p", allocationPercent: 50, startDate: "2026-01-01T00:00:00.000Z", endDate, status, notes: null, taskId: null, project: { id, name: id, code: id, portfolioId: "p", status: "ACTIVE", startDate: "2026-01-01", endDate: null } });
const resource = (allocations: Allocation[], extra: Partial<Resource> = {}): Resource => ({ id: "r", employeeId: "E1", name: "Alice", email: "a@b.c", location: "Remote", willingToRelocate: false, costRate: "100", currency: "USD", portfolioId: "p", status: "ALLOCATED", benchSince: null, sourceSystem: "x", portfolio: { id: "p", name: "P", code: "P" }, skills: [], certifications: [], allocations, daysOnBench: null, ...extra });

describe("allocation action permissions", () => {
  it("requires lifecycle roles and every involved portfolio", () => {
    expect(canEditAllocations(null)).toBe(false);
    for (const role of ["DELIVERY", "HR", "TA", "VIEWER"] as const) expect(canEditAllocations({ ...user, role }, ["p"])).toBe(false);
    expect(canEditAllocations(user, ["p"])).toBe(true);
    expect(canEditAllocations(user, ["p", "other"])).toBe(false);
    expect(canEditAllocations({ ...user, role: "ADMIN" }, ["other"])).toBe(true);
  });
  it("excludes terminated, maternity leave and unauthorized employees", () => {
    expect(canAllocateResource(user, resource([]))).toBe(true);
    expect(canAllocateResource(user, resource([], { portfolioId: "other" }))).toBe(false);
    for (const status of ["ON_ML", "TERMINATED"] as const) expect(canAllocateResource(user, resource([], { status }))).toBe(false);
  });
});

describe("resource allocation projection", () => {
  it("keeps all assignments in one employee row without choosing an ambiguous edit target", () => {
    const row = toResourceAllocationRow(resource([allocation("A", "ACTIVE"), allocation("B", "ACTIVE")]));
    expect(row.displayAllocations).toHaveLength(2);
    expect(row.currentAllocation).toBeNull();
    expect(fieldValue(FIELD_BY_KEY.get("project")!, row, user)).toBe("A, B");
    expect(fieldValue(FIELD_BY_KEY.get("projectEndDate")!, row, user)).toBeNull();
    expect(row.daysToBench).toBeNull();
    expect(matchesFilter(row, { key: "project", operator: "contains", value: ["B"] }, user)).toBe(true);
    expect(row.allocations).toHaveLength(2);
    const mixed = toResourceAllocationRow(resource([allocation("A", "ACTIVE"), allocation("B", "SCHEDULED")]));
    expect(mixed.currentAllocation).toBeNull();
    expect(mixed.daysToBench).toBeNull();
  });
  it("uses end plus one day for an unambiguous active allocation, honoring a server null projection", () => {
    const single = resource([allocation("A", "ACTIVE")]);
    expect(getExpectedBenchDate(single)).toBe("2026-11-21T00:00:00.000Z");
    expect(getExpectedBenchDate({ ...single, projectedBenchStartDate: null })).toBeNull();
    expect(getExpectedBenchDate(resource([allocation("A", "ACTIVE"), allocation("B", "SCHEDULED")]))).toBeNull();
    expect(getExpectedBenchDate(resource([allocation("A", "ACTIVE"), allocation("B", "ACTIVE")]))).toBeNull();
    const row = toResourceAllocationRow(single, new Date("2026-11-11T12:00:00Z"));
    expect(row.daysToBench).toBe(10);
    expect(isMovingToBench(row)).toBe(true);
    expect(row.currentAllocation?.id).toBe("A");
    expect(toResourceAllocationRow(resource([allocation("S", "SCHEDULED")])).currentAllocation?.id).toBe("S");
  });
  it("keeps only scoped allocations and does not expose nested resource data or infer hidden handoffs", () => {
    const scoped = { ...allocation("A", "ACTIVE"), resource: resource([], { costRate: "secret" }) };
    const hidden = allocation("B", "SCHEDULED");
    const [joined] = joinResourceAllocations([resource([scoped, hidden], { projectedBenchStartDate: "2026-11-20T00:00:00.000Z" })], [scoped, scoped]);
    expect(joined.allocations).toHaveLength(1);
    expect(joined.allocations?.[0].resource).toBeUndefined();
    expect(joined.projectedBenchStartDate).toBeNull();
    expect(toResourceAllocationRow(joined).daysToBench).toBeNull();
    expect(joinResourceAllocations([resource([scoped])], [])[0].allocations).toEqual([]);
  });
  it("uses inclusive moving boundaries and consistent bench ordering", () => {
    const today = new Date("2026-11-11T12:00:00Z");
    const make = (days: number) => toResourceAllocationRow(resource([allocation("A", "ACTIVE", new Date(Date.UTC(2026, 10, 10 + days)).toISOString())]), today);
    expect(isMovingToBench(make(0))).toBe(true);
    expect(isMovingToBench(make(60))).toBe(true);
    expect(isMovingToBench(make(61))).toBe(false);
    expect(isMovingToBench(make(-1))).toBe(false);
    const bench = (name: string, daysOnBench: number | null) => toResourceAllocationRow(resource([], { name, status: "BENCH_TRUE", daysOnBench }), today);
    expect([bench("unknown", null), bench("older", 30), bench("younger", 5), make(60), make(0)].sort((a, b) => compareRows(a, b, "benchPriority", "asc", user)).map((row) => row.name === "Alice" ? row.daysToBench : row.name)).toEqual(["older", "younger", "unknown", 0, 60]);
  });
  it("groups bench status even with missing server ageing, but excludes missing ageing from ranges", () => {
    expect(toResourceAllocationRow(resource([], { status: "BENCH_TRUE" })).benchPriority).toBe(0);
    expect(matchesAgeing(null, "all")).toBe(true);
    expect(matchesAgeing(null, "0-30")).toBe(false);
  });
  it("applies multi-select OR and does not coerce unknown numbers to zero", () => {
    const row = toResourceAllocationRow(resource([]));
    expect(matchesFilter(row, { key: "status", operator: "contains", value: ["BENCH_TRUE", "ALLOCATED"] }, user)).toBe(true);
    expect(matchesFilter(row, { key: "daysToBench", operator: "range", value: { min: "0", max: "0" } }, user)).toBe(false);
  });
  it("combines OR inside select and statuses with AND across search, ageing and fields", () => {
    const rows = [resource([], { status: "BENCH_TRUE", daysOnBench: 30, subCategory: "A" }), resource([], { id: "r2", status: "ALLOCATED", daysOnBench: 61, subCategory: "B" }), resource([], { id: "r3", status: "ON_ML", daysOnBench: 45, subCategory: "A" })].map((item) => toResourceAllocationRow(item));
    const filters = [{ key: "subCategory", operator: "contains", value: ["A", "B"] }, { key: "name", operator: "contains", value: "ali" }];
    expect(rows.filter((row) => ["BENCH_TRUE", "ALLOCATED"].includes(row.status) && matchesAgeing(row.daysOnBench, "0-30") && filters.every((filter) => matchesFilter(row, filter, user))).map((row) => row.id)).toEqual(["r"]);
    expect(matchesAgeing(60, "31-60")).toBe(true);
    expect(matchesAgeing(60, "60+")).toBe(false);
    expect(matchesAgeing(61, "60+")).toBe(true);
  });
  it("handles distinct tag values, missing ranges and inclusive dates", () => {
    const row = toResourceAllocationRow(resource([allocation("A", "ACTIVE")], { skills: [{ skill: { id: "s", name: "React" }, yearsExperience: 2, proficiency: 3 }] as Resource["skills"], certifications: [{ id: "c", name: "AWS", issuer: null, issueDate: null, expiryDate: null }] as Resource["certifications"] }));
    expect(matchesFilter(row, { key: "skills", operator: "all", value: ["React", "AWS"] }, user)).toBe(false);
    expect(matchesFilter(row, { key: "skills", operator: "any", value: ["React", "AWS"] }, user)).toBe(true);
    expect(matchesFilter(row, { key: "certifications", operator: "all", value: ["AWS"] }, user)).toBe(true);
    expect(matchesFilter(row, { key: "projectEndDate", operator: "range", value: { min: "2026-11-20", max: "2026-11-20" } }, user)).toBe(true);
    expect(matchesFilter(row, { key: "daysOnBench", operator: "range", value: { min: "0", max: "1" } }, user)).toBe(true);
    expect(matchesFilter(row, { key: "taoExperience", operator: "range", value: { min: "0", max: "0" } }, user)).toBe(false);
  });
  it("gates cost fields per role and authorized portfolio in values, filters, and sort", () => {
    const row = toResourceAllocationRow(resource([]));
    const outsider = { ...user, authorizedPortfolioIds: [] };
    expect(fieldValue(FIELD_BY_KEY.get("costRate")!, row, outsider)).toBeNull();
    expect(matchesFilter(row, { key: "costRate", operator: "range", value: { min: 0, max: 200 } }, outsider)).toBe(false);
    expect(compareRows(row, toResourceAllocationRow(resource([], { costRate: "5" })), "costRate", "asc", outsider)).toBe(0);
    expect(canReadField(FIELD_BY_KEY.get("costRate")!, { ...user, role: "VIEWER" })).toBe(false);
  });
});

describe("view preferences", () => {
  it("rejects invalid bounds and sanitizes persisted filters and obsolete options", () => {
    expect(validRange({ min: "", max: "0" }, "number")).toBe(true);
    expect(validRange({ min: "10", max: "2" }, "number")).toBe(false);
    expect(validRange({ min: " ", max: "2" }, "number")).toBe(false);
    expect(validRange({ min: "", max: "" }, "date")).toBe(false);
    expect(validRange({ min: "2026-02-30", max: "" }, "date")).toBe(false);
    expect(normalizeFilters([{ key: "status", operator: "contains", value: ["AVAILABLE", "OLD", "ALLOCATED", "TERMINATED"] }, { key: "costRate", operator: "range", value: { min: "0", max: "200" } }, { key: "name", operator: "bad", value: "Alice" }, { key: "projectEndDate", operator: "range", value: { min: "2026-12-01", max: "2026-01-01" } }, { key: "email", operator: "contains", value: "private" }], { ...user, role: "VIEWER" }, { status: ["BENCH_TRUE", "ALLOCATED", "TERMINATED"] })).toEqual([{ key: "status", operator: "contains", value: ["ALLOCATED", "TERMINATED"] }]);
    expect(normalizeFilters([{ key: "costRate", operator: "range", value: { min: "0", max: "200" } }], { ...user, authorizedPortfolioIds: [] })).toHaveLength(1);
    expect(filterSummary({ key: "projectEndDate", operator: "range", value: { min: "2026-11-01", max: "" } }, FIELD_BY_KEY.get("projectEndDate")!)).toBe("01/11/2026 – Any");
    expect(quickDateRange("last", 1, new Date(2026, 10, 11))).toEqual({ min: "2025-11-11", max: "2026-11-11" });
    expect(quickDateRange("next", 30, new Date(2026, 10, 11))).toEqual({ min: "2026-11-11", max: "2026-12-11" });
  });
  it("recovers malformed and obsolete keys, unsafe directions and unauthorized fields", () => {
    expect(normalizePreferences(null, user).columns).toContain("name");
    const result = normalizePreferences({ columns: ["costRate", "costRate", "obsolete", 3], sort: [{ key: "obsolete", direction: "asc" }, { key: "costRate", direction: "sideways" }, { key: "name", direction: "desc" }] }, { ...user, role: "VIEWER" });
    expect(result.columns).not.toContain("costRate");
    expect(result.columns).toContain("employeeId");
    expect(result.sort).toEqual([{ key: "name", direction: "desc" }]);
  });
  it("removes non-customizable saved columns while keeping their sort behavior", () => {
    const result = normalizePreferences({
      columns: ["employeeId", "name", "roleOnProject", "reallocated", "resourceLocation", "skillExperience", "availablePercentForDeployment", "overallFte", "skillsProficiency", "certificationIssuer", "certificationIssueDate"],
      sort: [{ key: "roleOnProject", direction: "asc" }],
    }, user);
    expect(result.columns).toEqual(["employeeId", "name"]);
    expect(result.sort).toEqual([{ key: "roleOnProject", direction: "asc" }]);
  });
});
