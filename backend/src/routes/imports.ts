import { Router } from "express";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireRole } from "../middleware/rbac";
import { parseImportCsv, runImport, RawImportRow } from "../services/importService";
import { writeAudit } from "../utils/audit";
import { resolveImportSheetPath } from "../utils/importSheetPath";

const router = Router();

const DEFAULT_SHEET_PATH = resolveImportSheetPath();

// FR-1.4: trigger the import from the default manual input sheet / HRMIS drop location.
// (The scheduled daily job calls the same underlying service - see jobs/importJob.ts.)
router.post("/run", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  if (!fs.existsSync(DEFAULT_SHEET_PATH)) {
    return res.status(404).json({ error: `Input sheet not found at ${DEFAULT_SHEET_PATH}` });
  }
  const csvText = fs.readFileSync(DEFAULT_SHEET_PATH, "utf-8");
  const rows = parseImportCsv(csvText);
  const batch = await runImport(rows, "MANUAL_SHEET", req.user!.id);
  res.status(201).json(batch);
});

// Ad-hoc upload: paste/upload CSV text directly (useful for demoing without touching server files).
router.post("/upload", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  const schema = z.object({ csvText: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let rows: RawImportRow[];
  try {
    rows = parseImportCsv(parsed.data.csvText);
  } catch (e: any) {
    return res.status(400).json({ error: `CSV parse error: ${e.message}` });
  }
  const batch = await runImport(rows, "MANUAL_UPLOAD", req.user!.id);
  res.status(201).json(batch);
});

router.get("/", requireRole("ADMIN", "RMG", "HR"), async (_req, res) => {
  const batches = await prisma.importBatch.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  res.json(batches);
});

router.get("/:id", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id },
    include: { records: true },
  });
  if (!batch) return res.status(404).json({ error: "Batch not found" });
  res.json(batch);
});

// FR-1.5: quarantined records awaiting RMG/HR review.
router.get("/quarantine/list", requireRole("ADMIN", "RMG", "HR"), async (_req, res) => {
  const records = await prisma.importRecord.findMany({
    where: { status: "QUARANTINED" },
    orderBy: { createdAt: "desc" },
    include: { batch: true },
  });
  res.json(records);
});

router.post("/quarantine/:recordId/discard", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  const record = await prisma.$transaction(async (tx) => {
    const quarantined = await tx.importRecord.findUnique({ where: { id: req.params.recordId } });
    if (!quarantined) return null;
    if (quarantined.status !== "QUARANTINED") {
      return { notQuarantined: true as const };
    }

    await tx.importRecord.delete({ where: { id: quarantined.id } });
    await writeAudit({
      actorId: req.user!.id,
      action: "DISCARD_QUARANTINED_IMPORT_RECORD",
      entityType: "ImportRecord",
      entityId: quarantined.id,
      before: quarantined,
    }, tx);
    return quarantined;
  });
  if (!record) return res.status(404).json({ error: "Record not found" });
  if ("notQuarantined" in record) {
    return res.status(409).json({ error: "Only quarantined records can be discarded" });
  }

  res.json({ ok: true });
});

// Re-submit a corrected version of a quarantined row as a fresh 1-row import.
router.post("/quarantine/:recordId/resolve", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  const record = await prisma.importRecord.findUnique({ where: { id: req.params.recordId } });
  if (!record) return res.status(404).json({ error: "Record not found" });

  const correctedRow = { ...(record.rawData as Record<string, string>), ...req.body } as RawImportRow;
  const batch = await runImport([correctedRow], "QUARANTINE_RESOLUTION", req.user!.id);

  res.json({ batch });
});

export default router;
