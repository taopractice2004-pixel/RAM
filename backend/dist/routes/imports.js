"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const importService_1 = require("../services/importService");
const prisma_1 = require("../prisma");
const rbac_1 = require("../middleware/rbac");
const audit_1 = require("../utils/audit");
const resourceExcelPreview_1 = require("../utils/resourceExcelPreview");
const resourceExcelReconcile_1 = require("../utils/resourceExcelReconcile");
const router = (0, express_1.Router)();
const MAX_WORKBOOK_BYTES = 200 * 1024 * 1024;
const MAX_WORKBOOK_BASE64 = Math.ceil(MAX_WORKBOOK_BYTES / 3) * 4;
const workbookSchema = zod_1.z.object({ expectedVersions: zod_1.z.record(zod_1.z.string(), zod_1.z.string().nullable()).optional(), idempotencyKey: zod_1.z.string().min(1).max(200).optional(), filename: zod_1.z.string().max(255).optional(), workbookBase64: zod_1.z.string().min(1).max(MAX_WORKBOOK_BASE64), sheetName: zod_1.z.string().optional(), headerRow: zod_1.z.number().int().min(1).max(5000).optional(), editedRows: zod_1.z.record(zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.string())).optional(), mapping: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional() });
router.post("/upload", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const parsed = zod_1.z.object({ csvText: zod_1.z.string().min(1).max(14_000_000), idempotencyKey: zod_1.z.string().min(1).max(200), filename: zod_1.z.string().max(255).optional() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const csv = (0, importService_1.parseImportCsvManifest)(parsed.data.csvText);
        return res.status(201).json(await (0, importService_1.runImport)(csv.rows, "BULK_ADD_RECORDS", req.user.id, { idempotencyKey: parsed.data.idempotencyKey, manifest: csv.manifest, provenance: { filename: parsed.data.filename ?? null, format: "CSV", rowNumberMeaning: "CSV record ending physical line", blankRowCount: csv.blankRowCount, emailPolicy: "Source email values redacted" } }));
    }
    catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "CSV import failed" });
    }
});
router.post("/rmg-mis-import/preview", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const parsed = workbookSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const preview = await (0, resourceExcelPreview_1.parseResourceExcelPreview)(Buffer.from(parsed.data.workbookBase64, "base64"), parsed.data.mapping, parsed.data.sheetName, parsed.data.headerRow);
        for (const row of preview.rows)
            row.values = (0, resourceExcelPreview_1.normalizeImportRow)({ ...row.values, ...parsed.data.editedRows?.[String(row.rowNumber)] });
        const ids = preview.rows.flatMap((row) => row.values.employeeId ? [row.values.employeeId] : []);
        const resources = await prisma_1.prisma.resource.findMany({ where: { employeeId: { in: ids } }, include: { portfolio: true, skills: { include: { skill: true } }, certifications: true } });
        const portfolios = await prisma_1.prisma.portfolio.findMany({ select: { id: true, code: true } });
        const byId = new Map();
        for (const resource of resources)
            byId.set(resource.employeeId, { ...resource, portfolioCode: resource.portfolio.code, skills: resource.skills.map((item) => `${item.skill.name}:${item.proficiency}:${item.yearsExperience}`).join("; "), certifications: resource.certifications.map((item) => `${item.name}:${item.issuer || ""}:${item.issueDate?.toISOString().slice(0, 10) || ""}`).join("; ") });
        for (const row of preview.rows) {
            const current = byId.get(row.values.employeeId || "");
            row.errors = (0, resourceExcelPreview_1.validateImportRow)(row.values, !current);
            const target = portfolios.find((portfolio) => row.values.portfolioCode ? portfolio.code === row.values.portfolioCode : portfolio.id === current?.portfolioId);
            if (!target)
                row.errors.push("Portfolio code was not found");
            if (target && !(0, rbac_1.isAuthorizedForPortfolio)(req.user, target.id))
                row.errors.push("Not authorized for target portfolio");
        }
        const reconciled = (0, resourceExcelReconcile_1.classifyExcelRows)(preview.rows, byId, (resource) => (0, rbac_1.isAuthorizedForPortfolio)(req.user, resource.portfolioId));
        await (0, audit_1.writeAudit)({ actorId: req.user.id, action: "PREVIEW_RESOURCE_EXCEL_IMPORT", entityType: "ResourceImportPreview", after: { rowCount: preview.rows.length } });
        return res.json({ ...preview, expectedVersions: Object.fromEntries(ids.map((id) => [id, resources.find((resource) => resource.employeeId === id)?.updatedAt.toISOString() ?? null])), rows: preview.rows.map((row, index) => ({ ...row, ...reconciled[index] })) });
    }
    catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid workbook" });
    }
});
router.post("/rmg-mis-import/commit", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const parsed = workbookSchema.extend({ expectedVersions: zod_1.z.record(zod_1.z.string(), zod_1.z.string().nullable()), idempotencyKey: zod_1.z.string().min(1).max(200), sheetName: zod_1.z.string().min(1), mapping: zod_1.z.record(zod_1.z.string(), zod_1.z.string()), acceptedRowNumbers: zod_1.z.array(zod_1.z.number().int().positive()), editedRows: zod_1.z.record(zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.string())).optional() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const preview = await (0, resourceExcelPreview_1.parseResourceExcelPreview)(Buffer.from(parsed.data.workbookBase64, "base64"), parsed.data.mapping, parsed.data.sheetName, parsed.data.headerRow);
        const accepted = new Set(parsed.data.acceptedRowNumbers);
        if ([...accepted].some((number) => !preview.rows.some((row) => row.rowNumber === number)))
            return res.status(400).json({ error: "Selected rows do not match the workbook" });
        const rows = preview.rows.map((row) => ({ ...row, values: (0, resourceExcelPreview_1.normalizeImportRow)({ ...row.values, ...parsed.data.editedRows?.[String(row.rowNumber)] }) }));
        const ids = rows.flatMap((row) => row.values.employeeId ? [row.values.employeeId] : []);
        if (ids.some((id) => !Object.prototype.hasOwnProperty.call(parsed.data.expectedVersions, id)))
            return res.status(409).json({ error: "Revalidate preview before committing changed employee IDs" });
        const batch = await (0, importService_1.runImport)(rows.map((row) => row.values), "EXCEL_WORKBOOK", req.user.id, {
            idempotencyKey: parsed.data.idempotencyKey,
            expectedVersions: parsed.data.expectedVersions,
            provenance: { filename: parsed.data.filename ?? null, worksheet: preview.sheetName, mapping: preview.mapping, blankRowCount: preview.blankRowCount, emailPolicy: "Source email values redacted" },
            manifest: rows.map((row, index) => ({ rowNumber: row.rowNumber, source: row.source, mapped: preview.rows[index].values, selected: accepted.has(row.rowNumber) })),
        });
        return res.json({ ...batch, batchId: batch.id });
    }
    catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Workbook import failed" });
    }
});
router.get("/", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (_req, res) => {
    res.json(await prisma_1.prisma.importBatch.findMany({ orderBy: { startedAt: "desc" }, take: 50 }));
});
router.get("/quarantine/list", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "");
    const batchId = String(req.query.batchId ?? "");
    const statuses = ["QUARANTINED", "FAILED", "PENDING"];
    const where = { status: statuses.includes(status) ? status : { in: statuses } };
    if (batchId)
        where.batchId = batchId;
    if (search)
        where.OR = [{ employeeId: { contains: search, mode: "insensitive" } }, { rawData: { path: ["name"], string_contains: search } }];
    const candidates = await prisma_1.prisma.importRecord.findMany({ where, orderBy: { createdAt: "desc" }, include: { batch: { select: { id: true, source: true, startedAt: true, actorId: true, provenance: true } } } });
    const authorizedRecords = [];
    for (const record of candidates) {
        try {
            const access = await (0, importService_1.assertQuarantineAccess)(prisma_1.prisma, record, { id: req.user.id, role: req.user.role, authorizedPortfolioIds: req.user.authorizedPortfolioIds });
            const rawData = record.rawData;
            const safe = { ...record, errors: (0, importService_1.quarantineErrors)(record.errors), rawData: access.sensitive ? rawData : Object.fromEntries(Object.entries(rawData).filter(([key]) => !["costRate", "portfolioCode"].includes(key))), originalMapped: access.sensitive ? record.originalMapped : null, originalSource: access.sensitive ? record.originalSource : null, batch: access.sensitive ? record.batch : { id: record.batch.id, source: record.batch.source, startedAt: record.batch.startedAt }, capabilities: { edit: access.sensitive, release: Boolean(access.target && (req.user.role === "ADMIN" || req.user.role === "HR" || req.user.authorizedPortfolioIds.includes(access.target.id))), review: ["ADMIN", "RMG"].includes(req.user.role), discard: true } };
            authorizedRecords.push(safe);
        }
        catch { }
    }
    const visible = authorizedRecords;
    const pageRecords = visible.slice((page - 1) * pageSize, page * pageSize);
    const counts = visible.reduce((result, record) => { result[record.status] = (result[record.status] || 0) + 1; return result; }, {});
    return res.json({ records: pageRecords, page, pageSize, total: visible.length, pages: Math.ceil(visible.length / pageSize), counts });
});
router.get("/quarantine/:recordId", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    try {
        const record = await prisma_1.prisma.importRecord.findUniqueOrThrow({ where: { id: req.params.recordId }, include: { batch: { select: { id: true, source: true, startedAt: true, actorId: true, provenance: true } } } });
        const access = await (0, importService_1.assertQuarantineAccess)(prisma_1.prisma, record, { id: req.user.id, role: req.user.role, authorizedPortfolioIds: req.user.authorizedPortfolioIds });
        const audits = await prisma_1.prisma.auditLog.findMany({ where: { entityType: "ImportRecord", entityId: record.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, action: true, actorId: true, createdAt: true, success: true, message: true } });
        return res.json({ ...record, errors: (0, importService_1.quarantineErrors)(record.errors), rawData: access.sensitive ? record.rawData : Object.fromEntries(Object.entries(record.rawData).filter(([key]) => !["costRate", "portfolioCode"].includes(key))), originalMapped: access.sensitive ? record.originalMapped : null, originalSource: access.sensitive ? record.originalSource : null, batch: access.sensitive ? record.batch : { id: record.batch.id, source: record.batch.source, startedAt: record.batch.startedAt }, audits, capabilities: { edit: access.sensitive, release: Boolean(access.target && (req.user.role === "ADMIN" || req.user.role === "HR" || req.user.authorizedPortfolioIds.includes(access.target.id))), review: ["ADMIN", "RMG"].includes(req.user.role), discard: true } });
    }
    catch {
        return res.status(404).json({ error: "Record unavailable" });
    }
});
router.patch("/quarantine/:recordId", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const parsed = zod_1.z.object({ expectedVersion: zod_1.z.number().int().nonnegative(), action: zod_1.z.enum(["save", "validate", "review", "discard"]), values: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(), reviewed: zod_1.z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const result = await (0, importService_1.mutateQuarantine)(req.params.recordId, { id: req.user.id, role: req.user.role, authorizedPortfolioIds: req.user.authorizedPortfolioIds }, parsed.data);
        return res.json(result);
    }
    catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : "Quarantine update failed" });
    }
});
router.get("/:id", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const batch = await prisma_1.prisma.importBatch.findUnique({ where: { id: req.params.id }, include: { records: true } });
    if (!batch)
        return res.status(404).json({ error: "Batch not found" });
    const records = [];
    for (const record of batch.records) {
        try {
            const access = await (0, importService_1.assertQuarantineAccess)(prisma_1.prisma, record, { id: req.user.id, role: req.user.role, authorizedPortfolioIds: req.user.authorizedPortfolioIds });
            records.push({ ...record, rawData: access.sensitive ? record.rawData : Object.fromEntries(Object.entries(record.rawData).filter(([key]) => !["costRate", "portfolioCode"].includes(key))), originalMapped: access.sensitive ? record.originalMapped : null, originalSource: access.sensitive ? record.originalSource : null });
        }
        catch { }
    }
    return res.json({ id: batch.id, source: batch.source, status: batch.status, startedAt: batch.startedAt, records });
});
router.post("/quarantine/:recordId/discard", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    try {
        await (0, importService_1.retryImportTransaction)(() => prisma_1.prisma.$transaction(async (tx) => {
            const record = await tx.importRecord.findUnique({ where: { id: req.params.recordId } });
            if (record?.status === "DISCARDED")
                return;
            if (!record || !["QUARANTINED", "FAILED", "PENDING"].includes(record.status))
                throw new Error("Only unresolved records can be discarded");
            await (0, importService_1.assertQuarantineAccess)(tx, record, { id: req.user.id, role: req.user.role, authorizedPortfolioIds: req.user.authorizedPortfolioIds });
            await tx.importBatch.update({ where: { id: record.batchId }, data: { id: record.batchId } });
            await tx.importRecord.update({ where: { id: record.id }, data: { status: "DISCARDED", updatedBy: req.user.id, updatedAt: new Date() } });
            const batch = await (0, importService_1.summarizeImport)(tx, record.batchId);
            if (!batch.totals.QUARANTINED && !batch.totals.FAILED && !batch.totals.PENDING)
                await tx.notification.updateMany({ where: { relatedEntityId: record.batchId, type: "IMPORT_QUARANTINE" }, data: { resolvedAt: new Date() } });
            await (0, audit_1.writeAudit)({ actorId: req.user.id, action: "DISCARD_QUARANTINED_IMPORT_RECORD", entityType: "ImportRecord", entityId: record.id, before: { status: record.status, version: record.version, employeeId: record.employeeId } }, tx);
        }, { isolationLevel: "Serializable" }));
        return res.json({ ok: true });
    }
    catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : "Discard failed" });
    }
});
router.post("/quarantine/:recordId/resolve", (0, rbac_1.requireRole)("ADMIN", "RMG", "HR"), async (req, res) => {
    const parsed = zod_1.z.object({ expectedVersion: zod_1.z.number().int().nonnegative(), values: zod_1.z.record(zod_1.z.string(), zod_1.z.string()) }).safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    try {
        const record = await prisma_1.prisma.importRecord.findUnique({ where: { id: req.params.recordId } });
        if (!record)
            return res.status(404).json({ error: "Record not found" });
        await (0, importService_1.assertQuarantineAccess)(prisma_1.prisma, record, { id: req.user.id, role: req.user.role, authorizedPortfolioIds: req.user.authorizedPortfolioIds });
        if (record.status === "DISCARDED")
            return res.status(409).json({ error: "Discarded records cannot be released" });
        if (record.status === "PENDING")
            return res.status(409).json({ error: "Resume pending rows using the original batch request and idempotency key" });
        if (!["QUARANTINED", "FAILED"].includes(record.status))
            return res.status(409).json({ error: "Only unresolved records can be released" });
        if (parsed.data.expectedVersion !== record.version)
            return res.status(409).json({ error: "Record changed; reload before release" });
        const corrected = (0, resourceExcelPreview_1.normalizeImportRow)({ ...record.rawData, ...parsed.data.values });
        const batch = await (0, importService_1.runImport)([corrected], "QUARANTINE_RESOLUTION", req.user.id, { quarantinedRecordId: record.id, expectedVersion: parsed.data.expectedVersion });
        return res.json({ batch, record: await prisma_1.prisma.importRecord.findUnique({ where: { id: record.id } }) });
    }
    catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : "Revalidation failed" });
    }
});
exports.default = router;
