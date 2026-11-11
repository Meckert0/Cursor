import { describe, expect, it } from "vitest";
import type { PartDto, PartRelationshipDto } from "@/lib/api";
import { compatibilityStatus } from "../../../../../src/domain/compatibility-rules";
import { compatiblePartDisplays, formatRelationshipPositions, visibleCompatibleParts } from "./compatibility-display";

const part = (id: string, description: string, attributes: PartDto["attributes"] = {}): PartDto => ({
  id, category: "module", family: "Test", partNumber: id.toUpperCase(), description, attributes,
  isActive: true, isReviewed: true, stockStatus: "unknown", createdByUserId: "test", createdAt: "",
  lastEditedByUserId: "test", lastEditedAt: "", updatedAt: ""
});
const parent = part("parent", "Hybrid module");
const quad = part("quad", "QuadraPaddle contact");
const mini = part("mini", "Mini Power contact");
const row: PartRelationshipDto = {
  id: "rule", parentPartId: parent.id, targetPartIds: [quad.id, mini.id], compatibleParts: [quad.partNumber, mini.partNumber],
  relationshipType: "CONTACT_ALLOWED", parentPositions: ["1", "2", "3", "5", "6"], status: "allowed", isExhaustive: true
};

describe("compatibility display", () => {
  it("resolves descriptions by stable IDs rather than stale or duplicate part numbers", () => {
    expect(compatiblePartDisplays({ ...row, compatibleParts: ["OLD", "OLD"] }, [parent, quad, mini])).toEqual([
      { id: "quad", partNumber: "QUAD", description: "QuadraPaddle contact" },
      { id: "mini", partNumber: "MINI", description: "Mini Power contact" }
    ]);
    const legacy = { ...row, targetPartIds: undefined };
    expect(compatiblePartDisplays(legacy, [quad, mini])[0].description).toBe("QuadraPaddle contact");
    expect(compatiblePartDisplays(legacy, [quad, { ...mini, partNumber: "QUAD" }])[0].description).toBe("");
  });

  it("narrows visible targets while preserving the original group and exact validation", () => {
    const before = JSON.stringify(row);
    const parts = compatiblePartDisplays(row, [parent, quad, mini]);
    expect(visibleCompatibleParts(parts, parent, new Set([parent.id, quad.id]), "quadrapaddle")).toEqual([parts[0]]);
    expect(visibleCompatibleParts(parts, parent, new Set([parent.id]), "parent")).toBe(parts);
    expect(visibleCompatibleParts(parts, parent, new Set([parent.id]), "hybrid module")).toBe(parts);
    expect(formatRelationshipPositions(row)).toBe("1–3, 5–6");
    const status = (targetPartId: string, position: string) => compatibilityStatus({
      rules: [row], parentPartId: parent.id, relationshipType: row.relationshipType, targetPartId, position, requireAllowance: true
    });
    expect(status(quad.id, "3")).toBe("allowed");
    expect(status(mini.id, "5")).toBe("allowed");
    expect(status(quad.id, "4")).toBe("forbidden");
    expect(status(quad.id, "1–3")).toBe("forbidden");
    expect(JSON.stringify(row)).toBe(before);
  });

  it("compresses long numeric and alphanumeric lists without bridging gaps", () => {
    const numeric = Array.from({ length: 160 }, (_, index) => String(index + 1));
    const positions = ["A", "B", "C", "D"].flatMap(letter => Array.from({ length: 40 }, (_, index) => `${letter}${index + 1}`));
    expect(formatRelationshipPositions({ parentPositions: numeric })).toBe("1–160");
    expect(formatRelationshipPositions({ parentPositions: positions })).toBe("A1–D40");
    const partial = [...positions.slice(0, 20), "B1", "B2"];
    expect(formatRelationshipPositions({ parentPositions: partial }, part("module", "Module", { pinIds: positions }))).toBe("A1–A20, B1–B2");
    expect(formatRelationshipPositions({ parentPositions: ["B", "A", "D"] }, part("frame", "Frame", { slotIds: ["A", "B", "C", "D"] }))).toBe("A–B, D");
    expect(formatRelationshipPositions({ parentPositions: [] })).toBe("All positions");
    expect(numeric).toHaveLength(160);
    expect(partial).toEqual([...positions.slice(0, 20), "B1", "B2"]);
  });

  it("handles source-ordered QuadraPaddle banks with omitted I positions conservatively", () => {
    const columns = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];
    const sourceOrder = Array.from({ length: 10 }, (_, index) => columns.map(letter => `${letter}${index + 1}`)).flat();
    const before = [...sourceOrder];
    expect(formatRelationshipPositions({ parentPositions: sourceOrder }, part("hybrid", "Hybrid", { pinIds: [...sourceOrder, "11", "12"] }))).toBe("A1–H10, J1–K10");
    expect(sourceOrder).toEqual(before);
  });
});
