import { describe, expect, it } from "vitest";
import type { PartDto, PartRelationshipDto } from "@/lib/api";
import { databaseFamilies, searchDatabase, type DatabaseRecords } from "./database-search";

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

  it("keeps unrelated Mini groups out of QuadraPaddle results across the shared search", () => {
    const hybrid = { ...part("hybrid", "module", "QuadraPaddle"), description: "Signal/Mini Power/Mini Coax module, QuadraPaddle, 100/8 position" };
    const quad = { ...part("quad", "contact", "QuadraPaddle"), description: "QuadraPaddle signal contact" };
    const mini = { ...part("mini", "contact", "Mini"), description: "Mini Power contact" };
    const group = (id: string, targets: PartDto[], positionType: string): PartRelationshipDto => ({
      id, parentPartId: hybrid.id, targetPartIds: targets.map(target => target.id), compatibleParts: targets.map(target => target.partNumber),
      relationshipType: "CONTACT_ALLOWED", positionType, parentPositions: ["1", "2", "3"], status: "allowed"
    });
    const groups = [group("quad-group", [quad], "QUADRAPADDLE"), group("mini-group", [mini], "MINI"), group("mixed-group", [quad, mini], "MIXED")];
    const hybridRecords: DatabaseRecords = {
      items: [hybrid, quad, mini], relationships: groups,
      moduleContact: [
        { modulePartId: hybrid.id, contactPartId: quad.id, status: "allowed" },
        { modulePartId: hybrid.id, contactPartId: mini.id, status: "allowed" }
      ],
      aliases: [quad, mini].map(item => ({ partId: item.id, codeSystem: "test", code: item.id })),
      media: [hybrid, quad, mini].map(item => ({ id: `${item.id}-image`, partId: item.id, url: `https://example.test/${item.id}.png`, viewType: "side_profile", sortOrder: 0, isPrimary: false })),
      contactWire: [], moduleBackshell: [], moduleStrainRelief: []
    };
    const before = JSON.stringify(hybridRecords);
    for (const input of [{ q: " QuAdRaPaDdLe " }, { family: "QuadraPaddle" }]) {
      const result = searchDatabase(hybridRecords, input);
      expect(result.items.map(item => item.id)).toEqual(["hybrid", "quad"]);
      expect(result.relationships.map(row => row.id)).toEqual(["quad-group", "mixed-group"]);
      expect(result.moduleContact.map(row => row.contactPartId)).toEqual(["quad"]);
      expect(result.aliases.map(row => row.partId)).toEqual(["quad"]);
      expect(result.media.map(row => row.partId)).toEqual(["hybrid", "quad"]);
      expect(result.relationships[1]).toBe(groups[2]);
      expect(result.relationships[1].targetPartIds).toEqual(["quad", "mini"]);
    }
    expect(searchDatabase(hybridRecords, { q: "mini" }).relationships.map(row => row.id)).toEqual(["mini-group", "mixed-group"]);
    expect(searchDatabase(hybridRecords, { q: hybrid.partNumber }).relationships).toEqual(groups);
    expect(searchDatabase(hybridRecords, { q: "100/8 position" }).relationships).toEqual(groups);
    expect(JSON.stringify(hybridRecords)).toBe(before);
  });
});
