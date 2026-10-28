import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import portfolioRoutes from "./routes/portfolios";
import projectRoutes from "./routes/projects";
import userRoutes from "./routes/users";
import resourceRoutes from "./routes/resources";
import importRoutes from "./routes/imports";
import allocationRoutes from "./routes/allocations";
import benchRoutes from "./routes/bench";
import terminationRoutes from "./routes/terminations";
import approvalRoutes from "./routes/approvals";
import dashboardRoutes from "./routes/dashboard";
import reportRoutes from "./routes/reports";
import demandRoutes from "./routes/demand";
import notificationRoutes from "./routes/notifications";
import auditRoutes from "./routes/audit";
import exportRoutes from "./routes/exports";

import { requireAuth } from "./middleware/auth";
import { startScheduledJobs } from "./jobs/scheduler";

const app = express();
app.use(cors());
const MAX_WORKBOOK_BYTES = 200 * 1024 * 1024;
const MAX_WORKBOOK_BASE64 = Math.ceil(MAX_WORKBOOK_BYTES / 3) * 4;
const WORKBOOK_JSON_LIMIT = `${Math.ceil(MAX_WORKBOOK_BASE64 * 1.1 / (1024 * 1024))}mb`;
app.use("/api/imports/rmg-mis-import/preview", express.json({ limit: WORKBOOK_JSON_LIMIT }));
app.use("/api/imports/rmg-mis-import/commit", express.json({ limit: WORKBOOK_JSON_LIMIT }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/portfolios", requireAuth, portfolioRoutes);
app.use("/api/projects", requireAuth, projectRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/resources", requireAuth, resourceRoutes);
app.use("/api/imports", requireAuth, importRoutes);
app.use("/api/allocations", requireAuth, allocationRoutes);
app.use("/api/bench", requireAuth, benchRoutes);
app.use("/api/terminations", requireAuth, terminationRoutes);
app.use("/api/approvals", requireAuth, approvalRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/reports", requireAuth, reportRoutes);
app.use("/api/demand", requireAuth, demandRoutes);
app.use("/api/notifications", requireAuth, notificationRoutes);
app.use("/api/audit", requireAuth, auditRoutes);
app.use("/api/exports", requireAuth, exportRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Workbook upload exceeds the 200 MB limit." });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Upload request body is invalid. Retry with a valid .xlsx workbook." });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`RAM backend listening on port ${PORT}`);
  startScheduledJobs();
});
