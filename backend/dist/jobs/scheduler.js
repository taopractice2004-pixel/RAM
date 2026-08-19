"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduledJobs = startScheduledJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const importJob_1 = require("./importJob");
const benchService_1 = require("../services/benchService");
/**
 * Schedules the background jobs that back the requirements doc's automatic/daily behaviors:
 * - FR-1.4: daily HRMIS/manual-sheet import.
 * - FR-4.1/4.2: automatic Allocated <-> Bench (Committed/True) transitions on schedule dates.
 * - FR-4.3: True Bench aging alerts.
 * Allocation transitions and bench alerts run every 15 minutes so the demo doesn't require
 * waiting a full day to observe state changes; the import runs once daily at 02:00.
 */
function startScheduledJobs() {
    node_cron_1.default.schedule("0 2 * * *", () => {
        (0, importJob_1.runDailyImportJob)().catch((e) => console.error("[scheduler] daily import failed", e));
    });
    node_cron_1.default.schedule("*/15 * * * *", () => {
        (0, benchService_1.processAllocationTransitions)().catch((e) => console.error("[scheduler] allocation transitions failed", e));
        (0, benchService_1.runBenchAgingAlerts)().catch((e) => console.error("[scheduler] bench aging alerts failed", e));
    });
    console.log("[scheduler] Scheduled jobs registered (daily import @ 02:00, transitions/alerts every 15 min).");
}
