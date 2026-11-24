import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilterControls from "./FilterControls";
import { FIELD_REGISTRY } from "./fields";

function textContent(node: TestRenderer.ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  return node.children.map((child) => textContent(child as TestRenderer.ReactTestInstance | string)).join("");
}

describe("filter selection dialog", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("document", { body: { style: { overflow: "" } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function render(onChange = vi.fn()) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <FilterControls
          fields={FIELD_REGISTRY.filter((field) => field.filterable)}
          filters={[]}
          onChange={onChange}
          onClose={() => undefined}
          optionValues={{}}
        />,
      );
    });
    return { renderer, onChange };
  }

  function openNameFilter(renderer: TestRenderer.ReactTestRenderer) {
    act(() => renderer.root.findByProps({ "aria-haspopup": "dialog" }).props.onClick());
    const nameField = renderer.root.findAllByType("button").find((button) => textContent(button) === "Emp name");
    expect(nameField).toBeDefined();
    act(() => nameField?.props.onClick());
    const input = renderer.root.findByProps({ placeholder: "Enter a value" });
    act(() => input.props.onChange({ target: { value: "Alice" } }));
  }

  it("opens a dialog and applies a selected filter", () => {
    const { renderer, onChange } = render();
    openNameFilter(renderer);
    expect(renderer.root.findByProps({ role: "dialog" }).props["aria-modal"]).toBe("true");

    const apply = renderer.root.findAllByType("button").find((button) => textContent(button) === "Apply filter");
    act(() => apply?.props.onClick());

    expect(onChange).toHaveBeenCalledWith([{ key: "name", operator: "contains", value: "Alice" }]);
    expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  });

  it("discards draft edits when the dialog is cancelled", () => {
    const { renderer, onChange } = render();
    openNameFilter(renderer);

    const cancel = renderer.root.findAllByType("button").find((button) => textContent(button) === "Cancel");
    act(() => cancel?.props.onClick());

    expect(onChange).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  });
});
