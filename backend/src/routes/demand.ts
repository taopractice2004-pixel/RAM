import express, { NextFunction, Request, Response, Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { assertPortfolioAuthorized, requireRole } from "../middleware/rbac";
import { writeAudit } from "../utils/audit";
import { parseDemandCsvList, validateDemandTransition } from "../utils/demandValidation";
import { portfolioReadWhere } from "../utils/scope";

const router = Router();
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const DOCUMENT_TYPES: Record<string, { mimeType: string; signature: (data: Buffer) => boolean }> = {
  ".pdf": { mimeType: "application/pdf", signature: (data) => data.subarray(0, 5).toString() === "%PDF-" },
  ".docx": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: (data) => data[0] === 0x50 && data[1] === 0x4b,
  },
};
const documentMetadata = { select: { fileName: true, mimeType: true, fileSize: true, updatedAt: true } };

const demandStageEnum = z.enum(["DRAFT", "PIPELINE", "COMMITTED", "FULFILLED", "CANCELLED"]);

const demandSchema = z.object({
  portfolioId: z.string().min(1),
  projectName: z.string().min(1),
  projectCode: z.string().optional().nullable(),
  clientName: z.string().optional().nullable(),
  roleName: z.string().min(1),
  location: z.string().optional().nullable(),
  requiredSkills: z.array(z.string().min(1)).default([]),
  minProficiency: z.number().int().min(1).max(5).optional().nullable(),
  minExperienceYears: z.number().min(0).optional().nullable(),
  requiredCertifications: z.array(z.string().min(1)).default([]),
  requiredFte: z.coerce.number().positive().max(9999),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  status: demandStageEnum.default("DRAFT"),
  confidenceStage: demandStageEnum.default("DRAFT"),
  ownerId: z.string().uuid().optional(),
  notes: z.string().optional().nullable(),
});

const updateSchema = demandSchema.partial();


router.get("/", async (req, res) => {
  const { portfolioId, status, roleName } = req.query as Record<string, string | undefined>;

  const where: any = { ...portfolioReadWhere(req) };
  if (portfolioId) where.portfolioId = portfolioId;
  if (status) where.status = status;
  if (roleName) where.roleName = { contains: roleName, mode: "insensitive" };

  const demandRequests = await prisma.demandRequest.findMany({
    where,
    include: { portfolio: true, owner: true, createdBy: true, updatedBy: true, document: documentMetadata },
    orderBy: { createdAt: "desc" },
  });

  res.json(demandRequests);
});

router.get("/:id", async (req, res) => {
  const demand = await prisma.demandRequest.findUnique({
    where: { id: req.params.id },
    include: { portfolio: true, owner: true, createdBy: true, updatedBy: true, document: documentMetadata },
  });
  if (!demand) return res.status(404).json({ error: "Demand request not found" });

  const scope = portfolioReadWhere(req);
  if (scope.portfolioId && !scope.portfolioId.in.includes(demand.portfolioId)) {
    return res.status(403).json({ error: "This demand is outside your portfolio scope" });
  }

  res.json(demand);
});

router.put(
  "/:id/document",
  requireRole("TA"),
  express.raw({ type: "application/octet-stream", limit: MAX_DOCUMENT_SIZE }),
  async (req: Request, res: Response) => {
    const demand = await prisma.demandRequest.findUnique({ where: { id: req.params.id } });
    if (!demand) return res.status(404).json({ error: "Demand request not found" });

    if (req.user!.role === "RMG") {
      const authorized = await assertPortfolioAuthorized(req, res, [demand.portfolioId], "DemandRequest", demand.id);
      if (!authorized) return;
    }

    const encodedFileName = req.header("x-file-name");
    if (!encodedFileName) return res.status(400).json({ error: "A file name is required" });

    let submittedFileName: string;
    try {
      submittedFileName = decodeURIComponent(encodedFileName);
    } catch {
      return res.status(400).json({ error: "The file name is invalid" });
    }

    const fileName = submittedFileName.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
    if (!fileName || /[\u0000-\u001f\u007f]/.test(fileName)) {
      return res.status(400).json({ error: "The file name is invalid" });
    }

    const documentType = DOCUMENT_TYPES[fileName.slice(fileName.lastIndexOf(".")).toLowerCase()];
    if (!documentType) return res.status(400).json({ error: "Only PDF and DOCX documents are supported" });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "The uploaded document is empty or has an invalid content type" });
    }
    if (!documentType.signature(req.body)) {
      return res.status(400).json({ error: "The uploaded file does not match its file extension" });
    }

    const previous = await prisma.demandDocument.findUnique({
      where: { demandRequestId: demand.id },
      select: { fileName: true, mimeType: true, fileSize: true },
    });
    const document = await prisma.demandDocument.upsert({
      where: { demandRequestId: demand.id },
      create: {
        demandRequestId: demand.id,
        fileName,
        mimeType: documentType.mimeType,
        fileSize: req.body.length,
        data: req.body,
      },
      update: {
        fileName,
        mimeType: documentType.mimeType,
        fileSize: req.body.length,
        data: req.body,
      },
      select: { fileName: true, mimeType: true, fileSize: true, updatedAt: true },
    });

    await writeAudit({
      actorId: req.user!.id,
      action: previous ? "REPLACE_DEMAND_DOCUMENT" : "UPLOAD_DEMAND_DOCUMENT",
      entityType: "DemandRequest",
      entityId: demand.id,
      portfolioId: demand.portfolioId,
      before: previous,
      after: { fileName: document.fileName, mimeType: document.mimeType, fileSize: document.fileSize },
    });

    res.status(previous ? 200 : 201).json(document);
  },
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
      return res.status(413).json({ error: "Documents must be 10 MB or smaller" });
    }
    next(error);
  }
);

