export const SAFE_EXCEL_FIELDS = ["name", "email", "gender", "country", "workLocation", "location", "willingToRelocate", "costRate", "currency", "portfolioCode", "managerName", "designation", "subCategory", "dateOfJoining", "priorExperienceYears", "totalYoe", "taoExperience", "skills", "certifications"] as const;
export type SafeExcelField = typeof SAFE_EXCEL_FIELDS[number];
export type ReconcileStatus = "NEW" | "CHANGED" | "UNCHANGED" | "DUPLICATE" | "BLOCKED";
function normalizeValue(field: SafeExcelField, value: unknown) {
  if (value == null) return "";
  if (field === "willingToRelocate") return ["true", "yes", "1"].includes(String(value).toLowerCase()) ? "true" : "false";
  if (field === "costRate" || field === "priorExperienceYears" || field === "totalYoe" || field === "taoExperience") return String(Number(value));
  if (field === "dateOfJoining") {
    const date = new Date(value as string | number | Date);
    return Number.isNaN(date.getTime()) ? String(value).trim().toLowerCase() : date.toISOString().slice(0, 10);
  }
  return String(value).trim().toLowerCase();
}
export function classifyExcelRows(rows: Array<{ rowNumber: number; values: Partial<Record<string, string>>; errors: string[] }>, existingById: Map<string, Record<string, any> | null>, authorized: (resource: Record<string, any>) => boolean) {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.values.employeeId) counts.set(row.values.employeeId, (counts.get(row.values.employeeId) || 0) + 1);
  return rows.map((row) => {
    const id = row.values.employeeId || "";
    const current = existingById.get(id);
    let status: ReconcileStatus;
    let changes: Array<{ field: SafeExcelField; current: string | null; proposed: string }> = [];
    const notes = [...row.errors];
    if (id && (counts.get(id) || 0) > 1) { status = "DUPLICATE"; notes.push("Employee ID occurs more than once in this workbook"); }
    else if (!id || row.errors.length) status = "BLOCKED";
    else if (!current) { status = "NEW"; notes.push("Ready to create resource"); }
    else if (!authorized(current)) status = "BLOCKED";
    else {
      changes = SAFE_EXCEL_FIELDS.flatMap((field) => {
        const proposed = row.values[field]?.trim();
        if (!proposed || normalizeValue(field, proposed) === normalizeValue(field, current[field])) return [];
        return [{ field, current: current[field] == null ? null : String(current[field]), proposed }];
      });
      status = changes.length ? "CHANGED" : "UNCHANGED";
    }
    return { rowNumber: row.rowNumber, employeeId: id || null, status, changes, notes };
  });
}
