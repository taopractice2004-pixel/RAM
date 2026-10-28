import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseResourceExcelPreview, normalizeImportRow, validateImportRow, RESOURCE_FIELDS } from "./resourceExcelPreview";
import { classifyExcelRows } from "./resourceExcelReconcile";

test("manifest preserves unmapped source, row numbers and blank separators while redacting email", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resources");
  sheet.addRow(["Emp ID", "Email", "Unmapped"]);
  sheet.addRow(["E1", "private@example.com", " original "]);
  sheet.addRow([]);
  sheet.addRow(["", "", "unmapped only"]);
  const preview = await parseResourceExcelPreview(Buffer.from(await workbook.xlsx.writeBuffer()) as any);
  assert.equal(preview.blankRowCount, 1);
  assert.deepEqual(preview.rows.map((row) => row.rowNumber), [2, 4]);
  assert.equal(preview.rows[0].source.Email, "[REDACTED EMAIL]");
  assert.equal(preview.rows[0].source.Unmapped, " original ");
  assert.equal(preview.rows[1].source.Unmapped, "unmapped only");
});

test("maps reordered resource columns from first worksheet and leaves blank cells absent", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resources");
  sheet.addRow(["Employee Name", "Emp ID", "Role", "Unknown Field"]);
  sheet.addRow(["A Person", "E-1", "Engineer", "extra"]);
  const summary = workbook.addWorksheet("Summary");
  summary.addRow(["Employee Name", "Emp ID"]);
  summary.addRow(["Do not import", "summary"]);
  const bytes = await workbook.xlsx.writeBuffer();
  const preview = await parseResourceExcelPreview(Buffer.from(bytes) as any);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.mapping.employeeId, "Emp ID");
  assert.equal(preview.rows[0].values.name, "A Person");
  assert.deepEqual(preview.unmappedHeaders, ["Unknown Field"]);
  assert.deepEqual(preview.sheetNames, ["Resources", "Summary"]);
  assert.equal(preview.sheetName, "Resources");
  assert.deepEqual(preview.samples["Employee Name"], ["A Person"]);
  assert.equal(preview.fieldMetadata.employeeId.label, "Employee ID");
  assert.equal(preview.fieldMetadata.costRate.type, "number");
  assert.equal(preview.fieldMetadata.portfolioCode.requiredForNew, true);
});

test("classifies duplicates, differences, unchanged rows and ignores blank proposed fields", () => {
  const rows = [
    { rowNumber: 2, values: { employeeId: "E1", name: "New" }, errors: [] },
    { rowNumber: 3, values: { employeeId: "E1", name: "Duplicate" }, errors: [] },
    { rowNumber: 4, values: { employeeId: "E2", name: "Same", country: "", location: "New York" }, errors: [] },
    { rowNumber: 5, values: { employeeId: "E3", name: "Same" }, errors: [] },
    { rowNumber: 6, values: { employeeId: "E4", name: "New", email: "new@example.com", location: "Boston", costRate: "10", portfolioCode: "FIN" }, errors: [] },
  ];
  const resources = new Map<string, Record<string, any> | null>([
    ["E1", { name: "Old" }], ["E2", { name: "Same", country: "US", location: "Boston" }], ["E3", { name: "Same" }], ["E4", null],
  ]);
  const result = classifyExcelRows(rows, resources, () => true);
  assert.deepEqual(result.map((row) => row.status), ["DUPLICATE", "DUPLICATE", "CHANGED", "UNCHANGED", "NEW"]);
  assert.deepEqual(result[2].changes, [{ field: "location", current: "Boston", proposed: "New York" }]);
  assert.ok(result[4].notes.some((note) => note.includes("Ready to create")));
});

test("requires core fields for new resources but allows partial updates to existing resources", () => {
  const rows = [
    { rowNumber: 2, values: { employeeId: "E-1", name: "New" }, errors: [] },
    { rowNumber: 3, values: { employeeId: "E-2", name: "Updated" }, errors: [] },
  ];
  const resources = new Map<string, Record<string, any> | null>([
    ["E-1", null],
    ["E-2", { name: "Original", email: "person@example.com", portfolioId: "p-1" }],
  ]);
  const result = classifyExcelRows(rows, resources, () => true);
  assert.equal(result[0].status, "BLOCKED");
  assert.ok(result[0].notes.includes("Missing location"));
  assert.equal(result[1].status, "CHANGED");
  assert.deepEqual(result[1].changes, [{ field: "name", current: "Original", proposed: "Updated" }]);
});

test("shared validation requires only approved fields and ignores email and blank updates", () => {
  const row = normalizeImportRow({ employeeId: " E1 ", name: "Person", location: "NY", costRate: "0", portfolioCode: "FIN", email: "ignored", country: " " });
  assert.deepEqual(validateImportRow(row, true), []);
  assert.equal("email" in row, false);
  assert.equal("country" in row, false);
  assert.equal(RESOURCE_FIELDS.some((field) => String(field) === "email"), false);
  assert.deepEqual(validateImportRow({ employeeId: "E1" }), []);
  assert.ok(validateImportRow({ ...row, costRate: "Infinity" }, true).length);
  assert.ok(validateImportRow({ ...row, skills: "React:6:-1", certifications: "Cert:Issuer:invalid" }, true).length >= 2);
  assert.deepEqual(validateImportRow({ ...row, costRate: "12" }, true), []);
});

test("worksheet selection refreshes metadata and supports two-column partial updates", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("First").addRow(["Emp ID", "Name", "Location"]);
  const second = workbook.addWorksheet("Second");
  second.addRow(["employeeId", "costRate"]);
  second.addRow(["E1", "12"]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await parseResourceExcelPreview(bytes, undefined, "Second");
  assert.deepEqual(preview.headers, ["employeeId", "costRate"]);
  assert.deepEqual(preview.rows[0].values, { employeeId: "E1", costRate: "12" });
  await assert.rejects(() => parseResourceExcelPreview(bytes, { name: "Name" }, "Second"), /mapping/);
});

test("rejects oversized workbooks and non-xlsx inputs, and permits unfamiliar headings", async () => {
  await assert.rejects(() => parseResourceExcelPreview(Buffer.alloc(200 * 1024 * 1024 + 1)), /200 MB/);
  await assert.rejects(() => parseResourceExcelPreview(Buffer.from("not an xlsx file")), /\.xlsx/);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("First").addRow(["x", "y"]);
  const bytes = await workbook.xlsx.writeBuffer();
  const preview = await parseResourceExcelPreview(Buffer.from(bytes));
  assert.deepEqual(preview.headers, ["x", "y"]);
  assert.deepEqual(preview.mapping, {});
});

test("explicit header choice preserves row numbers and rejects duplicate headings", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  sheet.addRow(["Report title"]);
  sheet.addRow(["Staff key", "Amount"]);
  sheet.addRow(["E1", "12"]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await parseResourceExcelPreview(bytes, { employeeId: "Staff key", costRate: "Amount" }, "Data", 2);
  assert.equal(preview.headerRow, 2);
  assert.equal(preview.rows[0].rowNumber, 3);
  assert.deepEqual(preview.rows[0].values, { employeeId: "E1", costRate: "12" });
  sheet.getRow(2).values = ["Name", " name "];
  const duplicateBytes = Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(() => parseResourceExcelPreview(duplicateBytes, undefined, "Data", 2), /Duplicate column headings/);
});
