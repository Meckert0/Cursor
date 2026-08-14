import { describe, expect, it } from "vitest";
import {
  getCreateEditableFieldOrder,
  getDefaultEditableFieldOrder,
  normalizeEditableFieldOrder,
  reorderColumnOrder
} from "./item-database-viewer";

describe("item database viewer edit field helpers", () => {
  it("builds wire edit order from all category part fields", () => {
    const order = getDefaultEditableFieldOrder("wire");
    expect(order).toContain("partNumber");
    expect(order).toContain("family");
    expect(order).toContain("awg");
    expect(order).toContain("color");
    expect(order).toContain("description");
    expect(order).toContain("stockStatus");
    expect(order).toContain("isActive");
    expect(order).toContain("createdByUserId");
    expect(order).not.toContain("compatibilityHints");
    expect(order.every((fieldId) => !fieldId.startsWith("custom:"))).toBe(true);
    expect(order.every((fieldId) => !fieldId.startsWith("attr:"))).toBe(true);
  });

  it("omits audit and review fields from create form order", () => {
    const order = getCreateEditableFieldOrder("wire");
    expect(order).toContain("partNumber");
    expect(order).toContain("family");
    expect(order).toContain("awg");
    expect(order).toContain("color");
    expect(order).toContain("isActive");
    expect(order).toContain("stockStatus");
    expect(order).not.toContain("createdByUserId");
    expect(order).not.toContain("createdAt");
    expect(order).not.toContain("isReviewed");
    expect(order).not.toContain("reviewedByUserId");
    expect(order).not.toContain("reviewedAt");
    expect(order).not.toContain("lastEditedByUserId");
    expect(order).not.toContain("lastEditedAt");
  });

  it("normalizes order to allowed fields and appends missing", () => {
    const normalized = normalizeEditableFieldOrder(["awg", "unknown", "family"], ["partNumber", "family", "awg"]);
    expect(normalized).toEqual(["awg", "family", "partNumber"]);
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
