import { parse } from "csv-parse/sync";
import { prisma } from "../prisma";
import { writeAudit } from "../utils/audit";

export interface RawImportRow {
  employeeId?: string;
  name?: string;
  email?: string;
  location?: string;
  willingToRelocate?: string;
  costRate?: string;
  currency?: string;
  portfolioCode?: string;
  skills?: string; // "React:4:3;Node.js:3:2" => name:proficiency:yearsExperience
  certifications?: string; // "PMP:PMI:2022-01-15;AWS SA:AWS:2023-06-01"
  action?: string; // "TERMINATE" to signal an HRMIS-reported exit, otherwise create/update
}

export function parseImportCsv(csvText: string): RawImportRow[] {
  return parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as RawImportRow[];
}

const REQUIRED_FIELDS: (keyof RawImportRow)[] = ["employeeId", "name", "email", "location", "costRate", "portfolioCode", "skills"];
// An HRMIS-reported exit only needs to identify the resource, not its full profile.
const REQUIRED_FIELDS_FOR_TERMINATE: (keyof RawImportRow)[] = ["employeeId"];

function validateRow(row: RawImportRow): string[] {
  const errors: string[] = [];
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
 * FR-1.4 / FR-1.5 / Workflow 7.1: import new/updated active-resource records from
 * an HRMIS feed or manual input sheet. Valid rows create/update Resource records;
 * invalid rows are quarantined (not activated) with the specific error captured.
 * Rows flagged as HRMIS-reported exits are routed to a pending termination request
 * rather than silently deactivated (cross-checked per Section 7.5).
 */
export async function runImport(rows: RawImportRow[], source: string, actorId?: string | null) {
  const batch = await prisma.importBatch.create({ data: { source, status: "RUNNING" } });

  let created = 0;
  let updated = 0;
  let quarantined = 0;

  for (const row of rows) {
    const errors = validateRow(row);

    if (errors.length > 0) {
      await prisma.importRecord.create({
        data: {
          batchId: batch.id,
          employeeId: row.employeeId ?? "UNKNOWN",
          rawData: row as any,
          status: "QUARANTINED",
          errors: errors as any,
        },
      });
      quarantined++;
      continue;
    }

    if ((row.action ?? "").toUpperCase() === "TERMINATE") {
      const existingResource = await prisma.resource.findUnique({ where: { employeeId: row.employeeId! } });
      if (existingResource && existingResource.status !== "TERMINATED") {
        // Avoid stacking duplicate requests if the HRMIS keeps reporting the same exit
        // on repeated daily syncs before HR has acted on the first one.
        const alreadyPending = await prisma.terminationRequest.findFirst({
          where: { resourceId: existingResource.id, status: "PENDING_HR_APPROVAL" },
        });
        if (!alreadyPending) {
          const systemUser = await prisma.user.findFirst({ where: { role: "RMG" } });
          await prisma.terminationRequest.create({
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
      await prisma.importRecord.create({
        data: {
          batchId: batch.id,
          employeeId: row.employeeId!,
          rawData: row as any,
          status: "UPDATED",
          resourceId: existingResource?.id,
        },
      });
      updated++;
      continue;
    }

    const portfolio = await prisma.portfolio.findUnique({ where: { code: row.portfolioCode! } });
    if (!portfolio) {
      await prisma.importRecord.create({
        data: {
          batchId: batch.id,
          employeeId: row.employeeId!,
          rawData: row as any,
          status: "QUARANTINED",
          errors: [`Unknown portfolio/department code: ${row.portfolioCode}`] as any,
        },
      });
      quarantined++;
      continue;
    }

    const skills = parseSkills(row.skills);
    const certifications = parseCertifications(row.certifications);

    const existing = await prisma.resource.findUnique({ where: { employeeId: row.employeeId! } });

    if (!existing) {
      const resource = await prisma.resource.create({
        data: {
          employeeId: row.employeeId!,
          name: row.name!,
          email: row.email!,
          location: row.location!,
          willingToRelocate: (row.willingToRelocate ?? "false").toLowerCase() === "true",
          costRate: Number(row.costRate),
          currency: row.currency || "USD",
          portfolioId: portfolio.id,
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

      await prisma.importRecord.create({
        data: { batchId: batch.id, employeeId: row.employeeId!, rawData: row as any, status: "CREATED", resourceId: resource.id },
      });
      created++;
    } else {
      const resource = await prisma.resource.update({
        where: { id: existing.id },
        data: {
          name: row.name!,
          email: row.email!,
          location: row.location!,
          willingToRelocate: (row.willingToRelocate ?? "false").toLowerCase() === "true",
          costRate: Number(row.costRate),
          currency: row.currency || "USD",
          portfolioId: portfolio.id,
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

      await prisma.importRecord.create({
        data: { batchId: batch.id, employeeId: row.employeeId!, rawData: row as any, status: "UPDATED", resourceId: resource.id },
      });
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
