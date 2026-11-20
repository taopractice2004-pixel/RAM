import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import ExcelImportWizard, { assignColumn, sampleMatches } from "./ExcelImportWizard";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: { post: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ portfolios: [] }) }));
const metadata = { employeeId: { label: "Employee ID", type: "text", requiredForNew: true }, name: { label: "Name", type: "text", requiredForNew: true }, costRate: { label: "Cost rate", type: "number", requiredForNew: true }, location: { label: "Location", type: "text", requiredForNew: true }, portfolioCode: { label: "Portfolio code", type: "text", requiredForNew: true } };
const preview = { expectedVersions: { E0: null }, headerRow: 1, sheetNames: ["Data"], sheetName: "Data", headers: ["Key", "Person", "Other"], samples: { Key: ["E1"], Person: ["Alice"], Other: ["sample"] }, mapping: { employeeId: "Key", name: "Person" }, fieldMetadata: metadata, rows: Array.from({ length: 21 }, (_, index) => ({ rowNumber: index + 2, source: { Key: `E${index}`, Person: "Alice" }, values: { employeeId: `E${index}`, name: "Alice" }, errors: [], status: "NEW" })) };

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
  it("reviews mappings, resolves ignored columns, revalidates, and imports the ready rows", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: preview });
    let view: ReturnType<typeof create>;
    await act(async () => { view = create(<ExcelImportWizard onImported={vi.fn()} />); });
    const click = async (text: string) => {
      const button = view.root.findAllByType("button").find((node) => node.children.join("").includes(text));
      expect(button).toBeTruthy();
      await act(async () => { await button!.props.onClick(); });
    };
    await act(async () => { view.root.findByProps({ type: "file" }).props.onChange({ target: { files: [{ name: "data.xlsx", size: 3, arrayBuffer: async () => new ArrayBuffer(3) }], value: "" } }); });
    const mappingSummary = view!.root.findAllByType("span").find((node) => node.children.join("").includes("auto-mapped"));
    expect(mappingSummary?.children.join("")).toBe("2 auto-mapped · 1 to review");
    expect(JSON.stringify(view!.toJSON())).toContain("Cost rate");
    const selects = view!.root.findAllByType("select");
    await act(async () => { selects[0].props.onChange({ target: { value: "name" } }); });
    expect(JSON.stringify(view!.toJSON())).toContain("will leave");
    await click("Keep current mapping");
    const ignore = view!.root.findAllByType("select").find((select) => select.props.value === "");
    expect(ignore).toBeTruthy();
    await act(async () => { ignore!.props.onChange({ target: { value: "__ignore" } }); });
    await click("Next: Review");
    expect(JSON.stringify(view!.toJSON())).toContain("Import review");
    expect(JSON.stringify(view!.toJSON())).toContain("Ready");
    await click("Revalidate on server");
    vi.mocked(api.post).mockResolvedValue({ data: { batchId: "batch", createdCount: 1, updatedCount: 0, quarantinedCount: 0, totals: { FAILED: 1 } } });
    await click("Import 21 ready rows");
    const firstCommit = vi.mocked(api.post).mock.calls.slice(-1)[0];
    expect(firstCommit[1]).toMatchObject({ expectedVersions: preview.expectedVersions, filename: "data.xlsx" });
    await click("Retry failed/pending");
    expect(vi.mocked(api.post).mock.calls.slice(-1)[0][1]).toEqual(firstCommit[1]);
    await act(async () => { view!.unmount(); });
  });
  it("opens row details and previews a bulk correction before sending it for revalidation", async () => {
    const issuePreview = {
      ...preview,
      rows: [
        { rowNumber: 7, source: { Key: "2003", Person: "Kavya Gupta", Country: "India", Portfolio: "PF-9999" }, values: { employeeId: "2003", name: "Kavya Gupta", country: "India", portfolioCode: "PF-9999" }, errors: ["Missing location", "Portfolio code was not found"], notes: ["Missing location", "Portfolio code was not found"], status: "BLOCKED" },
        { rowNumber: 8, source: { Key: "2004", Person: "Aditi Das" }, values: { employeeId: "2004", name: "Aditi Das", location: "Pune", costRate: "95", portfolioCode: "PF-1020" }, errors: [], notes: [], status: "NEW" },
      ],
    };
    vi.mocked(api.post).mockResolvedValue({ data: issuePreview });
    let view: ReturnType<typeof create>;
    await act(async () => { view = create(<ExcelImportWizard onImported={vi.fn()} />); });
    await act(async () => { view!.root.findByProps({ type: "file" }).props.onChange({ target: { files: [{ name: "issues.xlsx", size: 3, arrayBuffer: async () => new ArrayBuffer(3) }], value: "" } }); });
    const ignore = view!.root.findAllByType("select").find((select) => select.props.value === "");
    await act(async () => { ignore!.props.onChange({ target: { value: "__ignore" } }); });
    const next = view!.root.findAllByType("button").find((node) => node.children.join("").includes("Next: Review"));
    await act(async () => { await next!.props.onClick(); });
    expect(JSON.stringify(view!.toJSON())).toContain("Missing location");
    const emptyCell = view!.root.findAllByType("button").find((node) => node.props.title === "Empty");
    await act(async () => { emptyCell!.props.onClick(); });
    expect(view!.root.findByProps({ role: "dialog" })).toBeTruthy();
    expect(JSON.stringify(view!.toJSON())).toContain("Suggestions");
    const close = view!.root.findAllByType("button").find((node) => node.children.join("") === "Close");
    await act(async () => { close!.props.onClick(); });
    const checkbox = view!.root.findByProps({ "aria-label": "Select import row 7" });
    await act(async () => { checkbox.props.onChange({ target: { checked: true } }); });
    const bulkInput = view!.root.findByProps({ id: "bulk-value" });
    await act(async () => { bulkInput.props.onChange({ target: { value: "Pune" } }); });
    const applyPreview = view!.root.findAllByType("button").find((node) => node.children.join("").includes("Apply to 1 rows"));
    await act(async () => { applyPreview!.props.onClick(); });
    expect(JSON.stringify(view!.toJSON())).toContain("Preview before applying");
    const apply = view!.root.findAllByType("button").find((node) => node.children.join("") === "Apply");
    await act(async () => { apply!.props.onClick(); });
    const revalidate = view!.root.findAllByType("button").find((node) => node.children.join("").includes("Revalidate on server"));
    await act(async () => { await revalidate!.props.onClick(); });
    expect(vi.mocked(api.post).mock.calls.slice(-1)[0][1]).toMatchObject({ editedRows: { "7": { location: "Pune" } } });
    await act(async () => { view!.unmount(); });
  });
});
