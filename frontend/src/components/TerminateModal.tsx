import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Resource } from "../types";
import Modal from "./Modal";

const REASON_CODES = ["VOLUNTARY_EXIT", "INVOLUNTARY_EXIT", "END_OF_CONTRACT", "TRANSFER_OUT_OF_SCOPE"];

export default function TerminateModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeAllocations, setActiveAllocations] = useState<any[] | null>(null);
  const [forceCloseAllocations, setForceCloseAllocations] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/terminations", { resourceId: resource.id, reasonCode, reason: reason || undefined, forceCloseAllocations });
      queryClient.invalidateQueries({ queryKey: ["resource", resource.id] });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["terminations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (err: any) {
      if (err.response?.status === 400 && err.response.data.activeAllocations) {
        setActiveAllocations(err.response.data.activeAllocations);
        setError(err.response.data.error);
      } else {
        setError(err.response?.data?.error || "Request failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Terminate / Offboard ${resource.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Reason Code</label>
          <select className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {REASON_CODES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {activeAllocations && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-2">
            <div className="font-medium">This resource has {activeAllocations.length} active allocation(s) that must be resolved first.</div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={forceCloseAllocations} onChange={(e) => setForceCloseAllocations(e.target.checked)} />
              Force-close all active allocations and proceed (audit-logged)
            </label>
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <p className="text-xs text-slate-400">
          HR approval is required before this takes effect, unless you are signed in as HR.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-danger" disabled={submitting}>
            {submitting ? "Submitting..." : "Initiate Termination"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
