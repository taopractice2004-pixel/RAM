import { parse } from "csv-parse/sync";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAudit } from "../utils/audit";

export interface RawImportRow {
  employeeId?: string;
  name?: string;
  email?: string;
  gender?: string;
  country?: string;
  workLocation?: string;
  location?: string;
  willingToRelocate?: string;
  costRate?: string;
  currency?: string;
  portfolioCode?: string;
  managerName?: string;
  designation?: string;
  subCategory?: string;
  dateOfJoining?: string;
  priorExperienceYears?: string;
  totalYoe?: string;
  taoExperience?: string;
  skills?: string; // "React:4:3;Node.js:3:2" => name:proficiency:yearsExperience
  certifications?: string; // "PMP:PMI:2022-01-15;AWS SA:AWS:2023-06-01"
}

export function parseImportCsv(csvText: string): RawImportRow[] {
  return parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as RawImportRow[];
}

const REQUIRED_FIELDS: (keyof RawImportRow)[] = [
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

export function validateRow(row: RawImportRow): string[] {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || String(row[field]).trim() === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }
  if (row.costRate && Number.isNaN(Number(row.costRate))) {
    errors.push(`costRate is not numeric: ${row.costRate}`);
  }
  if (row.totalYoe && Number.isNaN(Number(row.totalYoe))) {
    errors.push(`totalYoe is not numeric: ${row.totalYoe}`);
  }
  if (row.taoExperience && Number.isNaN(Number(row.taoExperience))) {
    errors.push(`taoExperience is not numeric: ${row.taoExperience}`);
  }
  if (row.priorExperienceYears && Number.isNaN(Number(row.priorExperienceYears))) {
    errors.push(`priorExperienceYears is not numeric: ${row.priorExperienceYears}`);
  }
  if (row.dateOfJoining) {
    const doj = new Date(row.dateOfJoining);
    if (Number.isNaN(doj.getTime())) {
      errors.push(`dateOfJoining is invalid: ${row.dateOfJoining}`);
    } else if (row.totalYoe || row.taoExperience) {
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
  if (row.gender) {
    const normalizedGender = row.gender.trim().toUpperCase();
    if (!["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].includes(normalizedGender)) {
      errors.push(`gender is invalid: ${row.gender}`);
    }
  }
  return errors;
}

function parseSkills(skillsStr: string | undefined) {
  if (!skillsStr) return [];
  return skillsStr
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, proficiency, years] = entry.split(":").map((p) => p.trim());
      return { name, proficiency: Number(proficiency) || 3, yearsExperience: Number(years) || 0 };
    });
}

function parseCertifications(certStr: string | undefined) {
  if (!certStr) return [];
  return certStr
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, issuer, issueDate] = entry.split(":").map((p) => p.trim());
      return { name, issuer: issuer || null, issueDate: issueDate ? new Date(issueDate) : null };
    });
}

async function upsertCertifications(resourceId: string, certifications: ReturnType<typeof parseCertifications>) {
  for (const c of certifications) {
    await prisma.certification.upsert({
      where: { resourceId_name: { resourceId, name: c.name } },
      create: { resourceId, name: c.name, issuer: c.issuer, issueDate: c.issueDate },
      update: { issuer: c.issuer, issueDate: c.issueDate },
    });
  }
}

/**
 * FR-1.5 / Workflow 7.1: bulk import new/updated active-resource records from CSV.
 * Valid rows create/update Resource records;
 * invalid rows are quarantined (not activated) with the specific error captured.
 */
