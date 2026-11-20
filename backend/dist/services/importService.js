"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRow = void 0;
exports.assertQuarantineAccess = assertQuarantineAccess;
exports.quarantineErrors = quarantineErrors;
exports.mutateQuarantine = mutateQuarantine;
exports.parseImportCsvManifest = parseImportCsvManifest;
exports.parseImportCsv = parseImportCsv;
exports.retryImportTransaction = retryImportTransaction;
exports.summarizeImport = summarizeImport;
exports.runImport = runImport;
const node_crypto_1 = require("node:crypto");
const sync_1 = require("csv-parse/sync");
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const audit_1 = require("../utils/audit");
const rbac_1 = require("../middleware/rbac");
const resourceExcelPreview_1 = require("../utils/resourceExcelPreview");
async function assertQuarantineAccess(tx, record, actor, proposed) {
    const row = (0, resourceExcelPreview_1.normalizeImportRow)((proposed ?? record.rawData));
    const current = row.employeeId ? await tx.resource.findUnique({ where: { employeeId: row.employeeId } }) : null;
    const target = row.portfolioCode ? await tx.portfolio.findUnique({ where: { code: row.portfolioCode } }) : current ? await tx.portfolio.findUnique({ where: { id: current.portfolioId } }) : null;
    if ((current && !(0, rbac_1.isAuthorizedForPortfolio)(actor, current.portfolioId)) || (target && !(0, rbac_1.isAuthorizedForPortfolio)(actor, target.id)))
        throw new Error("Record unavailable or outside authorized scope");
    const batch = await tx.importBatch.findUniqueOrThrow({ where: { id: record.batchId } });
    if (!target && actor.role !== "ADMIN" && !(actor.role === "RMG" && batch.actorId === actor.id))
        throw new Error("Record unavailable or outside authorized scope");
    return { row, current, target, batch, sensitive: actor.role === "ADMIN" || actor.role === "HR" || Boolean(target && (0, rbac_1.isAuthorizedForPortfolio)(actor, target.id)) };
}
function quarantineErrors(value) {
    if (Array.isArray(value))
        return value.flatMap(quarantineErrors);
    if (typeof value === "string")
        return [value];
    if (value && typeof value === "object")
        return Object.entries(value).flatMap(([key, item]) => quarantineErrors(item).map((text) => `${key}: ${text}`));
    return [];
}
async function mutateQuarantine(recordId, actor, input) {
    return retryImportTransaction(() => prisma_1.prisma.$transaction(async (tx) => {
        const record = await tx.importRecord.findUniqueOrThrow({ where: { id: recordId } });
        const access = await assertQuarantineAccess(tx, record, actor);
        if (record.version !== input.expectedVersion)
            throw new Error("Stale version; reload before editing");
        if (!["QUARANTINED", "FAILED"].includes(record.status))
            throw new Error("Only quarantined or failed rows can be changed");
        if (input.action === "review" && !["ADMIN", "RMG"].includes(actor.role))
            throw new Error("RMG owns review");
        const values = input.action === "save" ? { ...(0, resourceExcelPreview_1.normalizeImportRow)(record.rawData), ...(0, resourceExcelPreview_1.normalizeImportRow)(input.values ?? {}) } : record.rawData;
        if (input.action === "save" && input.values && !access.sensitive)
            throw new Error("Sensitive values can only be edited within an authorized portfolio");
        const { row, current, target } = await assertQuarantineAccess(tx, record, actor, values);
        const errors = (0, resourceExcelPreview_1.validateImportRow)(row, !current);
        if (!target)
            errors.push("Portfolio code was not found");
        if ((current && !(0, rbac_1.isAuthorizedForPortfolio)(actor, current.portfolioId)) || (target && !(0, rbac_1.isAuthorizedForPortfolio)(actor, target.id)))
            errors.push("Not authorized for current or target portfolio");
        if (await tx.importRecord.count({ where: { batchId: record.batchId, id: { not: record.id }, employeeId: row.employeeId || "UNKNOWN", status: { in: ["PENDING", "QUARANTINED", "FAILED"] } } }))
            errors.push("Resolve or discard duplicate siblings before release");
        const data = { version: { increment: 1 }, updatedAt: new Date(), updatedBy: actor.id };
        if (input.action === "save")
            Object.assign(data, { rawData: values, employeeId: row.employeeId || "UNKNOWN", errors: client_1.Prisma.DbNull, validation: client_1.Prisma.DbNull, review: client_1.Prisma.DbNull });
        if (input.action === "validate")
            Object.assign(data, { errors, validation: { valid: !errors.length, errors, version: record.version, at: new Date().toISOString(), actorId: actor.id, resourceVersion: current?.updatedAt.toISOString() ?? null } });
        if (input.action === "review")
            Object.assign(data, { review: { reviewed: input.reviewed ?? true, actorId: actor.id, at: new Date().toISOString() }, validation: client_1.Prisma.DbNull });
        if (input.action === "discard")
            data.status = "DISCARDED";
        const updated = await tx.importRecord.update({ where: { id: record.id }, data });
        const safeDiff = input.action === "save" ? Object.fromEntries(Object.keys(input.values ?? {}).map((field) => [field, { before: record.rawData[field] ?? null, after: values[field] ?? null }])) : undefined;
        await (0, audit_1.writeAudit)({ actorId: actor.id, entityType: "ImportRecord", entityId: record.id, action: `QUARANTINE_${input.action.toUpperCase()}`, before: input.action === "save" ? { version: record.version, fields: safeDiff } : undefined, after: { version: updated.version, fields: input.action === "save" ? safeDiff : Object.keys(input.values ?? {}), status: updated.status } }, tx);
        await summarizeImport(tx, record.batchId);
        return { id: updated.id, version: updated.version, status: updated.status };
    }, { isolationLevel: "Serializable" }));
}
const validateRow = (row) => (0, resourceExcelPreview_1.validateImportRow)((0, resourceExcelPreview_1.normalizeImportRow)(row), true);
exports.validateRow = validateRow;
function parseImportCsvManifest(csvText) {
    const entries = (0, sync_1.parse)(csvText, { columns: false, skip_empty_lines: false, relax_column_count: true, bom: true, info: true });
    const headerIndex = entries.findIndex(({ record }) => record.some((value) => value.trim()));
    if (headerIndex < 0)
        throw new Error("CSV has no header");
    const headers = entries[headerIndex].record.map((value) => value.trim());
    if (new Set(headers).size !== headers.length)
        throw new Error("Duplicate CSV headings");
    const data = entries.slice(headerIndex + 1);
    if (data.length > 5000)
        throw new Error("Import exceeds 5,000 rows");
    const nonblank = data.filter(({ record }) => record.some((value) => value.trim()));
    const manifest = nonblank.map(({ record, info }) => {
        if (record.length > headers.length)
            throw new Error("CSV row has more values than headings");
        const source = Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]));
        return { rowNumber: info.lines, source: (0, resourceExcelPreview_1.redactImportSource)(source), mapped: (0, resourceExcelPreview_1.normalizeImportRow)(source), selected: true };
    });
    return { rows: manifest.map((row) => row.mapped), manifest, blankRowCount: data.length - nonblank.length };
}
function parseImportCsv(csvText) {
    return parseImportCsvManifest(csvText).rows;
}
async function retryImportTransaction(operation) {
    for (let attempt = 0;; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            if (attempt >= 3 || !(error instanceof client_1.Prisma.PrismaClientKnownRequestError) || error.code !== "P2034")
                throw error;
        }
    }
}
async function summarizeImport(tx, batchId) {
    await tx.importBatch.update({ where: { id: batchId }, data: { id: batchId } });
    const outcomes = await tx.importRecord.groupBy({ by: ["status"], where: { batchId }, _count: true });
    const totals = Object.fromEntries(outcomes.map((outcome) => [outcome.status, outcome._count]));
    const completed = await tx.importBatch.update({ where: { id: batchId }, data: { status: totals.PENDING ? "RUNNING" : totals.FAILED ? "FAILED" : "COMPLETED", createdCount: totals.CREATED || 0, updatedCount: totals.UPDATED || 0, quarantinedCount: totals.QUARANTINED || 0, completedAt: totals.PENDING ? null : new Date() } });
    return { ...completed, totals };
}
async function runImport(rows, source, actorId, options = {}) {
    const actor = actorId ? await prisma_1.prisma.user.findUnique({ where: { id: actorId }, include: { portfolioAuthorizations: { where: { isActive: true } } } }) : null;
    if (actorId && (!actor?.active || !["ADMIN", "RMG", "HR"].includes(actor.role)))
        throw new Error("Not authorized to import resources");
    const authorized = (portfolioId) => !actorId || Boolean(actor && (0, rbac_1.isAuthorizedForPortfolio)({ role: actor.role, authorizedPortfolioIds: actor.portfolioAuthorizations.map((grant) => grant.portfolioId) }, portfolioId));
    const normalized = rows.map(resourceExcelPreview_1.normalizeImportRow);
    const counts = new Map();
    for (const row of normalized)
        if (row.employeeId)
            counts.set(row.employeeId, (counts.get(row.employeeId) || 0) + 1);
    if (source === "EXCEL_WORKBOOK" && (!options.expectedVersions || !options.idempotencyKey))
        throw new Error("Preview versions and idempotency key are required");
    const digest = (0, node_crypto_1.createHash)("sha256").update(JSON.stringify({ normalized, source, actorId, expectedVersions: options.expectedVersions, manifest: options.manifest, provenance: options.provenance })).digest("hex");
    let batch = options.quarantinedRecordId ? null : options.idempotencyKey ? await prisma_1.prisma.importBatch.findUnique({ where: { idempotencyKey: options.idempotencyKey } }) : null;
    if (batch && batch.digest !== digest)
        throw new Error("Idempotency key payload mismatch");
    if (!batch && !options.quarantinedRecordId) {
        try {
            batch = await prisma_1.prisma.importBatch.create({ data: { source, status: "RUNNING", actorId, digest, idempotencyKey: options.idempotencyKey, provenance: options.provenance, records: { create: normalized.map((row, index) => ({ employeeId: row.employeeId || "UNKNOWN", rawData: row, originalMapped: (0, resourceExcelPreview_1.redactImportSource)(options.manifest?.[index].mapped ?? row), originalSource: options.manifest?.[index] ? (0, resourceExcelPreview_1.redactImportSource)(options.manifest[index].source) : client_1.Prisma.JsonNull, rowNumber: options.manifest?.[index].rowNumber ?? null, status: "PENDING", updatedBy: actorId })) } } });
        }
        catch (error) {
            if (!options.idempotencyKey)
                throw error;
            batch = await prisma_1.prisma.importBatch.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
            if (!batch || batch.digest !== digest)
                throw error;
        }
    }
    const records = options.quarantinedRecordId ? [await prisma_1.prisma.importRecord.findUniqueOrThrow({ where: { id: options.quarantinedRecordId } })] : await prisma_1.prisma.importRecord.findMany({ where: { batchId: batch.id }, orderBy: { rowNumber: "asc" } });
    const batchId = records[0]?.batchId ?? batch.id;
    for (const [index, record] of records.entries()) {
        if (!["PENDING", "FAILED", ...(options.quarantinedRecordId ? ["QUARANTINED"] : [])].includes(record.status)) {
            if (options.quarantinedRecordId && JSON.stringify((0, resourceExcelPreview_1.normalizeImportRow)(record.rawData)) !== JSON.stringify(normalized[0]))
                throw new Error("Record already processed with different values");
            continue;
        }
        try {
            await retryImportTransaction(() => prisma_1.prisma.$transaction(async (tx) => {
                await tx.importBatch.update({ where: { id: batchId }, data: { id: batchId } });
                const latest = await tx.importRecord.findUniqueOrThrow({ where: { id: record.id } });
                if (options.expectedVersion !== undefined && latest.version !== options.expectedVersion)
                    throw new Error("Record changed during release; reload before editing");
                if (options.quarantinedRecordId && actor)
                    await assertQuarantineAccess(tx, latest, { id: actor.id, role: actor.role, authorizedPortfolioIds: actor.portfolioAuthorizations.map((grant) => grant.portfolioId) });
                if (latest.status !== record.status || latest.updatedAt?.getTime() !== record.updatedAt?.getTime()) {
                    if (options.quarantinedRecordId && JSON.stringify((0, resourceExcelPreview_1.normalizeImportRow)(latest.rawData)) !== JSON.stringify(normalized[0]))
                        throw new Error("Record changed during release; reload before editing");
                    return;
                }
                const claimed = await tx.importRecord.updateMany({ where: { id: record.id, status: record.status, updatedAt: record.updatedAt }, data: { updatedAt: new Date(), updatedBy: actorId, version: { increment: 1 }, validation: client_1.Prisma.DbNull } });
                if (!claimed.count)
                    return;
                const original = record;
                const row = options.quarantinedRecordId ? normalized[0] : (0, resourceExcelPreview_1.normalizeImportRow)(record.rawData);
                const current = row.employeeId ? await tx.resource.findUnique({ where: { employeeId: row.employeeId } }) : null;
                const portfolio = row.portfolioCode ? await tx.portfolio.findUnique({ where: { code: row.portfolioCode } }) : current ? await tx.portfolio.findUnique({ where: { id: current.portfolioId } }) : null;
                const errors = (0, resourceExcelPreview_1.validateImportRow)(row, !current);
                if (options.expectedVersions && options.expectedVersions[row.employeeId || ""] !== (current?.updatedAt.toISOString() ?? null))
                    errors.push("Resource changed since preview; review again");
                if (row.employeeId && (counts.get(row.employeeId) || 0) > 1)
                    errors.push("Duplicate employeeId in import");
                if (options.quarantinedRecordId && await tx.importRecord.count({ where: { batchId, id: { not: record.id }, employeeId: row.employeeId, status: { in: ["PENDING", "QUARANTINED", "FAILED"] } } }))
                    errors.push("Resolve or discard duplicate siblings before release");
                if (!portfolio)
                    errors.push("Portfolio code was not found");
                if ((current && !authorized(current.portfolioId)) || (portfolio && !authorized(portfolio.id)))
                    errors.push("Not authorized for current or target portfolio");
                if (errors.length) {
                    const data = { employeeId: row.employeeId || "UNKNOWN", rawData: row, errors, status: "QUARANTINED" };
                    if (original)
                        await tx.importRecord.update({ where: { id: original.id }, data });
                    else
                        await tx.importRecord.create({ data: { ...data, batchId } });
                    await (0, audit_1.writeAudit)({ actorId: actorId ?? null, action: "QUARANTINE_IMPORT_RECORD", entityType: "ImportRecord", entityId: record.id, after: { errors } }, tx);
                    await summarizeImport(tx, batchId);
                    return;
                }
                if (!options.quarantinedRecordId && options.manifest?.[index].selected === false) {
                    await tx.importRecord.update({ where: { id: record.id }, data: { status: "SKIPPED", errors: client_1.Prisma.JsonNull } });
                    await summarizeImport(tx, batchId);
                    return;
                }
                const dateOfJoining = row.dateOfJoining ? new Date(row.dateOfJoining) : current?.dateOfJoining;
                const tenure = dateOfJoining ? Math.max(0, (Date.now() - dateOfJoining.getTime()) / (365.25 * 86400000)) : 0;
                const data = {
                    name: row.name ?? current.name,
                    location: row.location ?? current.location,
                    costRate: row.costRate !== undefined ? Number(row.costRate) : current.costRate,
                    portfolioId: portfolio.id,
                    gender: (row.gender?.toUpperCase() ?? current?.gender ?? "UNDISCLOSED"),
                    country: row.country ?? current?.country,
                    workLocation: row.workLocation ?? current?.workLocation ?? row.location,
                    willingToRelocate: row.willingToRelocate ? ["yes", "true", "1"].includes(row.willingToRelocate.toLowerCase()) : current?.willingToRelocate ?? false,
                    currency: row.currency ?? current?.currency ?? "USD",
                    managerName: row.managerName ?? current?.managerName,
                    designation: row.designation ?? current?.designation,
                    subCategory: row.subCategory ?? current?.subCategory,
                    dateOfJoining,
                    priorExperienceYears: row.priorExperienceYears !== undefined ? Number(row.priorExperienceYears) : row.totalYoe !== undefined ? Math.max(0, Number(row.totalYoe) - tenure) : current?.priorExperienceYears ?? 0,
                };
                const resource = current ? await tx.resource.update({ where: { id: current.id }, data }) : await tx.resource.create({ data: { ...data, employeeId: row.employeeId, sourceSystem: source } });
                for (const entry of row.skills?.split(";").filter((part) => part.trim()) ?? []) {
                    const [name, proficiency, years] = entry.split(":").map((part) => part.trim());
                    const skill = await tx.skill.upsert({ where: { name }, create: { name }, update: {} });
                    const values = { proficiency: proficiency ? Number(proficiency) : 3, yearsExperience: years ? Number(years) : 0 };
                    await tx.resourceSkill.upsert({ where: { resourceId_skillId: { resourceId: resource.id, skillId: skill.id } }, create: { resourceId: resource.id, skillId: skill.id, ...values }, update: values });
                }
                for (const entry of row.certifications?.split(";").filter((part) => part.trim()) ?? []) {
                    const [name, issuer, date] = entry.split(":").map((part) => part.trim());
                    const values = { issuer: issuer || undefined, issueDate: date ? new Date(date) : undefined };
                    await tx.certification.upsert({ where: { resourceId_name: { resourceId: resource.id, name } }, create: { resourceId: resource.id, name, ...values }, update: values });
                }
                const recordData = { employeeId: row.employeeId, rawData: row, status: current ? "UPDATED" : "CREATED", resourceId: resource.id, errors: client_1.Prisma.JsonNull };
                if (original)
                    await tx.importRecord.update({ where: { id: original.id }, data: recordData });
                else
                    await tx.importRecord.create({ data: { batchId, ...recordData } });
                await (0, audit_1.writeAudit)({ actorId: actorId ?? null, action: options.quarantinedRecordId ? "REVALIDATE_AND_RELEASE_IMPORT" : "IMPORT_RESOURCE", entityType: "ImportRecord", entityId: record.id, after: { resourceId: resource.id, status: recordData.status } }, tx);
                await summarizeImport(tx, batchId);
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }));
        }
        catch (error) {
            if (error instanceof Error && error.message === "Record changed during release; reload before editing")
                throw error;
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2034")
                continue;
            await retryImportTransaction(() => prisma_1.prisma.$transaction(async (tx) => {
                await tx.importBatch.update({ where: { id: batchId }, data: { id: batchId } });
                await tx.importRecord.updateMany({ where: { id: record.id, status: record.status, updatedAt: record.updatedAt }, data: { status: "FAILED", rawData: options.quarantinedRecordId ? normalized[0] : undefined, errors: ["Row transaction failed; retry the same request"], updatedBy: actorId, updatedAt: new Date() } });
                await summarizeImport(tx, batchId);
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable }));
        }
    }
    const completed = await retryImportTransaction(() => prisma_1.prisma.$transaction((tx) => summarizeImport(tx, batchId), { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable }));
    const { totals } = completed;
    let notificationPending = false;
    try {
        await retryImportTransaction(() => prisma_1.prisma.$transaction(async (tx) => {
            await tx.importBatch.update({ where: { id: batchId }, data: { id: batchId } });
            const quarantineCount = await tx.importRecord.count({ where: { batchId, status: { in: ["QUARANTINED", "FAILED", "PENDING"] } } });
            if (quarantineCount) {
                const recipients = await tx.user.findMany({ where: { active: true, OR: [{ role: "RMG" }, ...(actorId ? [{ id: actorId }] : [])] }, select: { id: true } });
                for (const { id } of recipients) {
                    const where = { userId: id, relatedEntityId: batchId, type: "IMPORT_QUARANTINE" };
                    const data = { message: `${quarantineCount} records need review in import batch ${batchId}.`, resolvedAt: null };
                    if (await tx.notification.findFirst({ where }))
                        await tx.notification.updateMany({ where, data });
                    else
                        await tx.notification.create({ data: { ...where, ...data, relatedEntityType: "ImportBatch" } });
                }
            }
            else
                await tx.notification.updateMany({ where: { relatedEntityId: batchId, type: "IMPORT_QUARANTINE" }, data: { resolvedAt: new Date() } });
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable }));
    }
    catch {
        notificationPending = true;
    }
    return { ...completed, totals, notificationPending };
}