router.get("/:id/document", requireRole("TA"), async (req, res) => {
  const document = await prisma.demandDocument.findUnique({
    where: { demandRequestId: req.params.id },
    include: { demandRequest: { select: { id: true, portfolioId: true } } },
  });
  if (!document) return res.status(404).json({ error: "Demand document not found" });

  if (req.user!.role === "RMG") {
    const authorized = await assertPortfolioAuthorized(
      req,
      res,
      [document.demandRequest.portfolioId],
      "DemandRequest",
      document.demandRequest.id
    );
    if (!authorized) return;
  }

  const encodedFileName = encodeURIComponent(document.fileName);
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="demand-document"; filename*=UTF-8''${encodedFileName}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.send(document.data);
});

router.post("/validate-csv", requireRole("TA"), async (req, res) => {
  const schema = z.object({ csvText: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const lines = parsed.data.csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return res.status(400).json({ error: "CSV must include a header row and at least one data row" });
  }

  const [headerLine, ...rowLines] = lines;
  const headers = headerLine.split(",").map((header) => header.trim());
  const validRows: any[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  rowLines.forEach((rowLine, index) => {
    const values = rowLine.split(",").map((value) => value.trim());
    if (values.length < headers.length) {
      errors.push({ rowNumber: index + 2, message: "Row has fewer columns than the header" });
      return;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex] ?? "";
    });

    try {
      const payload = {
        portfolioId: row.portfolioId || row.portfolioCode || "",
        projectName: row.projectName || row.name || "",
        projectCode: row.projectCode || undefined,
        clientName: row.clientName || undefined,
        roleName: row.roleName || row.role || "",
        location: row.location || undefined,
        requiredSkills: parseDemandCsvList(row.requiredSkills || row.skills),
        minProficiency: row.minProficiency ? Number(row.minProficiency) : undefined,
        minExperienceYears: row.minExperienceYears ? Number(row.minExperienceYears) : undefined,
        requiredCertifications: parseDemandCsvList(row.requiredCertifications || row.certifications),
        requiredFte: Number(row.requiredFte ?? 0),
        startDate: row.startDate || "",
        endDate: row.endDate || undefined,
        status: row.status || "DRAFT",
        confidenceStage: row.confidenceStage || "DRAFT",
        ownerId: row.ownerId || undefined,
        notes: row.notes || undefined,
      };

      const parsedRow = demandSchema.safeParse(payload);
      if (!parsedRow.success) {
        errors.push({ rowNumber: index + 2, message: parsedRow.error.issues.map((issue) => issue.message).join("; ") });
        return;
      }

      validRows.push(parsedRow.data);
    } catch (error: any) {
      errors.push({ rowNumber: index + 2, message: error.message || "Invalid row" });
    }
  });

  res.json({ totalRows: rowLines.length, validRows: validRows.length, errors, preview: validRows.slice(0, 10) });
});

