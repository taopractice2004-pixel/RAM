import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import ExcelImportWizard, { assignColumn, sampleMatches } from "./ExcelImportWizard";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: { post: vi.fn() } }));
const metadata = { employeeId: { label: "Employee ID", type: "text", requiredForNew: true }, name: { label: "Name", type: "text", requiredForNew: true }, costRate: { label: "Cost rate", type: "number", requiredForNew: true } };
const preview = { expectedVersions: { E0: null }, headerRow: 1, sheetNames: ["Data"], sheetName: "Data", headers: ["Key", "Person"], samples: { Key: ["E1"], Person: ["Alice"] }, mapping: { employeeId: "Key", name: "Person" }, fieldMetadata: metadata, rows: Array.from({ length: 21 }, (_, index) => ({ rowNumber: index + 2, values: { employeeId: `E${index}`, name: "Alice" }, errors: [], status: "NEW" })) };

describe("Excel import wizard", () => {
  it("reassigns directly, ignores columns, and never duplicates sources", () => {
    expect(assignColumn({ employeeId: "Key", name: "Person" }, "Key", "name")).toEqual({ name: "Key" });
    expect(assignColumn({ employeeId: "Key" }, "Key", "")).toEqual({});
  });
  it("rejects legacy xls and files larger than 200 MB", async () => {
    vi.mocked(api.post).mockClear();
    let view: ReturnType<typeof create>;
    await act(async () => { view = create(<ExcelImportWizard onImported={vi.fn()} />); });
    const fileInput = view!.root.findByProps({ type: "file" });
    await act(async () => { fileInput.props.onChange({ target: { files: [{ name: "old.xls", size: 5, arrayBuffer: async () => new ArrayBuffer(5) }], value: "" } }); });
    expect(JSON.stringify(view!.toJSON())).toContain(".xlsx");
    await act(async () => { fileInput.props.onChange({ target: { files: [{ name: "large.xlsx", size: 200 * 1024 * 1024 + 1, arrayBuffer: async () => new ArrayBuffer(0) }], value: "" } }); });
    expect(JSON.stringify(view!.toJSON())).toContain("200 MB");
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => { view!.unmount(); });
  });
  it("checks numeric, date, boolean and enum samples", () => {
    expect(sampleMatches("number", "-1")).toBe(false);
    expect(sampleMatches("number", "Infinity")).toBe(false);
    expect(sampleMatches("number", "0")).toBe(true);
    expect(sampleMatches("date", "invalid")).toBe(false);
    expect(sampleMatches("boolean", "Yes")).toBe(true);
    expect(sampleMatches("enum", "unknown")).toBe(false);
  });
  it("shows requirements, confirms occupied targets, paginates and revalidates before actual results", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: preview });
    let view: ReturnType<typeof create>;
    await act(async () => { view = create(<ExcelImportWizard onImported={vi.fn()} />); });
    const click = async (text: string) => {
      const button = view.root.findAllByType("button").find((node) => node.children.join("").includes(text));
      expect(button).toBeTruthy();
      await act(async () => { await button!.props.onClick(); });
    };
    await act(async () => { view.root.findByProps({ type: "file" }).props.onChange({ target: { files: [{ name: "data.xlsx", size: 3, arrayBuffer: async () => new ArrayBuffer(3) }], value: "" } }); });
    expect(JSON.stringify(view!.toJSON())).toContain("Required for all");
    expect(JSON.stringify(view!.toJSON())).toContain("Cost rate (new only)");
    const selects = view!.root.findAllByType("select");
    await act(async () => { selects[1].props.onChange({ target: { value: "name" } }); });
    expect(JSON.stringify(view!.toJSON())).toContain("will leave");
    await click("Keep current mapping");
    await click("Continue to preview");
    expect(view!.root.findAllByType("tr").filter((row) => row.findAllByType("td").length > 0)).toHaveLength(20);
    await click("Next page");
    expect(view!.root.findAllByType("tr").filter((row) => row.findAllByType("td").length > 0)).toHaveLength(1);
    await click("Revalidate and continue");
    expect(view!.root.findByProps({ "aria-current": "step" }).children.join("")).toContain("Validate");
    await click("Back to preview");
    expect(view!.root.findByProps({ "aria-current": "step" }).children.join("")).toContain("Preview");
    await click("Revalidate and continue");
    vi.mocked(api.post).mockResolvedValue({ data: { batchId: "batch", createdCount: 1, updatedCount: 0, quarantinedCount: 0, totals: { FAILED: 1 } } });
    await click("Import 21 selected");
    const firstCommit = vi.mocked(api.post).mock.calls.slice(-1)[0];
    expect(firstCommit[1]).toMatchObject({ expectedVersions: preview.expectedVersions, filename: "data.xlsx" });
    await click("Retry failed/pending");
    expect(vi.mocked(api.post).mock.calls.slice(-1)[0][1]).toEqual(firstCommit[1]);
    await act(async () => { view!.unmount(); });
  });
});
