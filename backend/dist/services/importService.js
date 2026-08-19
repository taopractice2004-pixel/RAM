"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseImportCsv = parseImportCsv;
exports.runImport = runImport;
const sync_1 = require("csv-parse/sync");
const prisma_1 = require("../prisma");
const audit_1 = require("../utils/audit");
function parseImportCsv(csvText) {
    return (0, sync_1.parse)(csvText, { columns: true, skip_empty_lines: true, trim: true });
}
const REQUIRED_FIELDS = [
    "employeeId",
    "name",
    "location",
    "costRate",
    "portfolioCode",
    "skills",
    "managerName",
    "designation",
    "dateOfJoining",
    "totalYoe",
];
// An HRMIS-reported exit only needs to identify the resource, not its full profile.
const REQUIRED_FIELDS_FOR_TERMINATE = ["employeeId"];
function validateRow(row) {
    const errors = [];
    const isTerminate = (row.action ?? "").toUpperCase() === "TERMINATE";
    const requiredFields = isTerminate ? REQUIRED_FIELDS_FOR_TERMINATE : REQUIRED_FIELDS;
    for (const field of requiredFields) {
        if (!row[field] || String(row[field]).trim() === "") {
            errors.push(`Missing required field: ${field}`);
        }
    }
    if (!isTerminate && row.costRate && Number.isNaN(Number(row.costRate))) {
        errors.push(`costRate is not numeric: ${row.costRate}`);
    }
    if (!isTerminate && row.totalYoe && Number.isNaN(Number(row.totalYoe))) {
        errors.push(`totalYoe is not numeric: ${row.totalYoe}`);
    }
    if (!isTerminate && row.taoExperience && Number.isNaN(Number(row.taoExperience))) {
        errors.push(`taoExperience is not numeric: ${row.taoExperience}`);
    }
    if (!isTerminate && row.priorExperienceYears && Number.isNaN(Number(row.priorExperienceYears))) {
        errors.push(`priorExperienceYears is not numeric: ${row.priorExperienceYears}`);
    }
    if (!isTerminate && row.dateOfJoining) {
        const doj = new Date(row.dateOfJoining);
        if (Number.isNaN(doj.getTime())) {
            errors.push(`dateOfJoining is invalid: ${row.dateOfJoining}`);
        }
        else if (row.totalYoe || row.taoExperience) {
            const now = new Date();
            const derivedTaoYears = Math.max(0, Math.round((((now.getTime() - doj.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) * 10)) / 10);
            if (row.taoExperience && Math.abs(Number(row.taoExperience) - derivedTaoYears) > 0.2) {
                errors.push(`taoExperience does not reconcile with DOJ: supplied ${row.taoExperience}, derived ${derivedTaoYears}`);
            }
            if (row.totalYoe && Number(row.totalYoe) < derivedTaoYears) {
                errors.push(`totalYoe cannot be less than TAO experience derived from DOJ (${derivedTaoYears})`);
            }
        }
    }
    if (!isTerminate && row.gender) {
        const normalizedGender = row.gender.trim().toUpperCase();
        if (!["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].includes(normalizedGender)) {
            errors.push(`gender is invalid: ${row.gender}`);
        }
    }
    return errors;
}
function parseSkills(skillsStr) {
    if (!skillsStr)
        return [];
    return skillsStr
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
        const [name, proficiency, years] = entry.split(":").map((p) => p.trim());
        return { name, proficiency: Number(proficiency) || 3, yearsExperience: Number(years) || 0 };
    });
}
function parseCertifications(certStr) {
    if (!certStr)
        return [];
    return certStr
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
        const [name, issuer, issueDate] = entry.split(":").map((p) => p.trim());
        return { name, issuer: issuer || null, issueDate: issueDate ? new Date(issueDate) : null };
    });
}
async function upsertCertifications(resourceId, certifications) {
    for (const c of certifications) {
        await prisma_1.prisma.certification.upsert({
            where: { resourceId_name: { resourceId, name: c.name } },
            create: { resourceId, name: c.name, issuer: c.issuer, issueDate: c.issueDate },
            update: { issuer: c.issuer, issueDate: c.issueDate },
        });
    }
}
/**
 * FR-1.4 / FR-1.5 / Workflow 7.1: import new/updated active-resource records from
 * an HRMIS feed or manual input sheet. Valid rows create/update Resource records;
 * invalid rows are quarantined (not activated) with the specific error captured.
 * Rows flagged as HRMIS-reported exits are routed to a pending termination request
 * rather than silently deactivated (cross-checked per Section 7.5).
 */
