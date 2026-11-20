import { useState } from "react";
import { ResourceAllocationRow } from "../resourcesAllocations/fields";
import Modal from "./Modal";

interface Props {
  row: ResourceAllocationRow;
  onClose: () => void;
  onAllocate: () => void;
  onSave: (endDate: string, reason: string) => Promise<void>;
}

export default function ExtendAllocationDialog({ row, onClose, onAllocate, onSave }: Props) {
  const currentEnd = row.currentAllocation?.endDate?.slice(0, 10) ?? "";
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const valid = Boolean(currentEnd && endDate && endDate > currentEnd && endDate >= today);
  const nextDay = new Date(`${currentEnd}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextAvailableDate = nextDay.toISOString().slice(0, 10);
  const minEnd = currentEnd ? (nextAvailableDate > today ? nextAvailableDate : today) : undefined;

  function addMonths(months: number) {
    if (!currentEnd) return;
    const date = new Date(`${currentEnd}T00:00:00Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    setEndDate(date.toISOString().slice(0, 10));
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!valid) {
      setError("New end date must be later than the current end date.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSave(endDate, reason);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not extend allocation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Extend allocation" onClose={() => { if (!submitting) onClose(); }}>
      <form onSubmit={submit} className="space-y-3" role="dialog" aria-label="Extend allocation" aria-modal="true" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (!submitting) onClose(); } }}>
        <label className="label">Employee<input className="input" readOnly value={`${row.name} (${row.employeeId})`} /></label>
        <label className="label">Project<input className="input" readOnly value={row.currentAllocation?.project?.name ?? row.currentAllocation?.projectId ?? ""} /></label>
        <label className="label">Current end date<input className="input" type="date" readOnly value={currentEnd} /></label>
        <label className="label">New end date<input autoFocus className="input focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="date" required min={minEnd} value={endDate} disabled={submitting} onChange={(event) => { setEndDate(event.target.value); setError(""); }} /></label>
        <div className="flex gap-2">{[1, 3, 6].map((months) => <button key={months} type="button" className="rounded-full border border-blue-200 px-3 py-1 text-sm text-blue-700" disabled={submitting || !currentEnd} onClick={() => addMonths(months)}>+{months} {months === 1 ? "month" : "months"}</button>)}</div>
        <label className="label">Reason (optional)<textarea className="input" rows={2} value={reason} disabled={submitting} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Extending changes the existing allocation on the same project, rather than creating a new allocation. For a different project, <button type="button" className="underline" disabled={submitting} onClick={onAllocate}>create a new allocation</button>.</div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" disabled={submitting} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={submitting || !valid}>{submitting ? "Extending..." : "Extend allocation"}</button></div>
      </form>
    </Modal>
  );
}
