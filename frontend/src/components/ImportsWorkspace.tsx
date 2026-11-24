import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { ImportBatch } from "../types";
import ExcelImportWizard from "./ExcelImportWizard";
import QuarantineWorkspace from "./QuarantineWorkspace";

export default function ImportsWorkspace({ standalone = false }: { standalone?: boolean }) {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [csvKey, setCsvKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const { data: batches = [] } = useQuery<ImportBatch[]>({ queryKey: ["import-batches"], queryFn: async () => (await api.get("/imports")).data });

  async function uploadCsv() {
    const { data } = await api.post("/imports/upload", { csvText, idempotencyKey: csvKey });
    setMessage(`Batch ${data.id}: created ${data.createdCount}, updated ${data.updatedCount}, quarantined ${data.quarantinedCount}, failed ${data.totals?.FAILED ?? 0}, pending ${data.totals?.PENDING ?? 0}.${data.notificationPending ? " Notification delivery pending; retry unchanged input." : ""}`);
    if (!data.notificationPending && !data.totals?.PENDING && !data.totals?.FAILED) { setCsvText(""); setCsvKey(crypto.randomUUID()); }
    queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    queryClient.invalidateQueries({ queryKey: ["quarantine"] });
    queryClient.invalidateQueries({ queryKey: ["resources"] });
  }

  return (
    <div className="space-y-6">
      <ExcelImportWizard standalone={standalone} onImported={(text) => {
        setMessage(text);
        queryClient.invalidateQueries({ queryKey: ["quarantine"] });
        queryClient.invalidateQueries({ queryKey: ["import-batches"] });
        queryClient.invalidateQueries({ queryKey: ["resources"] });
      }} />

      <section id="csv-import" className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Alternative import</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">Paste CSV records</h2>
          <p className="mt-1 text-sm text-slate-500">For smaller updates, paste comma-separated resource rows.</p>
        </div>
        <div className="space-y-3 p-5">
          <textarea
            className="input min-h-28 font-mono text-xs leading-5"
            rows={4}
            aria-label="CSV records"
            placeholder="employeeId,name,gender,country,workLocation,location,costRate,currency,portfolioCode,managerName,designation,subCategory,dateOfJoining,totalYoe,taoExperience,skills,certifications"
            value={csvText}
            onChange={(event) => { setCsvText(event.target.value); setCsvKey(crypto.randomUUID()); }}
          />
          <button className="btn-secondary" onClick={uploadCsv} disabled={!csvText.trim()}>Add records</button>
        </div>
      </section>

      {message && <div role="status" className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800">{message}</div>}

      <section id="import-history" className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Activity</p><h2 className="mt-1 text-base font-semibold text-slate-900">Recent batches</h2></div>
          <span className="text-sm text-slate-500">{batches.length} {batches.length === 1 ? "batch" : "batches"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Created</th><th className="px-4 py-3 font-semibold">Updated</th><th className="px-4 py-3 font-semibold">Quarantined</th><th className="px-5 py-3 font-semibold">Started</th></tr>
            </thead>
            <tbody>{batches.map((batch) => (
              <tr key={batch.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-5 py-3"><span className="font-medium text-slate-800">{batch.source}</span><span className="mt-1 block font-mono text-xs text-slate-500">{batch.id} · {batch.status}</span></td>
                <td className="px-4 py-3 tabular-nums">{batch.createdCount}</td>
                <td className="px-4 py-3 tabular-nums">{batch.updatedCount}</td>
                <td className="px-4 py-3 tabular-nums">{batch.quarantinedCount}</td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-500">{new Date(batch.startedAt).toLocaleString()}</td>
              </tr>
            ))}{batches.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No import batches yet. Upload a workbook to get started.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section id="import-quarantine" className="space-y-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Follow-up</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Quarantine review</h2><p className="mt-1 text-sm text-slate-500">Correct, validate, and release records that need attention.</p></div>
        <QuarantineWorkspace />
      </section>
    </div>
  );
}
