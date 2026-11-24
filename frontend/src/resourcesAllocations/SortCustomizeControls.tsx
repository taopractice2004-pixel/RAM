import { useMemo, useState } from "react";
import { DEFAULT_COLUMNS, FIELD_REGISTRY, FieldDefinition } from "./fields";
import { SortRule } from "./viewState";

interface Props {
  columns: string[];
  sort: SortRule[];
  fields: FieldDefinition[];
  onColumnsChange: (columns: string[]) => void;
  onSortChange: (sort: SortRule[]) => void;
  resetToDefault: () => void;
}

const BENCH_PRIORITY: FieldDefinition = {
  key: "benchPriority",
  label: "Bench priority",
  type: "number",
  filterable: false,
  sortable: true,
  customizable: false,
  defaultVisible: false,
  defaultOrder: 0,
  apiMapping: "computed priority group, ageing and expected bench date",
  sensitive: false,
  permission: "read",
  getValue: () => null,
  formatValue: () => "—",
};

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function directionLabel(field: FieldDefinition, direction: SortRule["direction"]) {
  const highFirst = direction === "desc";
  if (field.type === "number" || field.type === "date") return highFirst ? "High → Low" : "Low → High";
  return highFirst ? "Z → A" : "A → Z";
}

export default function SortCustomizeControls({ columns, sort, fields, onColumnsChange, onSortChange, resetToDefault }: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState(columns);
  const [search, setSearch] = useState("");
  const [sortSearch, setSortSearch] = useState("");
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [keyboardItem, setKeyboardItem] = useState<string | null>(null);
  const allSortableFields = useMemo(() => [BENCH_PRIORITY, ...fields.filter((field) => field.sortable)], [fields]);
  const fieldMap = useMemo(() => new Map(allSortableFields.map((field) => [field.key, field])), [allSortableFields]);
  const customizableFields = fields.filter((field) => field.customizable);
  const customizableKeys = new Set(customizableFields.map((field) => field.key));
  const visibleFields = draftColumns.map((key) => customizableFields.find((field) => field.key === key)).filter((field): field is FieldDefinition => Boolean(field));
  const availableFields = customizableFields.filter((field) => !draftColumns.includes(field.key) && field.label.toLowerCase().includes(search.toLowerCase()));

  function beginCustomize() {
    setDraftColumns([...columns]);
    setSearch("");
    setCustomizeOpen(true);
  }

  function closeOnEscape(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setSortOpen(false);
      setCustomizeOpen(false);
    }
  }

  function reorderSort(from: number, to: number) {
    onSortChange(move(sort, from, to));
  }

  function reorderColumns(from: number, to: number) {
    setDraftColumns((current) => move(current, from, to));
  }

  function handleSortKey(event: React.KeyboardEvent<HTMLDivElement>, index: number) {
    const rule = sort[index];
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setKeyboardItem(keyboardItem === rule.key ? null : rule.key);
    } else if (keyboardItem === rule.key && event.key === "ArrowUp") {
      event.preventDefault();
      reorderSort(index, index - 1);
    } else if (keyboardItem === rule.key && event.key === "ArrowDown") {
      event.preventDefault();
      reorderSort(index, index + 1);
    }
  }

  function handleColumnKey(event: React.KeyboardEvent<HTMLDivElement>, index: number) {
    const key = draftColumns[index];
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      setKeyboardItem(keyboardItem === key ? null : key);
    } else if (keyboardItem === key && event.key === "ArrowLeft") {
      event.preventDefault();
      reorderColumns(index, index - 1);
    } else if (keyboardItem === key && event.key === "ArrowRight") {
      event.preventDefault();
      reorderColumns(index, index + 1);
    }
  }

  function dropSort(targetIndex: number) {
    if (!dragItem) return;
    const from = sort.findIndex((rule) => rule.key === dragItem);
    reorderSort(from, targetIndex);
    setDragItem(null);
  }

  function dropColumn(targetIndex: number) {
    if (!dragItem) return;
    const from = draftColumns.indexOf(dragItem);
    if (from >= 0) reorderColumns(from, targetIndex);
    else setDraftColumns((current) => [...current.slice(0, targetIndex), dragItem, ...current.slice(targetIndex)]);
    setDragItem(null);
  }

  function applyColumns() {
    const selected = draftColumns.filter((key) => customizableKeys.has(key));
    onColumnsChange(selected.includes("name") ? selected : ["name", ...selected]);
    setCustomizeOpen(false);
  }

  function resetColumns() {
    setDraftColumns(DEFAULT_COLUMNS.filter((key) => customizableKeys.has(key)));
  }

  const firstSort = sort[0] ? fieldMap.get(sort[0].key) : BENCH_PRIORITY;
  return <div className="relative flex items-center gap-2.5" onKeyDown={closeOnEscape}>
    <div className="relative">
      <button type="button" aria-expanded={sortOpen} className="h-10 whitespace-nowrap rounded-[10px] border border-[#cdd5e3] bg-white px-3.5 text-sm font-medium" onClick={() => setSortOpen(!sortOpen)}>
        ⇅ Sort by <b>{firstSort?.label ?? "Bench priority"}</b>{sort[0]?.direction === "desc" ? " ↑" : ""}{sort.length > 1 ? ` +${sort.length - 1}` : ""}
      </button>
      {sortOpen && <div className="absolute right-0 top-11 z-30 w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-[#dbe1ee] bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between"><strong className="text-sm">Sort by</strong><button type="button" aria-label="Close sort menu" onClick={() => setSortOpen(false)}>×</button></div>
        <div className="space-y-2">{sort.map((rule, index) => {
          const field = fieldMap.get(rule.key) ?? BENCH_PRIORITY;
          return <div key={`${rule.key}-${index}`} draggable onDragStart={() => setDragItem(rule.key)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropSort(index)} onKeyDown={(event) => handleSortKey(event, index)} tabIndex={0} className={`flex items-center gap-2 rounded-lg border p-2 ${keyboardItem === rule.key ? "border-[#2f4bd8] shadow-sm" : "border-[#dbe1ee]"}`}>
            <span aria-label="Drag to reorder" className="cursor-grab text-[#5a6680]">⠿</span><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e8edff] text-xs text-[#243aa8]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{field.label}</span>
            <button type="button" className="rounded-lg bg-[#f7f9fc] px-2 py-1 text-xs" onClick={() => onSortChange(sort.map((item, itemIndex) => itemIndex === index ? { ...item, direction: item.direction === "asc" ? "desc" : "asc" } : item))}>{directionLabel(field, rule.direction)}</button>
            <button type="button" aria-label={`Remove ${field.label} sort`} onClick={() => onSortChange(sort.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>;
        })}</div>
        <div className="mt-3 border-t border-[#eef1f7] pt-3"><input aria-label="Search sortable fields" className="mb-2 w-full rounded-lg border border-[#cdd5e3] px-3 py-2 text-sm" placeholder="Search sortable fields" value={sortSearch} onChange={(event) => setSortSearch(event.target.value)} /><p className="mb-2 text-xs text-[#5a6680]">＋ Then sort by…</p><div className="max-h-40 overflow-y-auto">{allSortableFields.filter((field) => !sort.some((rule) => rule.key === field.key) && field.label.toLowerCase().includes(sortSearch.toLowerCase())).map((field) => <button key={field.key} type="button" className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-[#f7f9fc]" onClick={() => { onSortChange([...sort, { key: field.key, direction: "asc" }]); setSortSearch(""); }}>{field.label}</button>)}</div></div>
      </div>}
    </div>
    <button type="button" className="h-10 whitespace-nowrap rounded-[10px] border border-[#cdd5e3] bg-white px-3.5 text-sm font-medium" onClick={beginCustomize}>⚙ Customize <span className="ml-1 text-xs text-[#5a6680]">{columns.length} of {customizableFields.length}</span></button>
    {customizeOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomizeOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="customize-title" className="flex max-h-[90vh] w-full max-w-[960px] flex-col rounded-2xl bg-white shadow-2xl" onKeyDown={closeOnEscape}>
        <header className="flex items-start justify-between border-b border-[#dbe1ee] p-5"><div><h2 id="customize-title" className="text-lg font-semibold">Customize columns</h2><p className="mt-1 text-sm text-[#5a6680]">Drag fields to reorder. Drag from Available to add. Order here is the order in the table and the Excel file.</p></div><button type="button" aria-label="Close customize columns" onClick={() => setCustomizeOpen(false)}>×</button></header>
        <div className="overflow-y-auto p-5">
          <h3 className="mb-3 text-sm font-semibold">Shown in table · {visibleFields.length} fields (left to right)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleFields.map((field, index) => <div key={field.key} draggable onDragStart={() => setDragItem(field.key)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropColumn(index)} onKeyDown={(event) => handleColumnKey(event, index)} tabIndex={0} className={`flex h-11 items-center gap-2 rounded-lg border bg-white px-3 ${dragItem === field.key ? "rotate-1 border-2 border-[#2f4bd8] shadow-md" : "border-[#dbe1ee]"}`}><span className="cursor-grab text-[#5a6680]">⠿</span><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e8edff] text-xs text-[#243aa8]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{field.label}</span><button type="button" aria-label={`Remove ${field.label}`} disabled={field.key === "name"} onClick={() => setDraftColumns((current) => current.filter((key) => key !== field.key))}>×</button></div>)}</div>
          <div className="mt-6 border-t border-dashed border-[#b9c2d6] pt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Available · {availableFields.length} fields</h3><input aria-label="Search available fields" className="w-full max-w-xs rounded-lg border border-[#cdd5e3] px-3 py-2 text-sm" placeholder="Search fields" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{availableFields.map((field) => <div key={field.key} draggable onDragStart={() => setDragItem(field.key)} onDragEnd={() => setDragItem(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropColumn(draftColumns.length)} className="flex h-11 items-center gap-2 rounded-lg border border-dashed border-[#b9c2d6] bg-[#f7f9fc] px-3"><span className="min-w-0 flex-1 truncate text-sm">{field.label}</span><button type="button" aria-label={`Add ${field.label}`} onClick={() => setDraftColumns((current) => [...current, field.key])}>＋</button></div>)}</div></div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dbe1ee] p-4"><button type="button" className="text-sm text-[#2f4bd8]" onClick={resetColumns}>Reset to default</button><div className="flex gap-2"><button type="button" className="rounded-[10px] border border-[#cdd5e3] px-4 py-2 text-sm" onClick={() => setCustomizeOpen(false)}>Cancel</button><button type="button" className="rounded-[10px] bg-[#2f4bd8] px-4 py-2 text-sm text-white" onClick={applyColumns}>Apply</button></div></footer>
      </section>
    </div>}
  </div>;
}
