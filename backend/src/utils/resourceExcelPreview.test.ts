import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseResourceExcelPreview } from "./resourceExcelPreview";
import { classifyExcelRows } from "./resourceExcelReconcile";

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
});

test("classifies duplicates, differences, unchanged rows and ignores blank proposed fields", () => {
  const rows = [
    { rowNumber: 2, values: { employeeId: "E1", name: "New" }, errors: [] },
    { rowNumber: 3, values: { employeeId: "E1", name: "Duplicate" }, errors: [] },
    { rowNumber: 4, values: { employeeId: "E2", name: "Same", country: "", location: "New York" }, errors: [] },
    { rowNumber: 5, values: { employeeId: "E3", name: "Same" }, errors: [] },
    { rowNumber: 6, values: { employeeId: "E4", name: "New" }, errors: [] },
  ];
  const resources = new Map<string, Record<string, any> | null>([
    ["E1", { name: "Old" }], ["E2", { name: "Same", country: "US", location: "Boston" }], ["E3", { name: "Same" }], ["E4", null],
  ]);
  const result = classifyExcelRows(rows, resources, () => true);
  assert.deepEqual(result.map((row) => row.status), ["DUPLICATE", "DUPLICATE", "CHANGED", "UNCHANGED", "NEW"]);
  assert.deepEqual(result[2].changes, [{ field: "location", current: "Boston", proposed: "New York" }]);
  assert.ok(result[4].notes.some((note) => note.includes("Ready to create")));
});

test("rejects oversized or headerless workbooks", async () => {
  await assert.rejects(() => parseResourceExcelPreview(Buffer.alloc(10 * 1024 * 1024 + 1)), /10 MB/);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("First").addRow(["x", "y"]);
  const bytes = await workbook.xlsx.writeBuffer();
  await assert.rejects(() => parseResourceExcelPreview(Buffer.from(bytes) as any), /header row/);
});
