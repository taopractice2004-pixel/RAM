import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser, ResourceStatus } from "../types";
import { canReadField, DEFAULT_COLUMNS, FIELD_BY_KEY } from "./fields";

export type AgeingRange = "all" | "0-30" | "31-60" | "60+" | { min: string; max: string };
export interface SortRule { key: string; direction: "asc" | "desc" }
export interface FieldFilter { key: string; operator: string; value: unknown }

export function validRange(value: unknown, type: "number" | "date"): value is { min: string; max: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { min, max } = value as Record<string, unknown>;
  const validDate = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(input)) && new Date(input).toISOString().slice(0, 10) === input;
  const valid = (input: unknown) => typeof input === "string" && (input === "" || (type === "number" ? input.trim() !== "" && Number.isFinite(Number(input)) : validDate(input)));
  if (!valid(min) || !valid(max)) return false;
  if (min === "" && max === "") return false;
  return min === "" || max === "" || (type === "number" ? Number(min) <= Number(max) : String(min) <= String(max));
}

export function normalizeFilters(input: unknown, user: AuthUser | null | undefined, options?: Record<string, string[]>): FieldFilter[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap((item): FieldFilter[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { key, operator, value } = item as Record<string, unknown>;
    if (typeof key !== "string" || seen.has(key)) return [];
    const field = FIELD_BY_KEY.get(key);
    if (!field?.filterable || !canReadField(field, user) || typeof operator !== "string") return [];
    let normalized: FieldFilter | null = null;
    if (field.type === "number" || field.type === "date") {
      if (operator === "range" && validRange(value, field.type)) normalized = { key, operator, value };
    } else if (field.type === "boolean") {
      if (operator === "exact" && (value === "true" || value === "false")) normalized = { key, operator, value };
    } else if (field.type === "select") {
      const allowed = options?.[key];
      if (operator === "contains" && Array.isArray(value)) {
        const selected = [...new Set(value.filter((entry): entry is string => typeof entry === "string" && (!allowed || allowed.includes(entry))))];
        if (selected.length) normalized = { key, operator, value: selected };
      }
    } else if (key === "skills" || key === "certifications") {
      if ((operator === "all" || operator === "any") && Array.isArray(value)) {
        const tags = [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()))];
        if (tags.length) normalized = { key, operator, value: tags };
      }
    } else if ((operator === "contains" || operator === "exact") && typeof value === "string" && value.trim() && key !== "email") normalized = { key, operator, value: value.trim() };
    if (!normalized) return [];
    seen.add(key);
    return [normalized];
  });
}
export interface ResourceAllocationViewState {
  search: string;
  statuses: ResourceStatus[];
  ageingRange: AgeingRange;
  columns: string[];
  sort: SortRule[];
  filters: FieldFilter[];
  expanded: boolean;
}

export function defaultViewState(): ResourceAllocationViewState {
  return { search: "", statuses: [], ageingRange: "all", columns: [...DEFAULT_COLUMNS], sort: [{ key: "benchPriority", direction: "asc" }], filters: [], expanded: false };
}

function storageKey(userId: string) { return `resources-allocations-view:${userId}`; }
function keyIsPersistable(key: string) { return key !== "costRate"; }

export function normalizePreferences(input: unknown, user: AuthUser | null | undefined): Pick<ResourceAllocationViewState, "columns" | "sort"> {
  const defaults = defaultViewState();
  if (!input || typeof input !== "object" || Array.isArray(input)) return { columns: defaults.columns.filter((key) => {
    const field = FIELD_BY_KEY.get(key);
    return !!field?.customizable && canReadField(field, user);
  }), sort: defaults.sort };
  const value = input as Record<string, unknown>;
  const allowed = (key: string) => { const field = FIELD_BY_KEY.get(key); return !!field && canReadField(field, user); };
  const allowedColumn = (key: string) => { const field = FIELD_BY_KEY.get(key); return !!field?.customizable && canReadField(field, user); };
  const columns = Array.isArray(value.columns) ? value.columns.filter((key): key is string => typeof key === "string" && allowedColumn(key)) : [];
  const validSort = (rule: unknown): rule is SortRule => {
    if (!rule || typeof rule !== "object") return false;
    const entry = rule as Record<string, unknown>;
    return typeof entry.key === "string" && (entry.key === "benchPriority" || (allowed(entry.key) && FIELD_BY_KEY.get(entry.key)!.sortable)) && (entry.direction === "asc" || entry.direction === "desc");
  };
  const sort = Array.isArray(value.sort) ? value.sort.filter(validSort) : [];
  const uniqueSort = sort.filter((rule, index) => sort.findIndex((item) => item.key === rule.key) === index);
  return {
    columns: Array.from(new Set(["employeeId", "name", ...(columns.length ? columns : defaults.columns)])).filter(allowedColumn),
    sort: uniqueSort.length ? uniqueSort : defaults.sort,
  };
}

function readViewState(user: AuthUser | null | undefined): ResourceAllocationViewState {
  const defaults = defaultViewState();
  if (!user) return defaults;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(user.id)) ?? "null");
    return { ...defaults, ...normalizePreferences(stored, user), filters: normalizeFilters(stored?.filters, user).filter((filter) => keyIsPersistable(filter.key)) };
  } catch {
    return defaults;
  }
}

export function useResourceAllocationViewState(user: AuthUser | null | undefined) {
  const identity = user ? JSON.stringify([user.id, user.role, [...user.authorizedPortfolioIds].sort()]) : "";
  const [snapshot, setSnapshot] = useState(() => ({ identity, state: readViewState(user) }));
  const state = snapshot.identity === identity ? snapshot.state : readViewState(user);
  useEffect(() => {
    if (snapshot.identity !== identity) setSnapshot({ identity, state: readViewState(user) });
  }, [identity, snapshot.identity, user]);
  useEffect(() => {
    if (!user || snapshot.identity !== identity) return;
    try {
      localStorage.setItem(storageKey(user.id), JSON.stringify({ ...normalizePreferences(state, user), filters: normalizeFilters(state.filters, user).filter((filter) => keyIsPersistable(filter.key)) }));
    } catch {
      return;
    }
  }, [identity, snapshot.identity, state.columns, state.sort, state.filters, user]);
  const update = useCallback((patch: Partial<ResourceAllocationViewState>) => setSnapshot((current) => current.identity === identity ? { identity, state: { ...current.state, ...patch } } : { identity, state: { ...readViewState(user), ...patch } }), [identity, user]);
  const resetToDefault = useCallback(() => setSnapshot({ identity, state: defaultViewState() }), [identity]);
  return useMemo(() => ({ state, update, resetToDefault }), [state, update, resetToDefault]);
}
