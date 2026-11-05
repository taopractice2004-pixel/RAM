import ExcelJS from "exceljs";

export const RESOURCE_FIELDS = ["employeeId", "name", "gender", "country", "workLocation", "location", "willingToRelocate", "costRate", "currency", "portfolioCode", "managerName", "designation", "subCategory", "dateOfJoining", "priorExperienceYears", "totalYoe", "taoExperience", "skills", "certifications"] as const;
export type ResourceField = typeof RESOURCE_FIELDS[number];
const aliases: Record<ResourceField, string[]> = {
  employeeId: ["employee id", "emp id", "empid", "employee number", "person id"], name: ["name", "employee name", "emp name", "resource name"], gender: ["gender"], country: ["country"], workLocation: ["work location", "work location city"], location: ["location", "city", "base location"], willingToRelocate: ["willing to relocate", "relocation"], costRate: ["cost rate", "monthly direct cost", "direct cost", "cost"], currency: ["currency"], portfolioCode: ["portfolio code", "vertical code", "department code"], managerName: ["manager", "manager name", "reporting manager"], designation: ["designation", "role", "job title"], subCategory: ["subcategory", "sub category", "bench subcategory"], dateOfJoining: ["date of joining", "doj", "joining date"], priorExperienceYears: ["prior experience years", "prior experience"], totalYoe: ["total yoe", "total experience", "years of experience", "yoe"], taoExperience: ["tao experience", "tao experience years"], skills: ["skills", "skill", "skillset", "skill set"], certifications: ["certifications", "certification"]
};
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
export const RESOURCE_FIELD_METADATA: Record<ResourceField, { label: string; type: "text" | "email" | "number" | "date" | "boolean" | "enum" | "list"; requiredForNew: boolean }> = {
  employeeId: { label: "Employee ID", type: "text", requiredForNew: true }, name: { label: "Name", type: "text", requiredForNew: true }, gender: { label: "Gender", type: "enum", requiredForNew: false }, country: { label: "Country", type: "text", requiredForNew: false }, workLocation: { label: "Work location", type: "text", requiredForNew: false }, location: { label: "Location", type: "text", requiredForNew: true }, willingToRelocate: { label: "Willing to relocate", type: "boolean", requiredForNew: false }, costRate: { label: "Cost rate", type: "number", requiredForNew: true }, currency: { label: "Currency", type: "text", requiredForNew: false }, portfolioCode: { label: "Portfolio code", type: "text", requiredForNew: true }, managerName: { label: "Manager", type: "text", requiredForNew: false }, designation: { label: "Designation", type: "text", requiredForNew: false }, subCategory: { label: "Subcategory", type: "text", requiredForNew: false }, dateOfJoining: { label: "Date of joining", type: "date", requiredForNew: false }, priorExperienceYears: { label: "Prior experience (years)", type: "number", requiredForNew: false }, totalYoe: { label: "Total experience (years)", type: "number", requiredForNew: false }, taoExperience: { label: "TAO experience (years)", type: "number", requiredForNew: false }, skills: { label: "Skills", type: "list", requiredForNew: false }, certifications: { label: "Certifications", type: "list", requiredForNew: false },
};
export function normalizeImportRow(input: Record<string, unknown>): Partial<Record<ResourceField, string>> {
  return Object.fromEntries(RESOURCE_FIELDS.flatMap((field) => {
    const value = input[field];
    return typeof value === "string" && value.trim() ? [[field, value.trim()]] : [];
  }));
}

