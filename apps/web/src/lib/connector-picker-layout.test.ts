import { afterEach, describe, expect, it } from "vitest";
import { CONNECTOR_PICKER_COLUMNS } from "./connector-picker";
import { defaultPickerLayout, MAX_PICKER_COLUMN_WIDTH, MIN_PICKER_COLUMN_WIDTH, movePickerColumn, normalizePickerLayout, readPickerLayout, savePickerLayout } from "./connector-picker-layout";

afterEach(() => window.localStorage.clear());
describe("connector picker layouts", () => {
  it("reorders columns before and after a target without losing hidden columns", () => {
    const order = defaultPickerLayout("connector").order;
    const moved = movePickerColumn(order, "family", "partNumber");
    expect(moved.slice(0, 3)).toEqual(["family", "partNumber", "description"]);
    expect(new Set(moved)).toEqual(new Set(order));
    expect(movePickerColumn(moved, "partNumber", "description", true).slice(0, 3)).toEqual(["family", "description", "partNumber"]);
    expect(movePickerColumn(order, "family", "family")).toBe(order);
  });
  it("validates saved preferences, clamps widths, and keeps the required part-number column", () => {
    const layout = normalizePickerLayout({ order: ["family", "family", "old-column", "description"], visible: ["family", "old-column"], widths: { family: 1, description: 10_000, side: "200", type: null, removed: 140 } }, "connector");
    expect(layout.order.slice(0, 2)).toEqual(["family", "description"]);
    expect(layout.order).toHaveLength(CONNECTOR_PICKER_COLUMNS.length);
    expect(layout.visible).toEqual(["partNumber", "family"]);
    expect(layout.widths).toEqual({ family: MIN_PICKER_COLUMN_WIDTH, description: MAX_PICKER_COLUMN_WIDTH });
  });
  it("remembers column layouts separately for connectors, frames, and SIM inserts", () => {
    const layout = defaultPickerLayout("connector");
    layout.order = movePickerColumn(layout.order, "description", "partNumber");
    layout.widths.description = 320;
    savePickerLayout("connector", layout);
    expect(readPickerLayout("connector")).toEqual(layout);
    expect(readPickerLayout("frame")).toEqual(defaultPickerLayout("frame"));
    expect(readPickerLayout("sim-insert")).toEqual(defaultPickerLayout("sim-insert"));
  });
  it("recovers from malformed storage and defaults visibility for older settings", () => {
    window.localStorage.setItem("connector-picker.layout.v1.connector", "{broken");
    expect(readPickerLayout("connector")).toEqual(defaultPickerLayout("connector"));
    expect(normalizePickerLayout({ order: ["family"] }, "frame").visible).toContain("moduleCapacity");
  });
});
