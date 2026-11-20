"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduledJobs = startScheduledJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const benchService_1 = require("../services/benchService");
const prisma_1 = require("../prisma");
const notifications_1 = require("../routes/notifications");
/**
 * Schedules allocation transitions and bench aging alerts, which run every 15 minutes.
 */
function startScheduledJobs() {
    node_cron_1.default.schedule("*/15 * * * *", () => {
        (0, benchService_1.processAllocationTransitions)().catch((e) => console.error("[scheduler] allocation transitions failed", e));
        (0, benchService_1.runBenchAgingAlerts)().catch((e) => console.error("[scheduler] bench aging alerts failed", e));
    });
    node_cron_1.default.schedule("0 8 * * *", async () => {
        const rule = await prisma_1.prisma.notificationRule.findUnique({ where: { key: "BENCH_REPORT" } });
        if (rule?.enabled === false)
            return;
        const users = await prisma_1.prisma.user.findMany({ where: { active: true, role: "TA" } });
        const rows = await prisma_1.prisma.resource.findMany({ where: { status: { in: ["BENCH_COMMITTED", "BENCH_TRUE"] } }, include: { portfolio: true } });
        const report = rows.map((row) => `${row.employeeId},${row.name},${row.status},${row.benchSince?.toISOString().slice(0, 10) ?? ""},${row.portfolio.name}`).join("\\n");
        for (const user of users)
            await (0, notifications_1.deliverEmail)("BENCH_REPORT", user.email, "Daily bench report", `Employee ID,Name,Status,Bench since,Portfolio\\n${report}`, undefined, [{ filename: "bench-report.csv", content: `Employee ID,Name,Status,Bench since,Portfolio\\n${report}`, contentType: "text/csv" }]);
    });
    console.log("[scheduler] Allocation transitions and bench alerts run every 15 min; daily bench report at 08:00.");
}