async function runImport(rows, source, actorId) {
    const batch = await prisma_1.prisma.importBatch.create({ data: { source, status: "RUNNING" } });
    let created = 0;
    let updated = 0;
    let quarantined = 0;
    for (const row of rows) {
        const errors = validateRow(row);
        if (errors.length > 0) {
            await prisma_1.prisma.importRecord.create({
                data: {
                    batchId: batch.id,
                    employeeId: row.employeeId ?? "UNKNOWN",
                    rawData: row,
                    status: "QUARANTINED",
                    errors: errors,
                },
            });
            quarantined++;
            continue;
        }
        if ((row.action ?? "").toUpperCase() === "TERMINATE") {
            const existingResource = await prisma_1.prisma.resource.findUnique({ where: { employeeId: row.employeeId } });
            if (existingResource && existingResource.status !== "TERMINATED") {
                // Avoid stacking duplicate requests if the HRMIS keeps reporting the same exit
                // on repeated daily syncs before HR has acted on the first one.
                const alreadyPending = await prisma_1.prisma.terminationRequest.findFirst({
                    where: { resourceId: existingResource.id, status: "PENDING_HR_APPROVAL" },
                });
                if (!alreadyPending) {
                    const systemUser = await prisma_1.prisma.user.findFirst({ where: { role: "RMG" } });
                    await prisma_1.prisma.terminationRequest.create({
                        data: {
                            resourceId: existingResource.id,
                            initiatedById: actorId ?? systemUser?.id ?? existingResource.id,
                            reasonCode: "HRMIS_REPORTED_EXIT",
                            reason: "Exit reported by HRMIS during daily sync",
                            status: "PENDING_HR_APPROVAL",
                        },
                    });
                }
            }
            await prisma_1.prisma.importRecord.create({
                data: {
                    batchId: batch.id,
                    employeeId: row.employeeId,
                    rawData: row,
                    status: "UPDATED",
                    resourceId: existingResource?.id,
                },
            });
            updated++;
            continue;
        }
        const portfolio = await prisma_1.prisma.portfolio.findUnique({ where: { code: row.portfolioCode } });
        if (!portfolio) {
            await prisma_1.prisma.importRecord.create({
                data: {
                    batchId: batch.id,
                    employeeId: row.employeeId,
                    rawData: row,
                    status: "QUARANTINED",
                    errors: [`Unknown portfolio/department code: ${row.portfolioCode}`],
                },
            });
            quarantined++;
            continue;
        }
        const skills = parseSkills(row.skills);
        const certifications = parseCertifications(row.certifications);
        const dateOfJoining = row.dateOfJoining ? new Date(row.dateOfJoining) : null;
        const gender = ((row.gender ?? "UNDISCLOSED").trim().toUpperCase() || "UNDISCLOSED");
        const derivedTaoYears = dateOfJoining
            ? Math.max(0, Math.round((((Date.now() - dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) * 10)) / 10)
            : 0;
        const priorExperienceYears = row.priorExperienceYears
            ? Number(row.priorExperienceYears)
            : row.totalYoe
                ? Math.max(0, Math.round((Number(row.totalYoe) - derivedTaoYears) * 10) / 10)
                : 0;
        const existing = await prisma_1.prisma.resource.findUnique({ where: { employeeId: row.employeeId } });
        if (!existing) {
            const resource = await prisma_1.prisma.resource.create({
                data: {
                    employeeId: row.employeeId,
                    name: row.name,
                    email: row.email,
                    gender,
                    country: row.country || null,
                    workLocation: row.workLocation || row.location,
                    location: row.location,
                    willingToRelocate: (row.willingToRelocate ?? "false").toLowerCase() === "true",
                    costRate: Number(row.costRate),
                    currency: row.currency || "USD",
                    portfolioId: portfolio.id,
                    managerName: row.managerName,
                    designation: row.designation,
                    subCategory: row.subCategory || null,
                    dateOfJoining,
                    priorExperienceYears,
                    status: "AVAILABLE",
                    sourceSystem: source,
                },
            });
            for (const s of skills) {
                const skill = await prisma_1.prisma.skill.upsert({ where: { name: s.name }, create: { name: s.name }, update: {} });
                await prisma_1.prisma.resourceSkill.create({
                    data: { resourceId: resource.id, skillId: skill.id, proficiency: s.proficiency, yearsExperience: s.yearsExperience },
                });
            }
            await upsertCertifications(resource.id, certifications);
            await prisma_1.prisma.importRecord.create({
                data: { batchId: batch.id, employeeId: row.employeeId, rawData: row, status: "CREATED", resourceId: resource.id },
            });
            created++;
        }
        else {
            const resource = await prisma_1.prisma.resource.update({
                where: { id: existing.id },
                data: {
                    name: row.name,
                    email: row.email,
                    gender,
                    country: row.country || null,
                    workLocation: row.workLocation || row.location,
                    location: row.location,
                    willingToRelocate: (row.willingToRelocate ?? "false").toLowerCase() === "true",
                    costRate: Number(row.costRate),
                    currency: row.currency || "USD",
                    portfolioId: portfolio.id,
                    managerName: row.managerName,
                    designation: row.designation,
                    subCategory: row.subCategory || null,
                    dateOfJoining,
                    priorExperienceYears,
                },
            });
            for (const s of skills) {
                const skill = await prisma_1.prisma.skill.upsert({ where: { name: s.name }, create: { name: s.name }, update: {} });
                await prisma_1.prisma.resourceSkill.upsert({
                    where: { resourceId_skillId: { resourceId: resource.id, skillId: skill.id } },
                    create: { resourceId: resource.id, skillId: skill.id, proficiency: s.proficiency, yearsExperience: s.yearsExperience },
                    update: { proficiency: s.proficiency, yearsExperience: s.yearsExperience },
                });
            }
            await upsertCertifications(resource.id, certifications);
            await prisma_1.prisma.importRecord.create({
                data: { batchId: batch.id, employeeId: row.employeeId, rawData: row, status: "UPDATED", resourceId: resource.id },
            });
            updated++;
        }
    }
    const completed = await prisma_1.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
            status: "COMPLETED",
            createdCount: created,
            updatedCount: updated,
            quarantinedCount: quarantined,
            completedAt: new Date(),
        },
    });
    await (0, audit_1.writeAudit)({
        actorId: actorId ?? null,
        action: "RUN_IMPORT",
        entityType: "ImportBatch",
        entityId: batch.id,
        after: { source, created, updated, quarantined },
    });
    return completed;
}
