import { Router } from "express";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireRole, isAuthorizedForPortfolio } from "../middleware/rbac";
import { parseImportCsv, runImport, RawImportRow } from "../services/importService";
import { writeAudit } from "../utils/audit";
import { resolveImportSheetPath } from "../utils/importSheetPath";
import { parseResourceExcelPreview } from "../utils/resourceExcelPreview";
import { classifyExcelRows } from "../utils/resourceExcelReconcile";

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

router.post("/excel-preview", requireRole("ADMIN", "RMG", "HR"), async (req, res) => {
  const parsed = z.object({ workbookBase64: z.string().min(1).max(14_000_000), sheetName: z.string().optional(), mapping: z.record(z.string(), z.string()).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const preview = await parseResourceExcelPreview(Buffer.from(parsed.data.workbookBase64, "base64"), parsed.data.mapping as any, parsed.data.sheetName);
    const ids = [...new Set(preview.rows.map((row) => row.values.employeeId).filter((id): id is string => Boolean(id)))];
    const resources = ids.length ? await prisma.resource.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, name: true, email: true, gender: true, country: true, managerName: true, designation: true, location: true, workLocation: true, willingToRelocate: true, costRate: true, currency: true, subCategory: true, dateOfJoining: true, priorExperienceYears: true, portfolioId: true, portfolio: { select: { code: true } }, skills: { include: { skill: true } }, certifications: true } }) : [];
    const byId = new Map<string, Record<string, any> | null>(ids.map((id) => [id, null]));
    for (const resource of resources) byId.set(resource.employeeId, resource);
    for (const resource of resources) {
      byId.set(resource.employeeId, {
        ...resource,
        portfolioCode: resource.portfolio.code,
        skills: resource.skills.map((item) => `${item.skill.name}:${item.proficiency}:${item.yearsExperience}`).join("; "),
        certifications: resource.certifications.map((item) => `${item.name}:${item.issuer || ""}:${item.issueDate?.toISOString().slice(0, 10) || ""}`).join("; "),
      });
    }
    const rows = classifyExcelRows(preview.rows, byId, (resource) => isAuthorizedForPortfolio(req.user!, resource.portfolioId));
    await writeAudit({ actorId: req.user!.id, action: "PREVIEW_RESOURCE_EXCEL_IMPORT", entityType: "ResourceImportPreview", after: { rowCount: preview.rows.length, mappedFieldCount: Object.keys(preview.mapping).length } });
    return res.json({ ...preview, rows: preview.rows.map((row, index) => {
      const reconciled = rows[index];
      if (reconciled.status === "BLOCKED") return { ...row, employeeId: row.values.employeeId || null, status: reconciled.status, changes: [], notes: reconciled.notes };
      return { ...row, employeeId: row.values.employeeId || null, status: reconciled.status, changes: reconciled.changes, notes: reconciled.notes };
    }) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid workbook" });
  }
});

