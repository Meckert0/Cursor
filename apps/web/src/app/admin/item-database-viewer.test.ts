import { describe, expect, it } from "vitest";
import type { LibraryFieldDefinitionDto } from "@/lib/api";
import { getCreateEditableFieldOrder, getDefaultEditableFieldOrder, normalizeEditableFieldOrder, reorderColumnOrder } from "./item-database-viewer";

function makeFieldDefinition(overrides: Partial<LibraryFieldDefinitionDto>): LibraryFieldDefinitionDto {
  return {
    id: overrides.id ?? "field-id",
    category: overrides.category ?? "wire",
    key: overrides.key ?? "partNumber",
    label: overrides.label ?? "Part number",
    valueType: "text",
    isSystem: overrides.isSystem ?? true,
    isVisibleInViewer: overrides.isVisibleInViewer ?? true,
    showOnAddForm: overrides.showOnAddForm ?? false,
    showInSearch: overrides.showInSearch ?? false,
    createdByUserId: overrides.createdByUserId ?? "tester",
    createdAt: overrides.createdAt ?? "2026-05-19T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-19T00:00:00.000Z"
  };
}

describe("item database viewer edit field helpers", () => {
  it("builds wire order with viewer-matching columns and custom fields", () => {
    const order = getDefaultEditableFieldOrder("wire", [
      makeFieldDefinition({ key: "partNumber", label: "Part number", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "family", label: "Family", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "awg", label: "AWG", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "color", label: "Color", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "description", label: "Description", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "stockStatus", label: "Stock status", isSystem: true, isVisibleInViewer: false }),
      makeFieldDefinition({ id: "custom-insulation", key: "insulation", label: "Insulation", isSystem: false, isVisibleInViewer: true }),
      makeFieldDefinition({ id: "custom-hidden", key: "internalRef", label: "Internal Ref", isSystem: false, isVisibleInViewer: false })
    ]);
    expect(order).toContain("awg");
    expect(order).toContain("color");
    expect(order).not.toContain("description");
    expect(order).not.toContain("stockStatus");
    expect(order).not.toContain("compatibilityHints");
    expect(order).toContain("custom:insulation");
    expect(order).toContain("custom:internalRef");
  });

  it("omits audit and review fields from create form order", () => {
    const order = getCreateEditableFieldOrder("wire", [
      makeFieldDefinition({ key: "partNumber", label: "Part number", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "family", label: "Family", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "awg", label: "AWG", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ key: "color", label: "Color", isSystem: true, isVisibleInViewer: true }),
      makeFieldDefinition({ id: "custom-insulation", key: "insulation", label: "Insulation", isSystem: false, isVisibleInViewer: true })
    ]);
    expect(order).toEqual(["partNumber", "family", "awg", "color", "isActive", "custom:insulation"]);
    expect(order).not.toContain("createdByUserId");
    expect(order).not.toContain("createdAt");
    expect(order).not.toContain("isReviewed");
    expect(order).not.toContain("reviewedByUserId");
    expect(order).not.toContain("reviewedAt");
    expect(order).not.toContain("lastEditedByUserId");
    expect(order).not.toContain("lastEditedAt");
  });

  it("normalizes order to allowed fields and appends missing", () => {
    const normalized = normalizeEditableFieldOrder(["custom:insulation", "unknown", "family"], ["partNumber", "family", "custom:insulation"]);
    expect(normalized).toEqual(["custom:insulation", "family", "partNumber"]);
  });

  it("reorders movable columns but keeps partNumber first", () => {
    const reordered = reorderColumnOrder(["partNumber", "family", "description", "isActive"], "description", "family", [
      "partNumber",
      "family",
      "description",
      "isActive"
    ]);
    expect(reordered).toEqual(["partNumber", "description", "family", "isActive"]);
  });

  it("ignores moves from or to locked partNumber", () => {
    const baseOrder = ["partNumber", "family", "description", "isActive"];
    expect(reorderColumnOrder(baseOrder, "partNumber", "family", baseOrder)).toEqual(baseOrder);
    expect(reorderColumnOrder(baseOrder, "family", "partNumber", baseOrder)).toEqual(baseOrder);
  });
});