router.post("/import", requireRole("TA"), async (req, res) => {
  const schema = z.object({ csvText: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const lines = parsed.data.csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return res.status(400).json({ error: "CSV must include a header row and at least one data row" });
  }

  const [headerLine, ...rowLines] = lines;
  const headers = headerLine.split(",").map((header) => header.trim());
  const imported: any[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  for (let index = 0; index < rowLines.length; index += 1) {
    const values = rowLines[index].split(",").map((value) => value.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex] ?? "";
    });

    const payload = {
      portfolioId: row.portfolioId || row.portfolioCode || "",
      projectName: row.projectName || row.name || "",
      projectCode: row.projectCode || undefined,
      clientName: row.clientName || undefined,
      roleName: row.roleName || row.role || "",
      location: row.location || undefined,
      requiredSkills: parseDemandCsvList(row.requiredSkills || row.skills),
      minProficiency: row.minProficiency ? Number(row.minProficiency) : undefined,
      minExperienceYears: row.minExperienceYears ? Number(row.minExperienceYears) : undefined,
      requiredCertifications: parseDemandCsvList(row.requiredCertifications || row.certifications),
      requiredFte: Number(row.requiredFte ?? 0),
      startDate: row.startDate || "",
      endDate: row.endDate || undefined,
      status: row.status || "DRAFT",
      confidenceStage: row.confidenceStage || "DRAFT",
      ownerId: row.ownerId || undefined,
      notes: row.notes || undefined,
    };

    const parsedRow = demandSchema.safeParse(payload);
    if (!parsedRow.success) {
      errors.push({ rowNumber: index + 2, message: parsedRow.error.issues.map((issue) => issue.message).join("; ") });
      continue;
    }

    const item = parsedRow.data;
    if (req.user!.role === "RMG") {
      const authorized = await assertPortfolioAuthorized(req, res, [item.portfolioId], "DemandRequest", undefined);
      if (!authorized) return;
    }

    const created = await prisma.demandRequest.create({
      data: {
        ...item,
        ownerId: item.ownerId ?? req.user!.id,
        createdById: req.user!.id,
        updatedById: req.user!.id,
        requiredFte: new Prisma.Decimal(item.requiredFte.toString()),
      },
      include: { portfolio: true, owner: true, createdBy: true, updatedBy: true },
    });
    imported.push(created);
  }

  res.status(201).json({ imported, errors, totalImported: imported.length, totalErrors: errors.length });
});

router.post("/", requireRole("TA"), async (req, res) => {
  const parsed = demandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload = parsed.data;
  if (req.user!.role === "RMG") {
    const authorized = await assertPortfolioAuthorized(req, res, [payload.portfolioId], "DemandRequest", undefined);
    if (!authorized) return;
  }

  if (!validateDemandTransition("DRAFT", payload.status)) {
    return res.status(400).json({ error: "Invalid lifecycle transition for a new demand record" });
  }

  const demand = await prisma.demandRequest.create({
    data: {
      ...payload,
      ownerId: payload.ownerId ?? req.user!.id,
      createdById: req.user!.id,
      updatedById: req.user!.id,
      requiredFte: new Prisma.Decimal(payload.requiredFte.toString()),
    },
    include: { portfolio: true, owner: true, createdBy: true, updatedBy: true },
  });

  await writeAudit({
    actorId: req.user!.id,
    action: "CREATE_DEMAND_REQUEST",
    entityType: "DemandRequest",
    entityId: demand.id,
    portfolioId: demand.portfolioId,
    after: demand,
    message: `Created demand request for ${demand.roleName} in ${demand.projectName}`,
  });

  res.status(201).json(demand);
});

router.patch("/:id", requireRole("TA"), async (req, res) => {
  const existing = await prisma.demandRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Demand request not found" });

  if (req.user!.role === "RMG") {
    const authorized = await assertPortfolioAuthorized(req, res, [existing.portfolioId], "DemandRequest", existing.id);
    if (!authorized) return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updates = parsed.data;
  const nextStatus = updates.status ?? existing.status;
  if (!validateDemandTransition(existing.status, nextStatus)) {
    return res.status(400).json({
      error: `Invalid lifecycle transition from ${existing.status} to ${nextStatus}`,
    });
  }

  const next = await prisma.demandRequest.update({
    where: { id: existing.id },
    data: {
      ...updates,
      updatedById: req.user!.id,
      ...(updates.requiredFte !== undefined ? { requiredFte: new Prisma.Decimal(String(updates.requiredFte)) } : {}),
    },
    include: { portfolio: true, owner: true, createdBy: true, updatedBy: true },
  });

  await writeAudit({
    actorId: req.user!.id,
    action: "UPDATE_DEMAND_REQUEST",
    entityType: "DemandRequest",
    entityId: next.id,
    portfolioId: next.portfolioId,
    before: existing,
    after: next,
    message: `Updated demand request ${next.roleName}`,
  });

  res.json(next);
});

router.post("/:id/cancel", requireRole("TA"), async (req, res) => {
  const existing = await prisma.demandRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Demand request not found" });

  if (req.user!.role === "RMG") {
    const authorized = await assertPortfolioAuthorized(req, res, [existing.portfolioId], "DemandRequest", existing.id);
    if (!authorized) return;
  }

  if (!validateDemandTransition(existing.status, "CANCELLED")) {
    return res.status(400).json({ error: `A demand in status ${existing.status} cannot be cancelled` });
  }

  const next = await prisma.demandRequest.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      updatedById: req.user!.id,
    },
    include: { portfolio: true, owner: true, createdBy: true, updatedBy: true },
  });

  await writeAudit({
    actorId: req.user!.id,
    action: "CANCEL_DEMAND_REQUEST",
    entityType: "DemandRequest",
    entityId: next.id,
    portfolioId: next.portfolioId,
    before: existing,
    after: next,
  });

  res.json(next);
});

export default router;
