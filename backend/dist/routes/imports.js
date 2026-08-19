"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const importService_1 = require("../services/importService");
const audit_1 = require("../utils/audit");
const importSheetPath_1 = require("../utils/importSheetPath");
const router = (0, express_1.Router)();
const DEFAULT_SHEET_PATH = (0, importSheetPath_1.resolveImportSheetPath)();
// FR-1.4: trigger the import from the default manual input sheet / HRMIS drop location.
// (The scheduled daily job calls the same underlying service - see jobs/importJob.ts.)
router.post("/run", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    if (!fs_1.default.existsSync(DEFAULT_SHEET_PATH)) {
        return res.status(404).json({ error: `Input sheet not found at ${DEFAULT_SHEET_PATH}` });
    }
    const csvText = fs_1.default.readFileSync(DEFAULT_SHEET_PATH, "utf-8");
    const rows = (0, importService_1.parseImportCsv)(csvText);
    const batch = await (0, importService_1.runImport)(rows, "MANUAL_SHEET", req.user.id);
    res.status(201).json(batch);
});
// Ad-hoc upload: paste/upload CSV text directly (useful for demoing without touching server files).
router.post("/upload", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const schema = zod_1.z.object({ csvText: zod_1.z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    let rows;
    try {
        rows = (0, importService_1.parseImportCsv)(parsed.data.csvText);
    }
    catch (e) {
        return res.status(400).json({ error: `CSV parse error: ${e.message}` });
    }
    const batch = await (0, importService_1.runImport)(rows, "MANUAL_UPLOAD", req.user.id);
    res.status(201).json(batch);
});
router.get("/", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (_req, res) => {
    const batches = await prisma_1.prisma.importBatch.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
    res.json(batches);
});
router.get("/:id", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const batch = await prisma_1.prisma.importBatch.findUnique({
        where: { id: req.params.id },
        include: { records: true },
    });
    if (!batch)
        return res.status(404).json({ error: "Batch not found" });
    res.json(batch);
});
// FR-1.5: quarantined records awaiting RMG/HR review.
router.get("/quarantine/list", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (_req, res) => {
    const records = await prisma_1.prisma.importRecord.findMany({
        where: { status: "QUARANTINED" },
        orderBy: { createdAt: "desc" },
        include: { batch: true },
    });
    res.json(records);
});
router.post("/quarantine/:recordId/discard", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const record = await prisma_1.prisma.importRecord.findUnique({ where: { id: req.params.recordId } });
    if (!record)
        return res.status(404).json({ error: "Record not found" });
    await (0, audit_1.writeAudit)({
        actorId: req.user.id,
        action: "DISCARD_QUARANTINED_IMPORT_RECORD",
        entityType: "ImportRecord",
        entityId: record.id,
        before: record,
    });
    res.json({ ok: true });
});
// Re-submit a corrected version of a quarantined row as a fresh 1-row import.
router.post("/quarantine/:recordId/resolve", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const record = await prisma_1.prisma.importRecord.findUnique({ where: { id: req.params.recordId } });
    if (!record)
        return res.status(404).json({ error: "Record not found" });
    const correctedRow = { ...record.rawData, ...req.body };
    const batch = await (0, importService_1.runImport)([correctedRow], "QUARANTINE_RESOLUTION", req.user.id);
    res.json({ batch });
});
exports.default = router;
