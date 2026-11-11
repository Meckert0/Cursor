import { describe, expect, it } from "vitest";
import type { PartDto } from "@/lib/api";
import { databaseFamilies, searchDatabase } from "./database-search";

function part(id: string, category: PartDto["category"], family = "Other family"): PartDto {
  return {
    id, category, family, partNumber: id.toUpperCase(), description: `${id} description`, attributes: {},
    isActive: true, isReviewed: true, stockStatus: "unknown", createdByUserId: "test", createdAt: "",
    lastEditedByUserId: "test", lastEditedAt: "", updatedAt: ""
  };
}

const modulePart = { ...part("module", "module", "Coax"), partNumber: "00123", notes: "Manufacturer note", partType: "ITA", side: "Receiver" };
const records = {
  items: [part("frame", "frame"), modulePart, part("other", "module"), part("contact", "contact"), part("wire", "wire"), part("backshell", "backshell"), part("strain", "strain-relief")],
  relationships: [
    { id: "frame-rule", parentPartId: "frame", targetPartIds: ["module", "other"], compatibleParts: ["00123", "OTHER"], parentPositions: ["A"], relationshipType: "MODULE_ALLOWED", status: "allowed" as const },
    { id: "contact-rule", parentPartId: "module", targetPartIds: ["contact"], compatibleParts: ["CONTACT"], parentPositions: ["1"], relationshipType: "CONTACT_ALLOWED", status: "review" as const }
  ],
  aliases: [{ partId: "module", codeSystem: "test", code: "ABC" }, { partId: "other", codeSystem: "test", code: "DEF" }],
  contactWire: [{ contactPartId: "contact", wirePartId: "wire", status: "allowed" as const }],
  moduleContact: [{ modulePartId: "module", contactPartId: "contact", status: "allowed" as const }],
  moduleBackshell: [{ modulePartId: "module", backshellPartId: "backshell", status: "allowed" as const }],
  moduleStrainRelief: [{ modulePartId: "module", strainReliefPartId: "strain", status: "review" as const }],
  media: [
    { id: "module-view", partId: "module", url: "https://example.test/module.pdf", viewType: "drawing", sortOrder: 0, isPrimary: true },
    { id: "other-view", partId: "other", url: "https://example.test/other.pdf", viewType: "drawing", sortOrder: 0, isPrimary: false }
  ]
};

describe("shared database search", () => {
  it("keeps all records when filters are empty", () => {
    expect(searchDatabase(records, { q: "  ", family: " " })).toBe(records);
  });

  it("finds an item by part number and includes complete incoming and outgoing compatibility", () => {
    const result = searchDatabase(records, { q: " 00123 " });
    expect(result.items).toEqual([modulePart]);
    expect(result.relationships).toEqual(records.relationships);
    expect(result.relationships[0]).toBe(records.relationships[0]);
    expect(result.relationships[0].targetPartIds).toEqual(["module", "other"]);
    expect(result.media.map(row => row.id)).toEqual(["module-view"]);
    expect(result.aliases.map(row => row.code)).toEqual(["ABC"]);
    expect(result.moduleContact).toEqual(records.moduleContact);
    expect(result.moduleBackshell).toEqual(records.moduleBackshell);
    expect(result.moduleStrainRelief).toEqual(records.moduleStrainRelief);
    expect(result.contactWire).toEqual([]);
  });

  it("matches a rule's parent independently of its targets", () => {
    expect(searchDatabase(records, { q: "FRAME" }).relationships.map(row => row.id)).toEqual(["frame-rule"]);
  });

  it("finds compatibility pairs from either endpoint", () => {
    expect(searchDatabase(records, { q: "CONTACT" }).contactWire).toEqual(records.contactWire);
    expect(searchDatabase(records, { q: "WIRE" }).contactWire).toEqual(records.contactWire);
    expect(searchDatabase(records, { q: "CONTACT" }).moduleContact).toEqual(records.moduleContact);
    expect(searchDatabase(records, { q: "BACKSHELL" }).moduleBackshell).toEqual(records.moduleBackshell);
    expect(searchDatabase(records, { q: "STRAIN" }).moduleStrainRelief).toEqual(records.moduleStrainRelief);
  });

  it("combines exact family selection with text search, ignoring case and outer spaces", () => {
    expect(searchDatabase(records, { q: "00123", family: " coAX " }).items).toEqual([modulePart]);
    expect(searchDatabase(records, { q: "00123", family: "Other family" }).items).toEqual([]);
  });

  it("preserves searches across item descriptions, family, type, side and notes", () => {
    for (const q of ["MODULE DESCRIPTION", "COAX", "ITA", "RECEIVER", "MANUFACTURER NOTE"]) {
      expect(searchDatabase(records, { q }).items).toContainEqual(modulePart);
    }
  });

  it("returns no results in any tab when no items match", () => {
    const before = JSON.stringify(records);
    const result = searchDatabase(records, { q: "not a catalog item" });
    for (const rows of Object.values(result)) expect(rows).toEqual([]);
    expect(JSON.stringify(records)).toBe(before);
  });

  it("supports legacy part-number projections while canonical target IDs take precedence", () => {
    const legacy = { ...records.relationships[0], targetPartIds: undefined };
    expect(searchDatabase({ ...records, relationships: [legacy] }, { q: "00123" }).relationships).toEqual([legacy]);
    expect(searchDatabase({ ...records, relationships: [{ ...legacy, targetPartIds: ["other"] }] }, { q: "00123" }).relationships).toEqual([]);
  });

  it("builds a stable family selector from the complete catalog", () => {
    expect(databaseFamilies([modulePart, part("b", "wire", " coax "), part("a", "wire", " Alpha "), part("blank", "wire", " ")])).toEqual(["Alpha", "Coax"]);
  });
});
