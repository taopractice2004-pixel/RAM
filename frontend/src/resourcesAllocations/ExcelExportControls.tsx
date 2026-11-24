import { useState } from "react";
import { FieldDefinition, ResourceAllocationRow } from "./fields";

interface Props {
  rows: ResourceAllocationRow[];
  visibleFields: FieldDefinition[];
  allFields: FieldDefinition[];
  selectedIds: string[];
  onExport: (rows: ResourceAllocationRow[], fields: FieldDefinition[], mode: "current" | "all" | "selected") => void;
}

export default function ExcelExportControls({ rows, visibleFields, allFields, selectedIds, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"current" | "all" | "selected">("current");
  const activeRows = mode === "selected" ? rows.filter((row) => selectedIds.includes(row.id)) : rows;
  const fields = mode === "all" ? allFields : visibleFields;

  return <div className="relative">
    <button type="button" disabled={rows.length === 0} aria-expanded={open} className="h-10 whitespace-nowrap rounded-[10px] border border-[#157347] bg-[#157347] px-3.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setOpen(!open)}>⬇ Download Excel</button>
    {open && <div className="absolute right-0 top-11 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[#dbe1ee] bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between"><strong className="text-sm">Download Excel</strong><button type="button" aria-label="Close download menu" onClick={() => setOpen(false)}>×</button></div>
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2"><input type="radio" name="excel-mode" checked={mode === "current"} onChange={() => setMode("current")} /><span><strong>Current view</strong><span className="block text-xs text-[#5a6680]">Visible columns, filters and sort</span></span></label>
        <label className="flex items-start gap-2"><input type="radio" name="excel-mode" checked={mode === "all"} onChange={() => setMode("all")} /><span><strong>All columns</strong><span className="block text-xs text-[#5a6680]">Current filters and sort</span></span></label>
        {selectedIds.length > 0 && <label className="flex items-start gap-2"><input type="radio" name="excel-mode" checked={mode === "selected"} onChange={() => setMode("selected")} /><span><strong>Selected rows only</strong><span className="block text-xs text-[#5a6680]">{selectedIds.length} selected</span></span></label>}
      </div>
      <button type="button" disabled={activeRows.length === 0} className="mt-4 h-10 w-full rounded-[10px] bg-[#157347] text-sm font-medium text-white disabled:opacity-50" onClick={() => { onExport(activeRows, fields, mode); setOpen(false); }}>⬇ Download .xlsx</button>
    </div>}
  </div>;
}
