import { useState } from "react";
import { ResourceAllocationRow } from "../resourcesAllocations/fields";
import Modal from "./Modal";

interface Props {
  rows: ResourceAllocationRow[];
  onClose: () => void;
  onSave: (allocationIds: string[], endDate: string, reason: string) => Promise<{ updated: number }>;
}

function localDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—";
}

export default function BulkExtendAllocationDialog({ rows, onClose, onSave }: Props) {
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const changedRows = rows.filter((row) => row.currentAllocation?.endDate && endDate > row.currentAllocation.endDate.slice(0, 10));
  const unchangedRows = rows.filter((row) => row.currentAllocation?.endDate?.slice(0, 10) === endDate);
  const earlierRows = rows.filter((row) => row.currentAllocation?.endDate && endDate < row.currentAllocation.endDate.slice(0, 10));
  const minDate = new Date().toISOString().slice(0, 10);
  const valid = Boolean(endDate && endDate >= minDate && changedRows.length > 0 && earlierRows.length === 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!valid) {
      setError(earlierRows.length ? "The new end date must not shorten any selected allocation." : "Choose a future end date later than each selected allocation.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSave(changedRows.map((row) => row.currentAllocation!.id), endDate, reason);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not extend the selected allocations.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Bulk update" onClose={() => { if (!submitting) onClose(); }}>
      <form onSubmit={submit} className="space-y-4" role="dialog" aria-label="Bulk update allocations" aria-modal="true">
        <p className="text-sm text-slate-600">{rows.length} resources selected. Set a project end date for all eligible allocations.</p>
        <label className="label">Project end date
          <input autoFocus className="input" type="date" min={minDate} required value={endDate} disabled={submitting} onChange={(event) => { setEndDate(event.target.value); setError(""); }} />
        </label>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Project</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th></tr></thead>
            <tbody>{rows.map((row) => {
              const currentEnd = row.currentAllocation?.endDate ?? "";
              const unchanged = currentEnd.slice(0, 10) === endDate;
              return <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">{row.currentAllocation?.project?.name ?? "—"}</td>
                <td className="px-3 py-2">{localDate(currentEnd)}</td>
                <td className="px-3 py-2">{endDate ? localDate(endDate) : "—"}{unchanged && <span className="ml-1 text-slate-500">(unchanged)</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {endDate && earlierRows.length > 0
          ? <p role="alert" className="text-sm text-red-600">This date would shorten {earlierRows.length} selected {earlierRows.length === 1 ? "allocation" : "allocations"}. Choose a later date to continue.</p>
          : endDate && <p className="text-sm text-slate-600">End date will be extended for {changedRows.length} {changedRows.length === 1 ? "resource" : "resources"}{unchangedRows.length > 0 ? `; ${unchangedRows.length} already have this date and will not change` : ""}.</p>}
        <label className="label">Reason (optional)<textarea className="input" rows={2} value={reason} disabled={submitting} onChange={(event) => setReason(event.target.value)} /></label>
        <p className="text-xs text-slate-500">A summary notification will be sent after the updates are saved.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" disabled={submitting} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting || !valid}>{submitting ? "Applying..." : `Apply to ${changedRows.length || rows.length}`}</button>
        </div>
      </form>
    </Modal>
  );
}
