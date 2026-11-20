import cron from "node-cron";
import { processAllocationTransitions, runBenchAgingAlerts, runUpcomingBenchNotices } from "../services/benchService";
import { prisma } from "../prisma";
import { deliverEmail } from "../routes/notifications";

/**
 * Schedules allocation transitions and bench aging alerts, which run every 15 minutes.
 */
export function startScheduledJobs() {
  cron.schedule("*/15 * * * *", () => {
    processAllocationTransitions().catch((e) => console.error("[scheduler] allocation transitions failed", e));
    runBenchAgingAlerts().catch((e) => console.error("[scheduler] bench aging alerts failed", e));
  });
  cron.schedule("0 8 * * *", async () => {
    const rule = await prisma.notificationRule.findUnique({ where: { key: "BENCH_REPORT" } });
    if (rule?.enabled === false) return;
    const users = await prisma.user.findMany({ where: { active: true, role: "TA" } });
    const rows = await prisma.resource.findMany({ where: { status: { in: ["BENCH_COMMITTED", "BENCH_TRUE"] } }, include: { portfolio: true } });
    const report = rows.map((row) => `${row.employeeId},${row.name},${row.status},${row.benchSince?.toISOString().slice(0, 10) ?? ""},${row.portfolio.name}`).join("\\n");
    for (const user of users) await deliverEmail("BENCH_REPORT", user.email, "Daily bench report", `Employee ID,Name,Status,Bench since,Portfolio\\n${report}`, undefined, [{ filename: "bench-report.csv", content: `Employee ID,Name,Status,Bench since,Portfolio\\n${report}`, contentType: "text/csv" }]);
  });
  cron.schedule("0 9 * * *", () => {
    runUpcomingBenchNotices().catch((e) => console.error("[scheduler] upcoming bench notices failed", e));
  });
  console.log("[scheduler] Allocation transitions and bench alerts run every 15 min; daily bench report at 08:00 and upcoming bench notices at 09:00.");
}