router.post("/excel-commit", requireRole("ADMIN", "RMG"), async (req, res) => {
  const parsed = z.object({ workbookBase64: z.string().min(1).max(14_000_000), sheetName: z.string().min(1), mapping: z.record(z.string(), z.string()), acceptedRowNumbers: z.array(z.number().int().positive()).min(1), editedRows: z.record(z.string(), z.record(z.string(), z.string())).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const preview = await parseResourceExcelPreview(Buffer.from(parsed.data.workbookBase64, "base64"), parsed.data.mapping as any, parsed.data.sheetName);
    const accepted = new Set(parsed.data.acceptedRowNumbers);
    const rows = preview.rows.filter((row) => accepted.has(row.rowNumber)).map((row) => ({ ...row, values: { ...row.values, ...(parsed.data.editedRows?.[String(row.rowNumber)] || {}) } }));
    if (!rows.length || rows.length !== accepted.size) return res.status(400).json({ error: "Selected rows do not match the workbook preview" });
    const ids = [...new Set(rows.map((row) => row.values.employeeId).filter((id): id is string => Boolean(id)))];
    const existing = await prisma.resource.findMany({ where: { employeeId: { in: ids } } });
    const byId = new Map(existing.map((resource) => [resource.employeeId, resource]));
    const duplicates = new Set(ids.filter((id) => rows.filter((row) => row.values.employeeId === id).length > 1));
    const batch = await prisma.importBatch.create({ data: { source: "EXCEL_WORKBOOK", status: "RUNNING" } });
    const createdCount = await prisma.$transaction(async (tx) => {
      let created = 0;
      for (const row of rows) {
        const values = row.values as Record<string, string>;
        if (row.errors.length || duplicates.has(values.employeeId)) throw new Error(`Row ${row.rowNumber} is invalid or duplicated`);
        const current = byId.get(values.employeeId);
        if (current && !isAuthorizedForPortfolio(req.user!, current.portfolioId)) throw new Error(`Not authorized to update ${values.employeeId}`);
        const portfolio = values.portfolioCode ? await tx.portfolio.findUnique({ where: { code: values.portfolioCode } }) : current ? await tx.portfolio.findUnique({ where: { id: current.portfolioId } }) : null;
        if (!portfolio) throw new Error(`Row ${row.rowNumber}: portfolio code was not found`);
        if (!current && (!values.name || !values.email || !values.location || !values.costRate || !values.employeeId)) throw new Error(`Row ${row.rowNumber} is missing required resource fields`);
        const gender = (values.gender || current?.gender || "UNDISCLOSED").toUpperCase() as "FEMALE" | "MALE" | "OTHER" | "UNDISCLOSED";
        const data = { name: values.name ?? current?.name, email: values.email ?? current?.email, gender, country: values.country ?? current?.country, workLocation: values.workLocation ?? current?.workLocation ?? values.location ?? current?.location, location: values.location ?? current?.location, willingToRelocate: values.willingToRelocate ? ["true", "yes", "1"].includes(values.willingToRelocate.toLowerCase()) : current?.willingToRelocate ?? false, costRate: values.costRate ? Number(values.costRate) : current?.costRate ?? 0, currency: values.currency ?? current?.currency ?? "USD", portfolioId: portfolio.id, managerName: values.managerName ?? current?.managerName, designation: values.designation ?? current?.designation, subCategory: values.subCategory ?? current?.subCategory, dateOfJoining: values.dateOfJoining ? new Date(values.dateOfJoining) : current?.dateOfJoining, priorExperienceYears: values.priorExperienceYears ? Number(values.priorExperienceYears) : current?.priorExperienceYears ?? (values.totalYoe ? Number(values.totalYoe) : 0), sourceSystem: current?.sourceSystem ?? "EXCEL_IMPORT" };
        const resource = current ? await tx.resource.update({ where: { id: current.id }, data }) : await tx.resource.create({ data: { employeeId: values.employeeId, ...data } });
        if (!current) created++;
        for (const entry of values.skills?.split(";").map((part) => part.trim()).filter(Boolean) ?? []) {
          const [name, proficiency, years] = entry.split(":").map((part) => part.trim());
          if (!name) continue;
          const skill = await tx.skill.upsert({ where: { name }, create: { name }, update: {} });
          await tx.resourceSkill.upsert({ where: { resourceId_skillId: { resourceId: resource.id, skillId: skill.id } }, create: { resourceId: resource.id, skillId: skill.id, proficiency: Number(proficiency) || 3, yearsExperience: Number(years) || 0 }, update: { proficiency: Number(proficiency) || 3, yearsExperience: Number(years) || 0 } });
        }
        for (const entry of values.certifications?.split(";").map((part) => part.trim()).filter(Boolean) ?? []) {
          const [name, issuer, issueDate] = entry.split(":").map((part) => part.trim());
          if (name) await tx.certification.upsert({ where: { resourceId_name: { resourceId: resource.id, name } }, create: { resourceId: resource.id, name, issuer: issuer || null, issueDate: issueDate ? new Date(issueDate) : null }, update: { issuer: issuer || null, issueDate: issueDate ? new Date(issueDate) : null } });
        }
        await tx.importRecord.create({ data: { batchId: batch.id, employeeId: values.employeeId, rawData: values as any, status: current ? "UPDATED" : "CREATED", resourceId: resource.id } });
      }
      return created;
    });
    const updatedCount = rows.length - createdCount;
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED", createdCount, updatedCount, quarantinedCount: 0, completedAt: new Date() } });
    await writeAudit({ actorId: req.user!.id, action: "IMPORT_RESOURCE_EXCEL", entityType: "ImportBatch", entityId: batch.id, after: { createdCount, updatedCount } });
    return res.json({ createdCount, updatedCount });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Workbook import failed" });
  }
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
