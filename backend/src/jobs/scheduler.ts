import cron from "node-cron";
import { runDailyImportJob } from "./importJob";
import { processAllocationTransitions, runBenchAgingAlerts } from "../services/benchService";

/**
 * Schedules the background jobs that back the requirements doc's automatic/daily behaviors:
 * - FR-1.4: daily HRMIS/manual-sheet import.
 * - FR-4.1/4.2: automatic Allocated <-> Bench (Committed/True) transitions on schedule dates.
 * - FR-4.3: True Bench aging alerts.
 * Allocation transitions and bench alerts run every 15 minutes so the demo doesn't require
 * waiting a full day to observe state changes; the import runs once daily at 02:00.
 */
export function startScheduledJobs() {
  cron.schedule("0 2 * * *", () => {
    runDailyImportJob().catch((e) => console.error("[scheduler] daily import failed", e));
  });

  cron.schedule("*/15 * * * *", () => {
    processAllocationTransitions().catch((e) => console.error("[scheduler] allocation transitions failed", e));
    runBenchAgingAlerts().catch((e) => console.error("[scheduler] bench aging alerts failed", e));
  });

  console.log("[scheduler] Scheduled jobs registered (daily import @ 02:00, transitions/alerts every 15 min).");
}
