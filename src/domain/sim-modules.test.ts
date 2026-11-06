import test from "node:test";
import assert from "node:assert/strict";
import { availableSimInserts, catalogModulePins, flattenSimPins, isSimHost, isSimInsert, simAssignmentValid, simPlacement, simSlotIds, usableSimPins, type SimRelationship } from "./sim-modules.js";
import { makePart } from "./part-test-helpers.js";
import { buildBom, createLibraryLookup } from "./bom.js";
import { validateSnapshot } from "./validator.js";
import { flattenFramePins } from "./connector-frames.js";
import { createCompatLookup } from "./compat-lookup.js";
import type { Revision, SimInsertAssignment } from "./types.js";

const host = makePart({ id: "sim-host", category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", side: "ITA", partNumber: "HOST", family: "SIM", description: "SIM host", attributes: { pinIds: [], pinCount: 128, simSlotCount: 3, simSlotSections: [["A1", "A2"], ["B1"]] } });
const pair = makePart({ id: "pair", category: "module", partType: "SIM_INSERT", side: "ITA", partNumber: "PAIR", family: "SIM", description: "Two-slot insert", attributes: { pinIds: ["P", "N"], slotOccupancy: 2 } });
const single = makePart({ id: "single", category: "module", partType: "SIM_INSERT", side: "ITA", partNumber: "SINGLE", family: "SIM", description: "One-slot insert", attributes: { pinIds: ["1"], slotOccupancy: 1 } });
const parts = [host, pair, single];
const relationships: SimRelationship[] = [{ parentPartId: host.id, relationshipType: "INSERT_ALLOWED", compatibleParts: [pair.partNumber, single.partNumber], parentPositions: [], status: "allowed" }];
function assignment(slotId: string, part = pair): SimInsertAssignment {
  return { slotId, occupiedSlotIds: simPlacement(host, slotId, part)!, libraryComponentId: part.id, partNumber: part.partNumber, pins: catalogModulePins(part) };
}
function revision(): Revision {
  const simInserts = [assignment("A1"), assignment("B1", single)];
  return { id: "r", designId: "d", revisionNumber: 1, createdBy: "u", createdAt: "2026-01-01", rulesetVersion: "rules-2026.04", libraryVersion: "lib", snapshot: { connectors: [{ id: "c", reference: "J1", libraryComponentId: host.id, partNumber: host.partNumber, simInserts, pins: flattenSimPins(simInserts) }], paths: [], pinMappings: [], bundles: [], annotations: [] } };
}
const codes = (value: Revision) => validateSnapshot(value.snapshot, { libraryLookup: createLibraryLookup(parts), partRelationships: relationships, rulesetVersion: "rules-2026.04" }).results.filter(issue => issue.code.startsWith("RULE_SIM_"));

test("SIM hosts remain modules while only SIM_INSERT parts are insert choices", () => {
  assert.equal(isSimHost(host), true);
  assert.equal(isSimHost(pair), false);
  assert.equal(isSimHost({ ...host, category: "frame" }), false);
  assert.equal(isSimInsert(pair), true);
  assert.equal(isSimInsert(host), false);
  assert.deepEqual(simSlotIds(host), ["A1", "A2", "B1"]);
  assert.deepEqual(simSlotIds({ ...host, attributes: { simSlotCount: 2 } }), ["1", "2"]);
});

test("multi-slot inserts stay within a section and cannot overlap occupied slots", () => {
  const selected = [assignment("A1")];
  assert.deepEqual(simPlacement(host, "A1", pair), ["A1", "A2"]);
  assert.equal(simPlacement(host, "A2", pair), null);
  assert.equal(simPlacement(host, "B1", pair), null);
  assert.deepEqual(availableSimInserts(host, "A2", selected, parts, relationships), []);
  assert.deepEqual(availableSimInserts(host, "A1", selected, parts, relationships).map(part => part.id), ["pair", "single"]);
  assert.equal(simAssignmentValid(host, { ...selected[0]!, occupiedSlotIds: ["A1"] }, selected, parts, relationships), false);
});

test("insert choices honor side, position rules, review status and explicit prohibitions", () => {
  const opposite = { ...single, id: "opposite", side: "RECEIVER" };
  assert.deepEqual(availableSimInserts(host, "B1", [], [opposite], relationships), []);
  assert.deepEqual(availableSimInserts(host, "B1", [], [single], [{ ...relationships[0]!, status: "review" }]), []);
  assert.deepEqual(availableSimInserts(host, "B1", [], [single], [{ ...relationships[0]!, parentPositions: ["A1"] }]), []);
  assert.deepEqual(availableSimInserts(host, "B1", [], [single], [...relationships, { ...relationships[0]!, status: "forbidden", parentPositions: ["B1"] }]), []);
});

test("selected inserts determine usable pins instead of the host nominal pin count", () => {
  const value = revision();
  assert.deepEqual(value.snapshot.connectors[0]!.pins.map(pin => pin.id), ["A1:P", "A1:N", "B1:1"]);
  assert.deepEqual(value.snapshot.connectors[0]!.pins.map(pin => pin.number), ["A1/P", "A1/N", "B1/1"]);
  assert.deepEqual(codes(value), []);
  assert.deepEqual(usableSimPins(host, [], parts, relationships), []);
});

test("validation flags incomplete, incompatible, overlapping and forged insert configurations", () => {
  const incomplete = revision();
  incomplete.snapshot.connectors[0]!.simInserts = [];
  incomplete.snapshot.connectors[0]!.pins = [];
  assert.ok(codes(incomplete).some(issue => issue.code === "RULE_SIM_INSERT_INCOMPLETE"));
  const overlap = revision();
  overlap.snapshot.connectors[0]!.simInserts!.push(assignment("A2", single));
  assert.ok(codes(overlap).some(issue => issue.code === "RULE_SIM_INSERT_INVALID"));
  const forged = revision();
  forged.snapshot.connectors[0]!.simInserts![0]!.pins.push({ id: "FAKE", number: "FAKE" });
  assert.ok(codes(forged).some(issue => issue.code === "RULE_SIM_INSERT_PINS"));
  const changedHost = { ...host, id: "changed", partNumber: "CHANGED", attributes: { simSlotCount: 1, simSlotSections: [["C1"]] } };
  const retained = revision().snapshot.connectors[0]!.simInserts!;
  assert.equal(simAssignmentValid(changedHost, retained[0]!, retained, parts, relationships), false);
  assert.deepEqual(usableSimPins(changedHost, retained, parts, relationships), []);
  const duplicated = revision();
  duplicated.snapshot.connectors[0]!.simInserts!.push(assignment("A1"));
  assert.ok(codes(duplicated).some(issue => issue.code === "RULE_SIM_INSERT_INVALID"));
  assert.deepEqual(usableSimPins(host, [assignment("A1"), assignment("A1")], parts, relationships), []);
  const misplaced = revision();
  misplaced.snapshot.connectors[0] = { id: "c", reference: "J1", partNumber: pair.partNumber, libraryComponentId: pair.id, pins: catalogModulePins(pair) };
  assert.ok(codes(misplaced).some(issue => issue.code === "RULE_SIM_INSERT_INVALID"));
});

test("frame-contained SIM modules validate and each physical insert is counted once in the BOM", () => {
  const value = revision();
  const module = value.snapshot.connectors[0]!;
  const frame = makePart({ id: "frame", category: "frame", partType: "ITA", partNumber: "FRAME", family: "iCon", description: "Housing", attributes: { moduleCapacity: 1, slotIds: ["A"] } });
  const slots = [{ ...module, slotId: "A", reference: "J2" }];
  value.snapshot.connectors.push({ id: "f", reference: "J2", libraryComponentId: frame.id, partNumber: frame.partNumber, slots, pins: flattenFramePins(slots) });
  const lookup = createLibraryLookup([...parts, frame]);
  const report = validateSnapshot(value.snapshot, { libraryLookup: lookup, partRelationships: [...relationships, { parentPartId: frame.id, relationshipType: "MODULE_ALLOWED", parentPositions: ["A"], compatibleParts: [host.partNumber], status: "allowed" }], rulesetVersion: "rules-2026.04" });
  assert.deepEqual(report.results.filter(issue => issue.code.startsWith("RULE_SIM_")), []);
  const bom = buildBom(value, lookup);
  assert.equal(bom.lines.find(line => line.partNumber === pair.partNumber)?.quantity, 2);
  assert.equal(bom.lines.find(line => line.partNumber === single.partNumber)?.quantity, 2);
  assert.deepEqual(bom.lines.find(line => line.partNumber === pair.partNumber)?.designRefs, ["J1 / SIM A1", "J2 / SIM A1"]);
});

test("contact compatibility resolves the insert and its local pin rather than the host", () => {
  const value = revision();
  const contact = makePart({ id: "sim-contact", category: "contact", partNumber: "CONTACT", family: "TP", description: "Contact", attributes: { acceptedFamilies: [] } });
  value.snapshot.connectors.push({ ...value.snapshot.connectors[0]!, id: "c2", reference: "J2" });
  value.snapshot.paths = [{ id: "wire", fromConnectorId: "c", toConnectorId: "c2", pathType: "wire", fromContact: contact.partNumber }];
  value.snapshot.pinMappings = [{ id: "mapping", pathId: "wire", fromConnectorId: "c", toConnectorId: "c2", fromPinId: "A1:P", toPinId: "A1:N", mappingType: "one_to_one" }];
  const options = { libraryLookup: createLibraryLookup([...parts, contact]), compatLookup: createCompatLookup({}), partRelationships: [...relationships, { parentPartId: pair.id, relationshipType: "CONTACT_ALLOWED", parentPositions: ["P"], compatibleParts: [contact.partNumber], status: "allowed" }], rulesetVersion: "rules-2026.04" };
  assert.deepEqual(validateSnapshot(value.snapshot, options).results.filter(issue => issue.code === "RULE_COMPAT_MODULE_CONTACT"), []);
  value.snapshot.pinMappings[0]!.fromPinId = "A1:N";
  assert.ok(validateSnapshot(value.snapshot, options).results.some(issue => issue.code === "RULE_COMPAT_MODULE_CONTACT"));
});
