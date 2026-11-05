import cron from "node-cron";
import { processAllocationTransitions, runBenchAgingAlerts } from "../services/benchService";

/**
 * Schedules allocation transitions and bench aging alerts, which run every 15 minutes.
 */
export function startScheduledJobs() {
  cron.schedule("*/15 * * * *", () => {
    processAllocationTransitions().catch((e) => console.error("[scheduler] allocation transitions failed", e));
    runBenchAgingAlerts().catch((e) => console.error("[scheduler] bench aging alerts failed", e));
  });

  console.log("[scheduler] Scheduled allocation transitions and bench alerts every 15 min.");
}
