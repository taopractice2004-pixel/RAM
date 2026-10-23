import ExcelJS from "exceljs";

export const RESOURCE_FIELDS = ["employeeId", "name", "email", "gender", "country", "workLocation", "location", "willingToRelocate", "costRate", "currency", "portfolioCode", "managerName", "designation", "subCategory", "dateOfJoining", "priorExperienceYears", "totalYoe", "taoExperience", "skills", "certifications"] as const;
export type ResourceField = typeof RESOURCE_FIELDS[number];
const aliases: Record<ResourceField, string[]> = {
  employeeId: ["employee id", "emp id", "empid", "employee number", "person id"], name: ["name", "employee name", "emp name", "resource name"], email: ["email", "email id", "work email"], gender: ["gender"], country: ["country"], workLocation: ["work location", "work location city"], location: ["location", "city", "base location"], willingToRelocate: ["willing to relocate", "relocation"], costRate: ["cost rate", "monthly direct cost", "direct cost", "cost"], currency: ["currency"], portfolioCode: ["portfolio code", "vertical code", "department code"], managerName: ["manager", "manager name", "reporting manager"], designation: ["designation", "role", "job title"], subCategory: ["subcategory", "sub category", "bench subcategory"], dateOfJoining: ["date of joining", "doj", "joining date"], priorExperienceYears: ["prior experience years", "prior experience"], totalYoe: ["total yoe", "total experience", "years of experience", "yoe"], taoExperience: ["tao experience", "tao experience years"], skills: ["skills", "skill", "skillset", "skill set"], certifications: ["certifications", "certification"]
};
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
export interface ExcelPreview { sheetNames: string[]; sheetName: string; headers: string[]; mapping: Partial<Record<ResourceField, string>>; unmappedHeaders: string[]; rows: Array<{ rowNumber: number; values: Partial<Record<ResourceField, string>>; errors: string[] }>; warnings: string[] }
export async function parseResourceExcelPreview(buffer: Buffer, requestedMapping?: Partial<Record<ResourceField, string>>, requestedSheet?: string): Promise<ExcelPreview> {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error("Workbook must be between 1 byte and 10 MB");
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
  const headerIndex = grid.findIndex((row) => row.filter((cell) => String(cell ?? "").trim()).length >= 3);
  if (headerIndex < 0) throw new Error(`Could not identify a resource header row in worksheet ${sheet.name}`);
  const headers = grid[headerIndex].map((value) => String(value ?? "").trim());
  const mapping: Partial<Record<ResourceField, string>> = {};
  const used = new Set<string>();
  if (!requestedMapping) for (const header of headers) {
    const key = normalize(header);
    const field = RESOURCE_FIELDS.find((candidate) => aliases[candidate].includes(key));
    if (field && !mapping[field]) mapping[field] = header;
  }
  if (requestedMapping) {
    for (const field of RESOURCE_FIELDS) delete mapping[field];
    for (const [field, header] of Object.entries(requestedMapping) as Array<[ResourceField, string]>) {
      if (!RESOURCE_FIELDS.includes(field) || (header && !headers.includes(header))) throw new Error("Invalid column mapping");
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
    const errors: string[] = [];
    for (const required of ["employeeId", "name", "email", "location", "costRate", "portfolioCode"] as const) if (!values[required]) errors.push(`Missing ${required}`);
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) errors.push("Invalid email");
    if (values.costRate && (!Number.isFinite(Number(values.costRate)) || Number(values.costRate) < 0)) errors.push("Cost rate must be a non-negative number");
    if (values.gender && !["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].includes(values.gender.toUpperCase())) errors.push("Gender must be Female, Male, Other, or Undisclosed");
    if (values.willingToRelocate && !["true", "false", "yes", "no", "1", "0"].includes(values.willingToRelocate.toLowerCase())) errors.push("Willing to relocate must be Yes or No");
    for (const field of ["priorExperienceYears", "totalYoe", "taoExperience"] as const) if (values[field] && (!Number.isFinite(Number(values[field])) || Number(values[field]) < 0)) errors.push(`${field} must be a non-negative number`);
    if (values.dateOfJoining && Number.isNaN(new Date(values.dateOfJoining).getTime())) errors.push("Invalid date of joining");
    return { rowNumber: headerIndex + index + 2, values, errors };
  }).filter((row) => Object.keys(row.values).length > 0);
  const ids = new Set<string>();
  for (const row of rows) if (row.values.employeeId) { if (ids.has(row.values.employeeId)) row.errors.push("Duplicate employeeId in workbook"); ids.add(row.values.employeeId); }
  return { sheetNames, sheetName, headers, mapping, unmappedHeaders: headers.filter((header) => header && !used.has(header)), rows, warnings: [`Reading worksheet: ${sheetName}.`, "New resource rows require Employee ID, Name, Email, Location, Cost rate, and Portfolio code. Blank optional cells use system defaults or remain unchanged."] };
}