export function validateImportRow(values: Partial<Record<ResourceField, string>>, isNew = false): string[] {
  const errors: string[] = [];
  for (const field of RESOURCE_FIELDS) if ((field === "employeeId" || (isNew && RESOURCE_FIELD_METADATA[field].requiredForNew)) && !values[field]) errors.push(`Missing ${field}`);
  for (const field of ["costRate", "priorExperienceYears", "totalYoe", "taoExperience"] as const) {
    if (values[field] && (!Number.isFinite(Number(values[field])) || Number(values[field]) < 0)) errors.push(`${field} must be a non-negative number`);
  }
  if (values.costRate && Number(values.costRate) > 99999999.99) errors.push("costRate exceeds supported precision");
  if (values.gender && !["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].includes(values.gender.toUpperCase())) errors.push("Invalid gender");
  if (values.willingToRelocate && !["true", "false", "yes", "no", "1", "0"].includes(values.willingToRelocate.toLowerCase())) errors.push("Willing to relocate must be Yes or No");
  if (values.dateOfJoining && Number.isNaN(new Date(values.dateOfJoining).getTime())) errors.push("Invalid date of joining");
  for (const entry of values.skills?.split(";").filter((part) => part.trim()) ?? []) {
    const [name, proficiency, years, extra] = entry.split(":").map((part) => part.trim());
    if (!name || extra !== undefined || (proficiency && (!Number.isInteger(Number(proficiency)) || Number(proficiency) < 1 || Number(proficiency) > 5)) || (years && (!Number.isFinite(Number(years)) || Number(years) < 0))) errors.push(`Invalid skill: ${entry}`);
  }
  for (const entry of values.certifications?.split(";").filter((part) => part.trim()) ?? []) {
    const [name, , date, extra] = entry.split(":").map((part) => part.trim());
    if (!name || extra !== undefined || (date && Number.isNaN(new Date(date).getTime()))) errors.push(`Invalid certification: ${entry}`);
  }
  return errors;
}

export const redactImportSource = (source: Record<string, string>) => Object.fromEntries(Object.entries(source).map(([key, value]) => [key, /e[\s_-]?mail/i.test(key) || /[^\s@]+@[^\s@]+/.test(value) ? "[REDACTED EMAIL]" : value]));

export interface ExcelPreview { blankRowCount: number; headerRow: number; sheetNames: string[]; sheetName: string; headers: string[]; samples: Record<string, string[]>; mapping: Partial<Record<ResourceField, string>>; unmappedHeaders: string[]; fieldMetadata: typeof RESOURCE_FIELD_METADATA; rows: Array<{ rowNumber: number; source: Record<string, string>; values: Partial<Record<ResourceField, string>>; errors: string[] }>; warnings: string[] }
export async function parseResourceExcelPreview(buffer: Buffer, requestedMapping?: Partial<Record<ResourceField, string>>, requestedSheet?: string, requestedHeaderRow?: number): Promise<ExcelPreview> {
  if (!buffer.length || buffer.length > 200 * 1024 * 1024) throw new Error("Workbook must be between 1 byte and 200 MB");
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error("This import accepts .xlsx workbooks only. Save legacy .xls files as .xlsx and retry.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as any, { ignoreNodes: ["extLst", "externalLinks", "legacyDrawing", "oleObjects", "controls"] });
  const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
  const sheet = requestedSheet ? workbook.getWorksheet(requestedSheet) : workbook.worksheets[0];
  if (!sheet) throw new Error(requestedSheet ? "Selected worksheet was not found" : "Workbook has no sheets");
  if (sheet.rowCount > 5000 || sheet.columnCount > 100) throw new Error("Selected worksheet exceeds 5,000 rows or 100 columns");
  const grid: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => { values[columnNumber - 1] = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : typeof cell.value === "object" && cell.value !== null && "result" in cell.value ? (cell.value as { result: unknown }).result : cell.text; });
    grid[rowNumber - 1] = values;
  });
  const sheetName = sheet.name;
  const recognizedIndex = grid.findIndex((row) => row?.some((cell) => aliases.employeeId.includes(normalize(cell)) || normalize(cell) === "employeeid"));
  const headerIndex = requestedHeaderRow !== undefined ? requestedHeaderRow - 1 : recognizedIndex >= 0 ? recognizedIndex : grid.findIndex((row) => row?.some((cell) => String(cell ?? "").trim()));
  if (headerIndex < 0 || !grid[headerIndex]) throw new Error("Choose a header row containing column names.");
  const headers = Array.from({ length: sheet.columnCount }, (_, index) => String(grid[headerIndex][index] ?? "").trim() || `Column ${index + 1}`);
  const normalizedHeaders = headers.map(normalize);
  if (new Set(normalizedHeaders).size !== headers.length) throw new Error("Duplicate column headings found. Rename each heading uniquely in Excel or choose a different header row.");
  const samples: Record<string, string[]> = {};
  for (const [columnIndex, header] of headers.entries()) {
    samples[header] = grid.slice(headerIndex + 1).map((row) => redactImportSource({ [header]: String(row[columnIndex] ?? "").trim() })[header]).filter(Boolean).slice(0, 3);
  }
  const mapping: Partial<Record<ResourceField, string>> = {};
  const used = new Set<string>();
  if (!requestedMapping) for (const header of headers) {
    const key = normalize(header);
    const field = RESOURCE_FIELDS.find((candidate) => (aliases[candidate].includes(key) || normalize(candidate) === key));
    if (field && !mapping[field]) mapping[field] = header;
  }
  if (requestedMapping) {
    for (const field of RESOURCE_FIELDS) delete mapping[field];
    for (const [field, header] of Object.entries(requestedMapping) as Array<[ResourceField, string]>) {
      if (!RESOURCE_FIELDS.includes(field) || (header && !headers.includes(header))) throw new Error("Invalid column mapping");
      if (header && /e[\s_-]?mail/i.test(header)) throw new Error("Email columns cannot be mapped");
      if (header) mapping[field] = header;
    }
  }
  for (const header of Object.values(mapping)) {
    if (used.has(header!)) throw new Error("A workbook column cannot be mapped more than once");
    used.add(header!);
  }
  const rows = grid.slice(headerIndex + 1).map((cells, index) => {
    const values: Partial<Record<ResourceField, string>> = {};
    for (const field of RESOURCE_FIELDS) {
      const header = mapping[field];
      if (!header) continue;
      const column = headers.indexOf(header);
      const val = cells[column];
      if (val !== undefined && String(val).trim() !== "") values[field] = String(val).trim();
    }
    const errors = validateImportRow(values);
    const source = redactImportSource(Object.fromEntries(headers.map((header, column) => [header, String(cells[column] ?? "")])));
    return { rowNumber: headerIndex + index + 2, source, values, errors };
  }).filter((row) => grid[row.rowNumber - 1]?.some((cell) => String(cell ?? "").trim()));
  const ids = new Set<string>();
  for (const row of rows) if (row.values.employeeId) { if (ids.has(row.values.employeeId)) row.errors.push("Duplicate employeeId in workbook"); ids.add(row.values.employeeId); }
  return { blankRowCount: Math.max(0, sheet.rowCount - headerIndex - 1 - rows.length), headerRow: headerIndex + 1, sheetNames, sheetName, headers, samples, mapping, unmappedHeaders: headers.filter((header) => header && !used.has(header)), fieldMetadata: RESOURCE_FIELD_METADATA, rows, warnings: [`Reading worksheet: ${sheetName}.`, "New resource rows require Employee ID, Name, Location, Cost rate, and Portfolio code. Blank optional cells use system defaults or remain unchanged."] };
}
