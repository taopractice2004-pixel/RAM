import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Resource } from "../types";
import Modal from "./Modal";

export default function MlModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/approvals/ml", { resourceId: resource.id, reason: reason || undefined });
      queryClient.invalidateQueries({ queryKey: ["resource", resource.id] });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Request Maternity Leave for ${resource.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {resource.gender !== "FEMALE" && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            Maternity leave can only be requested for female employees. Update the employee's gender first if needed.
          </div>
        )}
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <p className="text-xs text-slate-400">This request will be sent to HR for approval. Approved resources remain visible but unavailable for allocation or termination.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting || resource.gender !== "FEMALE"}>
            {submitting ? "Submitting..." : "Request ML Approval"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
