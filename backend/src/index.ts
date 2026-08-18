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
import dashboardRoutes from "./routes/dashboard";
import reportRoutes from "./routes/reports";
import notificationRoutes from "./routes/notifications";
import auditRoutes from "./routes/audit";

import { requireAuth } from "./middleware/auth";
import { startScheduledJobs } from "./jobs/scheduler";

const app = express();
app.use(cors());
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
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/reports", requireAuth, reportRoutes);
app.use("/api/notifications", requireAuth, notificationRoutes);
app.use("/api/audit", requireAuth, auditRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`RAM backend listening on port ${PORT}`);
  startScheduledJobs();
});
