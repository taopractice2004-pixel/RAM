import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldDefinition } from "./fields";
import { FieldFilter, validRange } from "./viewState";

interface Props {
  fields: FieldDefinition[];
  filters: FieldFilter[];
  onChange: (filters: FieldFilter[]) => void;
  onClose: () => void;
  optionValues: Record<string, string[]>;
}

const GROUPS = [
  { label: "Text", types: ["text"] },
  { label: "Number", types: ["number"] },
  { label: "Pick list", types: ["select"] },
  { label: "Date", types: ["date"] },
  { label: "Yes/No", types: ["boolean"] },
] as const;

function defaultValue(field: FieldDefinition): unknown {
  if (field.type === "number" || field.type === "date") return { min: "", max: "" };
  if (field.type === "select" || ["skills", "certifications"].includes(field.key)) return [];
  if (field.type === "boolean") return "";
  return "";
}

export function filterSummary(filter: FieldFilter, field: FieldDefinition): string {
  const label = (value: string) => field.key === "status" || field.key === "allocationStatus" || field.key === "gender" ? value.replace(/_/g, " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()) : value;
  if (Array.isArray(filter.value)) return filter.value.length > 1 ? `${label(String(filter.value[0]))} +${filter.value.length - 1}` : label(String(filter.value[0] ?? ""));
  if (filter.value && typeof filter.value === "object") {
    const range = filter.value as { min?: string; max?: string };
    const format = (value: string) => field.type === "date" && value ? value.split("-").reverse().join("/") : value || "Any";
    return `${format(String(range.min ?? ""))} – ${format(String(range.max ?? ""))}`;
  }
  if (field.type === "boolean") return filter.value === "true" ? "Yes" : "No";
  return `${filter.operator === "exact" ? "= " : ""}${String(filter.value ?? "")}`;
}

export function quickDateRange(kind: "last" | "next", amount: number, today = new Date()): { min: string; max: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  if (kind === "last") start.setFullYear(start.getFullYear() - amount);
  else end.setDate(end.getDate() + amount);
  const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { min: local(start), max: local(end) };
}

export default function FilterControls({ fields, filters, onChange, onClose, optionValues }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [optionSearch, setOptionSearch] = useState("");
  const [draft, setDraft] = useState<FieldFilter | null>(null);
  const [tagEntry, setTagEntry] = useState("");
  const [error, setError] = useState("");
  const pickerButton = useRef<HTMLButtonElement>(null);
  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const editingField = draft ? fieldMap.get(draft.key) : undefined;
  const closeDialog = useCallback(() => {
    setPickerOpen(false);
    setPickerSearch("");
    setOptionSearch("");
    setDraft(null);
    setTagEntry("");
    setError("");
    onClose();
    pickerButton.current?.focus();
  }, [onClose]);

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerOpen, closeDialog]);

  useEffect(() => {
    if (!pickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [pickerOpen]);

  function openEditor(field: FieldDefinition, index: number | null) {
    setDraft(index === null ? { key: field.key, operator: ["skills", "certifications"].includes(field.key) ? "any" : field.type === "number" || field.type === "date" ? "range" : field.type === "boolean" ? "exact" : "contains", value: defaultValue(field) } : { ...filters[index] });
    setPickerOpen(true);
    setOptionSearch("");
    setTagEntry("");
    setError("");
  }

  function apply(next: FieldFilter) {
    const field = fieldMap.get(next.key);
    if (!field) return;
    if (["skills", "certifications"].includes(field.key) && tagEntry.trim() && Array.isArray(next.value)) next = { ...next, value: [...next.value, tagEntry.trim()] };
    if ((field.type === "number" || field.type === "date") && !validRange(next.value, field.type)) {
      setError("Enter a valid range with at least one bound (minimum must not exceed maximum).");
      return;
    }
    const updated = filters.filter((filter) => filter.key !== next.key);
    const empty = next.value === "" || Array.isArray(next.value) && next.value.length === 0;
    if (!empty) updated.push(next);
    onChange(updated);
    closeDialog();
  }

  function updateDraft(value: unknown, operator = draft?.operator) {
    if (!draft) return;
    const updated = { ...draft, value, operator: operator ?? draft.operator };
    setDraft(updated);
    setError("");
  }

  function addTag(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !tagEntry.trim() || !draft || !Array.isArray(draft.value)) return;
    event.preventDefault();
    updateDraft([...draft.value, tagEntry.trim()]);
    setTagEntry("");
  }

  function applyQuickDate(years: number) {
    if (draft) updateDraft(quickDateRange("last", years), "range");
  }

  function applyNextDate(days: number) {
    if (draft) updateDraft(quickDateRange("next", days), "range");
  }

  return <div className="relative flex flex-wrap items-center gap-2">
    {filters.map((filter, index) => {
      const field = fieldMap.get(filter.key);
      if (!field) return null;
      return <span key={`${filter.key}-${index}`} className="inline-flex h-[34px] items-center gap-2 rounded-full bg-[#e8edff] px-3 text-xs text-[#243aa8]">
        <button type="button" onClick={() => openEditor(field, index)}>{field.label}: <strong>{filterSummary(filter, field)}</strong></button>
        <button type="button" aria-label={`Remove ${field.label} filter`} onClick={() => onChange(filters.filter((_, itemIndex) => itemIndex !== index))}>×</button>
      </span>;
    })}
    <button ref={pickerButton} type="button" className="h-10 rounded-[10px] border border-[#cdd5e3] bg-white px-3 text-sm" aria-expanded={pickerOpen} aria-haspopup="dialog" onClick={() => { setPickerOpen(true); setPickerSearch(""); setOptionSearch(""); setDraft(null); }}>＋ Add filter</button>
    {filters.length > 0 && <button type="button" className="h-[34px] px-2 text-sm text-[#2f4bd8]" onClick={() => onChange([])}>Clear all</button>}
    {pickerOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title" className="flex h-[min(82vh,42rem)] max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#dbe1ee] bg-white text-slate-800 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#e6eaf3] px-5 py-4">
          <div>
            <h2 id="filter-dialog-title" className="text-lg font-semibold">{draft && filters.some((filter) => filter.key === draft.key) ? "Edit filter" : "Add filter"}</h2>
            <p className="mt-1 text-sm text-[#5a6680]">Choose a field, then set the values to filter by.</p>
          </div>
          <button type="button" aria-label="Close filter dialog" className="rounded-lg px-2 py-1 text-xl text-[#5a6680] hover:bg-[#f1f3f8]" onClick={closeDialog}>×</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,0.8fr)_minmax(0,1.2fr)] overflow-hidden md:grid-cols-[minmax(230px,0.8fr)_minmax(0,1.2fr)] md:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-[#e6eaf3] p-4 md:border-b-0 md:border-r">
            <input autoFocus aria-label="Search filter fields" className="w-full rounded-lg border border-[#cdd5e3] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2f4bd8]/20" placeholder="Search fields" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} />
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {GROUPS.map((group) => {
                const groupFields = fields.filter((field) => group.types.includes(field.type as never) && field.label.toLowerCase().includes(pickerSearch.toLowerCase()));
                return groupFields.length ? <div key={group.label} className="mb-3">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#5a6680]">{group.label}</p>
                  {groupFields.map((field) => {
                    const active = filters.some((filter) => filter.key === field.key);
                    return <button key={field.key} type="button" aria-pressed={draft?.key === field.key} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${draft?.key === field.key ? "bg-[#e8edff] font-semibold text-[#243aa8]" : "hover:bg-[#f7f9fc]"}`} onClick={() => { const index = filters.findIndex((filter) => filter.key === field.key); openEditor(field, index >= 0 ? index : null); }}>
                      <span>{field.label}</span>
                      {active && <span className="ml-2 rounded-full bg-[#edf6f1] px-2 py-0.5 text-[10px] font-semibold text-[#28734f]">Active</span>}
                    </button>;
                  })}
                </div> : null;
              })}
              {!fields.some((field) => field.label.toLowerCase().includes(pickerSearch.toLowerCase())) && <p className="px-2 py-4 text-sm text-[#778196]">No matching fields.</p>}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto p-5">
            {draft && editingField ? <>
              <div className="mb-4 border-b border-[#eef1f7] pb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6680]">Filter field</p>
                <h3 className="mt-1 text-base font-semibold">{editingField.label}</h3>
              </div>
              {editingField.type === "text" && <div className="space-y-3">
                {!["skills", "certifications"].includes(draft.key) && <select aria-label="Text match mode" className="input" value={draft.operator} onChange={(event) => updateDraft(draft.value, event.target.value)}><option value="contains">Contains</option><option value="exact">Exact match</option></select>}
                {["skills", "certifications"].includes(draft.key)
                  ? <><div className="flex flex-wrap gap-1">{(draft.value as string[]).map((tag, index) => <button key={`${tag}-${index}`} type="button" className="rounded-full bg-[#e8edff] px-2 py-1 text-xs text-[#243aa8]" onClick={() => updateDraft((draft.value as string[]).filter((_, itemIndex) => itemIndex !== index))}>{tag} ×</button>)}</div><input className="input" placeholder="Type and press Enter to add" value={tagEntry} onChange={(event) => setTagEntry(event.target.value)} onKeyDown={addTag} /><select aria-label="Skill match mode" className="input" value={draft.operator} onChange={(event) => updateDraft(draft.value, event.target.value)}><option value="all">Match all</option><option value="any">Match any</option></select></>
                  : <input className="input" placeholder="Enter a value" value={String(draft.value ?? "")} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") apply(draft); }} />}
              </div>}
              {editingField.type === "number" && <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input className="input min-w-0" type="number" placeholder="Minimum" value={(draft.value as { min?: string }).min ?? ""} onChange={(event) => updateDraft({ ...(draft.value as object), min: event.target.value }, "range")} />
                <span className="text-sm text-[#5a6680]">to</span>
                <input className="input min-w-0" type="number" placeholder="Maximum" value={(draft.value as { max?: string }).max ?? ""} onChange={(event) => updateDraft({ ...(draft.value as object), max: event.target.value }, "range")} />
              </div>}
              {editingField.type === "select" && <div>
                <input className="input mb-2" aria-label={`Search ${editingField.label} options`} placeholder="Search options" value={optionSearch} onChange={(event) => setOptionSearch(event.target.value)} />
                <div className="max-h-56 overflow-y-auto rounded-lg border border-[#e6eaf3] p-2">
                  {(optionValues[editingField.key] ?? []).filter((option) => option.toLowerCase().includes(optionSearch.toLowerCase())).map((option) => {
                    const selected = draft.value as string[];
                    return <label key={option} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[#f7f9fc]"><input type="checkbox" checked={selected.includes(option)} onChange={(event) => updateDraft(event.target.checked ? [...selected, option] : selected.filter((value) => value !== option))} />{option}</label>;
                  })}
                  {(optionValues[editingField.key] ?? []).length === 0 && <p className="px-2 py-3 text-sm text-[#778196]">No options available.</p>}
                </div>
              </div>}
              {editingField.type === "boolean" && <div className="flex flex-wrap gap-2">
                {[["", "Any"], ["true", "Yes"], ["false", "No"]].map(([value, label]) => <button key={value || "any"} type="button" aria-pressed={draft.value === value} className={`rounded-lg border px-4 py-2 text-sm ${draft.value === value ? "border-[#2f4bd8] bg-[#e8edff] text-[#243aa8]" : "border-[#dbe1ee] hover:bg-[#f7f9fc]"}`} onClick={() => updateDraft(value, "exact")}>{label}</button>)}
              </div>}
              {editingField.type === "date" && <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-[#5a6680]">From<input aria-label="From date" className="input mt-1" type="date" value={(draft.value as { min?: string }).min ?? ""} onChange={(event) => updateDraft({ ...(draft.value as object), min: event.target.value }, "range")} /></label><label className="text-xs font-medium text-[#5a6680]">To<input aria-label="To date" className="input mt-1" type="date" value={(draft.value as { max?: string }).max ?? ""} onChange={(event) => updateDraft({ ...(draft.value as object), max: event.target.value }, "range")} /></label></div>
                <div className="flex flex-wrap gap-2">{editingField.key === "projectEndDate" ? [30, 60, 90].map((days) => <button key={days} type="button" className="rounded-full bg-[#e8edff] px-3 py-1.5 text-xs text-[#243aa8]" onClick={() => applyNextDate(days)}>Next {days} days</button>) : [1, 3].map((years) => <button key={years} type="button" className="rounded-full bg-[#e8edff] px-3 py-1.5 text-xs text-[#243aa8]" onClick={() => applyQuickDate(years)}>Last {years} years</button>)}</div>
              </div>}
              {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            </> : <div className="flex h-full min-h-36 items-center justify-center rounded-xl border border-dashed border-[#dbe1ee] bg-[#f7f9fc] p-6 text-center text-sm text-[#68758a]">Select a field on the left to configure its filter.</div>}
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6eaf3] px-5 py-4">
          {draft && filters.some((filter) => filter.key === draft.key)
            ? <button type="button" className="text-sm font-medium text-red-700 hover:text-red-800" onClick={() => { onChange(filters.filter((filter) => filter.key !== draft.key)); closeDialog(); }}>Remove filter</button>
            : <span />}
          <div className="ml-auto flex gap-2">
            <button type="button" className="rounded-lg border border-[#cdd5e3] px-4 py-2 text-sm font-medium hover:bg-[#f7f9fc]" onClick={closeDialog}>Cancel</button>
            {draft && <button type="button" className="rounded-lg bg-[#2f4bd8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#243db7]" onClick={() => apply(draft)}>Apply filter</button>}
          </div>
        </footer>
      </section>
    </div>}
  </div>;
}
