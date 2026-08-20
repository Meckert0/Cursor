import { describe, expect, it } from "vitest";
import { getPartFieldsForCategory, isCanvasConnectorPart, PART_FIELDS_BY_CATEGORY } from "./part-fields";

describe("part fields", () => {
  it("exposes fields for every library category", () => {
    expect(Object.keys(PART_FIELDS_BY_CATEGORY).sort()).toEqual([
      "backshell",
      "contact",
      "label",
      "module",
      "sleeve-tube-braid",
      "splice",
      "strain-relief",
      "wire",
      "frame"
    ].sort());
  });

  it("includes audit and review identity fields for contact", () => {
    const keys = getPartFieldsForCategory("contact").map((field) => field.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "createdByUserId",
        "createdAt",
        "isReviewed",
        "reviewedByUserId",
        "reviewedAt",
        "lastEditedByUserId",
        "lastEditedAt"
      ])
    );
  });

  it("places wire awg/color on attributes with search flags", () => {
    const fields = getPartFieldsForCategory("wire");
    const awg = fields.find((field) => field.key === "awg");
    const color = fields.find((field) => field.key === "color");
    expect(awg?.isIdentity).toBeUndefined();
    expect(awg?.showInSearch).toBe(true);
    expect(color?.showInSearch).toBe(true);
  });

  it("places module pinIds on attributes as a string-list", () => {
    const pinIds = getPartFieldsForCategory("module").find((field) => field.key === "pinIds");
    expect(pinIds?.inputType).toBe("string-list");
    expect(pinIds?.isIdentity).toBeUndefined();
  });

  it("exposes frame slot fields and identity part type", () => {
    const keys = getPartFieldsForCategory("frame").map((field) => field.key);
    expect(keys).toEqual(expect.arrayContaining(["partType", "side", "moduleCapacity", "slotIds"]));
  });

  it("treats only MODULE parts as canvas connectors", () => {
    expect(isCanvasConnectorPart({ category: "module" })).toBe(true);
    expect(isCanvasConnectorPart({ category: "module", partType: "SIM_INSERT" })).toBe(false);
    expect(isCanvasConnectorPart({ category: "frame", partType: "ITA" })).toBe(false);
  });
});
