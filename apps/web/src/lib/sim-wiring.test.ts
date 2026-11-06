import { describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "./api";
import { buildConnectorPositionLookup, resolveWirelistEndpoint, verifyWirelistContact, verifyWirelistLocation } from "./wirelist-utils";
import { buildConnectorModuleEntries } from "./connector-contact-groups";
import { buildSnapshotFromCanvas } from "./cable-canvas-utils";
import { catalogModulePins, flattenSimPins, normalizeCanvasSimModules, simPlacement } from "./sim-modules";

function part(id: string, overrides: Partial<LibraryComponentDto> = {}): LibraryComponentDto {
  return { id, category: "module", partType: "MODULE", family: "SIM", partNumber: id, description: id, isActive: true, isReviewed: true, stockStatus: "in_stock", side: "ITA", attributes: {}, createdByUserId: "u", createdAt: "2026-01-01", lastEditedByUserId: "u", lastEditedAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides };
}
const host = part("host", { electricalMode: "INSERT_HOST", attributes: { pinCount: 128, pinIds: ["1", "2"], simSlotCount: 2, simSlotSections: [["A1", "A2"]] } });
const insert = part("insert", { partType: "SIM_INSERT", attributes: { slotOccupancy: 2, pinIds: ["P", "N"], pinCount: 2, contactFamily1: "TP" } });
const contact = part("contact", { category: "contact", partType: "CONTACT" });
const simInserts = [{ slotId: "A1", occupiedSlotIds: simPlacement(host, "A1", insert)!, partNumber: insert.partNumber, libraryComponentId: insert.id, pins: catalogModulePins(insert) }];
const pins = flattenSimPins(simInserts);
const snapshot: RevisionDto["snapshot"] = { connectors: [
  { id: "c", reference: "J1", partNumber: host.partNumber, libraryComponentId: host.id, simInserts, pins },
  { id: "f", reference: "J2", pins: pins.map(pin => ({ ...pin, id: `A:${pin.id}` })), slots: [
    { slotId: "A", reference: "J2A", partNumber: host.partNumber, libraryComponentId: host.id, simInserts, pins },
    { slotId: "B", reference: "J2B", pins: [] }
  ] }
], paths: [], pinMappings: [], bundles: [], annotations: [] };

describe("SIM wiring integration", () => {
  it("exposes only populated insert pins and resolves their frame namespace", () => {
    const positions = buildConnectorPositionLookup(snapshot.connectors, [host]);
    expect([...positions.get("j1")!]).toEqual(["A1/P", "A1/N"]);
    expect([...positions.get("j2a")!]).toEqual(["A1/P", "A1/N"]);
    expect(verifyWirelistLocation("J1 - 1", positions).state).toBe("partial");
    expect(verifyWirelistLocation("J1 - A1/P", positions).state).toBe("valid");
    expect(resolveWirelistEndpoint("J2A - A1/P", snapshot, [host])).toEqual({ nodeId: "f", pinId: "A:A1:P", kind: "connector" });
    const cleared = { ...snapshot, connectors: [{ ...snapshot.connectors[0]!, simInserts: [], pins: [] }] };
    expect([...buildConnectorPositionLookup(cleared.connectors, [host]).get("j1")!]).toEqual([]);
    expect(resolveWirelistEndpoint("J1 - 1", cleared, [host]).pinId).toBe("");
  });

  it("uses selected inserts for module contact summaries and position-specific contact choices", () => {
    const entries = buildConnectorModuleEntries({ connectors: snapshot.connectors, connectorCatalog: [host, insert], contactCatalog: [contact], moduleContactCompat: [{ modulePartId: insert.id, contactPartId: contact.id, status: "allowed" }] });
    const standalone = entries.find(entry => entry.designator === "J1")!;
    expect(standalone.contactGroups).toEqual(["2 TP ITA"]);
    expect(standalone.pinPositions).toEqual(["A1/P", "A1/N"]);
    expect(standalone.compatibleContacts[0]?.positions).toBe("A1/P, A1/N");
    expect(entries.find(entry => entry.designator === "J2A")?.contactGroups).toEqual(["2 TP ITA"]);
    expect(verifyWirelistContact(contact.partNumber, "J2A - A1/P", snapshot.connectors, [contact], [], [{ parentPartId: insert.id, compatibleParts: [contact.partNumber], parentPositions: ["P"], status: "allowed" }]).state).toBe("valid");
    expect(verifyWirelistContact(contact.partNumber, "J2A - A1/N", snapshot.connectors, [contact], [], [{ parentPartId: insert.id, compatibleParts: [contact.partNumber], parentPositions: ["P"], status: "allowed" }]).state).toBe("invalid");
  });

  it("preserves nested insert selections through the canvas snapshot builder", () => {
    const result = buildSnapshotFromCanvas(snapshot, { connectors: snapshot.connectors, junctions: [], paths: [], positions: {} });
    expect(result.connectors[0]?.simInserts).toEqual(simInserts);
    expect(result.connectors[1]?.slots?.[0]?.simInserts).toEqual(simInserts);
  });

  it("normalizes legacy SIM host pins at both levels while retaining wirelist references", () => {
    const legacy = structuredClone(snapshot);
    legacy.connectors[0]!.simInserts = undefined;
    legacy.connectors[0]!.pins = [{ id: "1", number: "1" }];
    legacy.connectors[1]!.slots![0]!.simInserts = undefined;
    legacy.connectors[1]!.slots![0]!.pins = [{ id: "1", number: "1" }];
    legacy.connectors[1]!.pins = [{ id: "A:1", number: "1" }];
    legacy.paths = [{ id: "wire", fromConnectorId: "c", toConnectorId: "f", pathType: "wire", wirelistManaged: true, fromLocation: "J1 - 1", toLocation: "J2A - 1" }];
    legacy.pinMappings = [{ id: "mapping", pathId: "wire", fromConnectorId: "c", toConnectorId: "f", fromPinId: "1", toPinId: "A:1", mappingType: "one_to_one" }];
    expect([...buildConnectorPositionLookup(legacy.connectors, [host]).get("j1")!]).toEqual([]);
    const connectors = normalizeCanvasSimModules(legacy.connectors, [host, insert], []);
    expect(connectors[0]?.simInserts).toEqual([]);
    expect(connectors[0]?.pins).toEqual([]);
    expect(connectors[1]?.slots?.[0]?.simInserts).toEqual([]);
    expect(connectors[1]?.pins).toEqual([]);
    const result = buildSnapshotFromCanvas(legacy, { connectors, paths: [], junctions: [], positions: {} });
    expect(result.paths).toEqual(legacy.paths);
    expect(result.pinMappings).toEqual(legacy.pinMappings);
    expect(normalizeCanvasSimModules(connectors, [host, insert], [])).toBe(connectors);
  });
});
