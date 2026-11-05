import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../prisma";
import { canViewSensitiveResourceData, canEverViewCost } from "../middleware/rbac";
import { portfolioReadWhere } from "../utils/scope";
import { deriveTaoExperienceYears, deriveTotalYearsExperience } from "../utils/resourcePresentation";
import { toCsv } from "../utils/csv";
import { writeAudit } from "../utils/audit";

const router = Router();

const RESOURCE_FIELDS = [
  { key: "employeeId", label: "Employee ID" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "portfolio", label: "Portfolio" },
  { key: "managerName", label: "Manager" },
  { key: "designation", label: "Designation" },
  { key: "status", label: "Resource status" },
  { key: "subCategory", label: "Subcategory" },
  { key: "country", label: "Country" },
  { key: "workLocation", label: "Work location" },
  { key: "location", label: "Location" },
  { key: "skills", label: "Skills" },
  { key: "certifications", label: "Certifications" },
  { key: "taoExperienceYears", label: "TAO experience (years)" },
  { key: "totalYearsExperience", label: "Total experience (years)" },
  { key: "costRate", label: "Cost rate", sensitive: true },
] as const;

router.get("/resources/fields", (req, res) => {
  const fields = RESOURCE_FIELDS.filter((field) => !("sensitive" in field) || canEverViewCost(req.user!.role))
    .map(({ key, label }) => ({ key, label }));
  res.json(fields);
});

router.post("/resources", async (req, res, next) => {
  const schema = z.object({
    fields: z.array(z.string()).min(1).max(RESOURCE_FIELDS.length),
    format: z.enum(["csv", "xlsx"]),
    filters: z.object({
      q: z.string().optional(), skills: z.string().optional(), location: z.string().optional(), managerName: z.string().optional(),
      designation: z.string().optional(), country: z.string().optional(), status: z.array(z.string()).optional(),
      portfolioId: z.string().optional(), subCategory: z.string().optional(), certification: z.string().optional(),
      minExperience: z.coerce.number().min(0).optional(), minTaoExperience: z.coerce.number().min(0).optional(),
      minCost: z.coerce.number().min(0).optional(), maxCost: z.coerce.number().min(0).optional(),
    }).default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fields, format, filters } = parsed.data;
  const fieldMap = new Map<string, (typeof RESOURCE_FIELDS)[number]>(RESOURCE_FIELDS.map((field) => [field.key, field]));
  if (fields.some((key) => !fieldMap.has(key))) return res.status(400).json({ error: "Unknown export field" });
  const wantsCost = fields.includes("costRate");
  const canViewAnyCost = req.user!.role === "ADMIN" || req.user!.role === "HR" || req.user!.role === "RMG";
  if (wantsCost && !canViewAnyCost) return res.status(403).json({ error: "Cost data is not available for your role" });
  if ((filters.minCost !== undefined || filters.maxCost !== undefined) && !canViewAnyCost) return res.status(403).json({ error: "Cost filters are not available for your role" });

  const where: any = { ...portfolioReadWhere(req) };
  if (filters.q) where.OR = [{ name: { contains: filters.q, mode: "insensitive" } }, { employeeId: { contains: filters.q, mode: "insensitive" } }];
  if (filters.skills) where.skills = { some: { skill: { name: { contains: filters.skills, mode: "insensitive" } } } };
  if (filters.location) where.OR = [...(where.OR || []), { location: { contains: filters.location, mode: "insensitive" } }, { workLocation: { contains: filters.location, mode: "insensitive" } }];
  if (filters.managerName) where.managerName = { contains: filters.managerName, mode: "insensitive" };
  if (filters.designation) where.designation = { contains: filters.designation, mode: "insensitive" };
  if (filters.country) where.country = { contains: filters.country, mode: "insensitive" };
  if (filters.status?.length) where.status = { in: filters.status };
  else where.status = { not: "TERMINATED" };
  if (filters.portfolioId) where.portfolioId = filters.portfolioId;
  if (filters.subCategory) where.subCategory = { contains: filters.subCategory, mode: "insensitive" };
  if (filters.certification) where.certifications = { some: { name: { contains: filters.certification, mode: "insensitive" } } };
  if (filters.minExperience !== undefined) where.skills = { ...(where.skills || {}), some: { ...(where.skills?.some || {}), yearsExperience: { gte: filters.minExperience } } };
  if (filters.minTaoExperience !== undefined) where.dateOfJoining = { lte: new Date(Date.now() - filters.minTaoExperience * 365.25 * 86400000) };
  if ((filters.minCost !== undefined || filters.maxCost !== undefined) && canViewAnyCost) where.costRate = { ...(filters.minCost !== undefined ? { gte: filters.minCost } : {}), ...(filters.maxCost !== undefined ? { lte: filters.maxCost } : {}) };

  try {
    const resources = await prisma.resource.findMany({
      where,
      include: { portfolio: true, skills: { include: { skill: true } }, certifications: true },
      orderBy: { name: "asc" },
      take: 10000,
    });
    const rows = resources.map((resource) => {
      const costAllowed = canViewSensitiveResourceData(req.user!, resource.portfolioId);
      const projected: Record<string, unknown> = {};
      for (const key of fields) {
        switch (key) {
          case "portfolio": projected[key] = resource.portfolio.name; break;
          case "skills": projected[key] = resource.skills.map((item) => item.skill.name).join("; "); break;
          case "certifications": projected[key] = resource.certifications.map((item) => item.name).join("; "); break;
          case "taoExperienceYears": projected[key] = deriveTaoExperienceYears(resource.dateOfJoining); break;
          case "totalYearsExperience": projected[key] = deriveTotalYearsExperience(resource.priorExperienceYears, resource.dateOfJoining); break;
          case "costRate": projected[key] = costAllowed ? resource.costRate?.toString() ?? "" : ""; break;
          default: projected[key] = (resource as any)[key] ?? "";
        }
      }
      return projected;
    });
    await writeAudit({ actorId: req.user!.id, action: "EXPORT_RESOURCES", entityType: "ResourceExport", after: { format, rowCount: rows.length, fields } });
    const columns = fields.map((key) => ({ key, label: fieldMap.get(key)!.label }));
    if (format === "csv") {
      const csvRows = rows.map((row) => Object.fromEntries(columns.map(({ key, label }) => [label, safeCsvValue(row[key])])));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="resources_export.csv"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(toCsv(csvRows));
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Resources");
    sheet.columns = columns.map(({ key, label }) => ({ header: label, key, width: Math.max(label.length + 2, 16) }));
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="resources_export.xlsx"');
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(Buffer.from(buffer));
  } catch (error) {
    return next(error);
  }
});

function safeCsvValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
}

export default router;