export async function runImport(rows: RawImportRow[], source: string, actorId?: string | null, options: { quarantinedRecordId?: string } = {}) {
  const batch = await prisma.importBatch.create({ data: { source, status: "RUNNING" } });

  let created = 0;
  let updated = 0;
  let quarantined = 0;

  for (const row of rows) {
    const errors = validateRow(row);

    if (errors.length > 0) {
      if (options.quarantinedRecordId) {
        await prisma.importRecord.update({ where: { id: options.quarantinedRecordId }, data: { rawData: row as any, errors: errors as any } });
      } else {
        await prisma.importRecord.create({
          data: {
            batchId: batch.id,
            employeeId: row.employeeId ?? "UNKNOWN",
            rawData: row as any,
            status: "QUARANTINED",
            errors: errors as any,
          },
        });
      }
      quarantined++;
      continue;
    }

    const portfolio = await prisma.portfolio.findUnique({ where: { code: row.portfolioCode! } });
    if (!portfolio) {
      const portfolioError = [`Unknown portfolio/department code: ${row.portfolioCode}`];
      if (options.quarantinedRecordId) {
        await prisma.importRecord.update({ where: { id: options.quarantinedRecordId }, data: { rawData: row as any, errors: portfolioError as any } });
      } else {
        await prisma.importRecord.create({
          data: {
            batchId: batch.id,
            employeeId: row.employeeId!,
            rawData: row as any,
            status: "QUARANTINED",
            errors: portfolioError as any,
          },
        });
      }
      quarantined++;
      continue;
    }

    const skills = parseSkills(row.skills);
    const certifications = parseCertifications(row.certifications);
    const dateOfJoining = row.dateOfJoining ? new Date(row.dateOfJoining) : null;
    const gender = ((row.gender ?? "UNDISCLOSED").trim().toUpperCase() || "UNDISCLOSED") as "FEMALE" | "MALE" | "OTHER" | "UNDISCLOSED";
    const derivedTaoYears = dateOfJoining
      ? Math.max(0, Math.round((((Date.now() - dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) * 10)) / 10)
      : 0;
    const priorExperienceYears = row.priorExperienceYears
      ? Number(row.priorExperienceYears)
      : row.totalYoe
      ? Math.max(0, Math.round((Number(row.totalYoe) - derivedTaoYears) * 10) / 10)
      : 0;

    const existing = await prisma.resource.findUnique({ where: { employeeId: row.employeeId! } });

    if (!existing) {
      const resource = await prisma.resource.create({
        data: {
          employeeId: row.employeeId!,
          name: row.name!,
          email: row.email!,
          gender,
          country: row.country || null,
          workLocation: row.workLocation || row.location!,
          location: row.location!,
          willingToRelocate: (row.willingToRelocate ?? "false").toLowerCase() === "true",
          costRate: Number(row.costRate),
          currency: row.currency || "USD",
          portfolioId: portfolio.id,
          managerName: row.managerName!,
          designation: row.designation!,
          subCategory: row.subCategory || null,
          dateOfJoining,
          priorExperienceYears,
          status: "AVAILABLE",
          sourceSystem: source,
        },
      });

      for (const s of skills) {
        const skill = await prisma.skill.upsert({ where: { name: s.name }, create: { name: s.name }, update: {} });
        await prisma.resourceSkill.create({
          data: { resourceId: resource.id, skillId: skill.id, proficiency: s.proficiency, yearsExperience: s.yearsExperience },
        });
      }
      await upsertCertifications(resource.id, certifications);

      if (options.quarantinedRecordId) {
        await prisma.importRecord.update({ where: { id: options.quarantinedRecordId }, data: { employeeId: row.employeeId!, rawData: row as any, status: "CREATED", resourceId: resource.id, errors: Prisma.JsonNull } });
      } else {
        await prisma.importRecord.create({
          data: { batchId: batch.id, employeeId: row.employeeId!, rawData: row as any, status: "CREATED", resourceId: resource.id },
        });
      }
      created++;
    } else {
      const resource = await prisma.resource.update({
        where: { id: existing.id },
        data: {
          name: row.name!,
          email: row.email!,
          gender,
          country: row.country || null,
          workLocation: row.workLocation || row.location!,
          location: row.location!,
          willingToRelocate: (row.willingToRelocate ?? "false").toLowerCase() === "true",
          costRate: Number(row.costRate),
          currency: row.currency || "USD",
          portfolioId: portfolio.id,
          managerName: row.managerName!,
          designation: row.designation!,
          subCategory: row.subCategory || null,
          dateOfJoining,
          priorExperienceYears,
        },
      });

      for (const s of skills) {
        const skill = await prisma.skill.upsert({ where: { name: s.name }, create: { name: s.name }, update: {} });
        await prisma.resourceSkill.upsert({
          where: { resourceId_skillId: { resourceId: resource.id, skillId: skill.id } },
          create: { resourceId: resource.id, skillId: skill.id, proficiency: s.proficiency, yearsExperience: s.yearsExperience },
          update: { proficiency: s.proficiency, yearsExperience: s.yearsExperience },
        });
      }
      await upsertCertifications(resource.id, certifications);

      if (options.quarantinedRecordId) {
        await prisma.importRecord.update({ where: { id: options.quarantinedRecordId }, data: { employeeId: row.employeeId!, rawData: row as any, status: "UPDATED", resourceId: resource.id, errors: Prisma.JsonNull } });
      } else {
        await prisma.importRecord.create({
          data: { batchId: batch.id, employeeId: row.employeeId!, rawData: row as any, status: "UPDATED", resourceId: resource.id },
        });
      }
      updated++;
    }
  }

  const completed = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      createdCount: created,
      updatedCount: updated,
      quarantinedCount: quarantined,
      completedAt: new Date(),
    },
  });

  await writeAudit({
    actorId: actorId ?? null,
    action: "RUN_IMPORT",
    entityType: "ImportBatch",
    entityId: batch.id,
    after: { source, created, updated, quarantined },
  });

  return completed;
}
