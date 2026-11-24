import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ResourceAllocationRow } from "../resourcesAllocations/fields";
import ExtendAllocationDialog from "./ExtendAllocationDialog";

function dateAfter(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function allocationRow(endDate: string): ResourceAllocationRow {
  const project = { id: "project-1", name: "Project Atlas", code: "ATLAS", portfolioId: "portfolio-1", status: "ACTIVE", startDate: dateAfter(-30), endDate: null };
  const allocation = {
    id: "allocation-1", resourceId: "resource-1", projectId: project.id, taskId: null, portfolioId: project.portfolioId,
    allocationPercent: 100, startDate: dateAfter(-30), endDate: `${endDate}T00:00:00.000Z`, status: "ACTIVE" as const,
    notes: null, project,
  };
  return {
    id: "resource-1", employeeId: "E-1", name: "Diya Singh", email: "diya@example.com", location: "Pune",
    willingToRelocate: false, costRate: null, currency: "INR", portfolioId: project.portfolioId, status: "ALLOCATED",
    benchSince: null, sourceSystem: "test", portfolio: { id: project.portfolioId, name: "Portfolio", code: "P1" },
    skills: [], certifications: [], allocations: [allocation], currentAllocation: allocation, displayAllocations: [allocation],
    expectedBenchDate: null, daysToBench: null, benchPriority: 1,
  };
}

describe("ExtendAllocationDialog", () => {
  it("submits a custom end date selected in the date field", async () => {
    const currentEnd = dateAfter(5);
    const customEnd = dateAfter(20);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const renderer = create(<ExtendAllocationDialog row={allocationRow(currentEnd)} onClose={onClose} onAllocate={vi.fn()} onSave={onSave} />);
    const dateInput = renderer.root.findAllByProps({ type: "date" })[1];

    expect(dateInput.props.min).toBe(dateAfter(6));
    act(() => dateInput.props.onChange({ target: { value: customEnd } }));

    const submit = renderer.root.findByProps({ type: "submit" });
    expect(submit.props.disabled).toBe(false);
    await act(async () => {
      await renderer.root.findByProps({ role: "dialog" }).props.onSubmit({ preventDefault: vi.fn() });
    });

    expect(onSave).toHaveBeenCalledWith(customEnd, "");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
