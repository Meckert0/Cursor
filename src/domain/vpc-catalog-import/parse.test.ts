import assert from "node:assert/strict";
import test from "node:test";
import { mapWorkbookStatus, parseVpcCatalog } from "./parse.js";
import type { ContactAttributes, FrameAttributes, ModuleAttributes } from "../library.js";
import type { VpcSheetRow } from "./types.js";

function partRow(row: number, cells: Record<string, string | number | boolean | null>): VpcSheetRow {
  return { row, cells };
}

function compatRow(row: number, cells: Record<string, string | number | boolean | null>): VpcSheetRow {
  return { row, cells };
}

const baseParts: VpcSheetRow[] = [
  partRow(2, {
    part_number: "410123101",
    part_type: "ITA",
    side: "ITA",
    family: "iCon",
    description: "iCon ITA",
    electrical_mode: "NONE",
    module_capacity: "2",
    position_count: "0",
    active: "True",
    notes: "two slots",
    sim_slots: null,
    sim_slot_sections: null
  }),
  partRow(3, {
    part_number: "510161101",
    part_type: "MODULE",
    side: "ITA",
    family: "iCon",
    description: "module",
    electrical_mode: "SELECTABLE",
    module_capacity: null,
    position_count: "160",
    active: "True",
    notes: null,
    sim_slots: null,
    sim_slot_sections: null
  }),
  partRow(4, {
    part_number: "510161130",
    part_type: "MODULE",
    side: "ITA",
    family: "iCon",
    description: "SIM host",
    electrical_mode: "INSERT_HOST",
    module_capacity: null,
    position_count: "128",
    active: "True",
    notes: null,
    sim_slots: 16,
    sim_slot_sections: "A1,A2;B1,B2"
  }),
  partRow(5, {
    part_number: "510181110",
    part_type: "SIM_INSERT",
    side: "ITA",
    family: "iCon",
    description: "insert",
    electrical_mode: "SELECTABLE",
    module_capacity: null,
    position_count: "2",
    active: "True",
    notes: null,
    sim_slots: 6,
    sim_slot_sections: null
  }),
  partRow(6, {
    part_number: "610138109",
    part_type: "CONTACT",
    side: "ITA",
    family: "QuadraPaddle",
    description: "contact",
    electrical_mode: "CONTACT",
    module_capacity: null,
    position_count: "0",
    active: "True",
    notes: null,
    sim_slots: null,
    sim_slot_sections: null
  }),
  partRow(7, {
    part_number: "510160101",
    part_type: "MODULE",
    side: "RECEIVER",
    family: "iCon",
    description: "receiver module",
    electrical_mode: "SELECTABLE",
    module_capacity: null,
    position_count: "160",
    active: "True",
    notes: null,
    sim_slots: null,
    sim_slot_sections: null
  })
];

test("VPC blank modules import into Blank insert while empty SIM hosts keep their series", () => {
  const blank = partRow(90, { ...baseParts[1].cells, part_number: "BLANK-TEST", family: "ITA/RCV", description: "Blank module", position_count: 0, electrical_mode: "NONE" });
  const build = parseVpcCatalog({ parts: [blank, baseParts[2]], compatibility: [] });
  assert.equal(build.parts.find(part => part.partNumber === "BLANK-TEST")?.family, "Blank insert");
  assert.equal(build.parts.find(part => part.partNumber === "510161130")?.family, "iCon");
});

test("mapWorkbookStatus maps confirmed family to allowed and conditional to review", () => {
  assert.deepEqual(mapWorkbookStatus("CONFIRMED_FAMILY"), { status: "allowed", unknown: false });
  assert.deepEqual(mapWorkbookStatus("CONDITIONAL_CLEARANCE"), { status: "review", unknown: false });
  assert.deepEqual(mapWorkbookStatus("NOPE"), { status: "review", unknown: true });
  assert.deepEqual(mapWorkbookStatus("CONDITIONAL"), { status: "review", unknown: false });
  for (const status of ["CONFIRMED_DIRECT", "CONFIRMED_DRAWING", "REQUIRED_PER_MODULE"]) {
    assert.deepEqual(mapWorkbookStatus(status), { status: "allowed", unknown: false });
  }
});

test("accessories retain their types, fit conditions, and module-only high-power rule", () => {
  const build = parseVpcCatalog({
    parts: [
      ...baseParts,
      partRow(8, { part_number: "310113531", part_type: "STRAIN_RELIEF_PLATE", family: "i1/D1", side: "DUAL", strain_relief_integrated: false, strain_relief_type: "PLATE", max_bundle_diameter_in: "N/A" }),
      partRow(9, { part_number: "310113582", part_type: "STRAIN_RELIEF_STANDOFF_KIT", family: "iCon/i1/D1" }),
      partRow(10, { part_number: "310113794", part_type: "BACKSHELL", family: "iCon", max_bundle_diameter_in: 1.5 }),
      partRow(11, { part_number: "510109572", part_type: "HIGH_POWER_STRAIN_RELIEF_KIT", family: "iCon/i1 High Power", side: "RECEIVER" }),
      partRow(12, { part_number: "410123102-1", part_type: "ITA", family: "iCon EMI", strain_relief_integrated: true, strain_relief_type: "THREADED_STRAIGHT", max_bundle_diameter_in: 1.37, module_capacity: 2 })
    ],
    compatibility: [
      compatRow(2, { parent_part: "410123101", relationship_type: "STRAIN_RELIEF_PLATE", position_type: "FRAME_ACCESSORY", compatible_parts: "310113531", status: "CONFIRMED_DIRECT", conditions: "Standard ITA only." }),
      compatRow(3, { parent_part: "410123101", relationship_type: "STRAIN_RELIEF_STANDOFF", position_type: "FRAME_ACCESSORY", compatible_parts: "310113582", status: "CONDITIONAL", notes: "Optional.", conditions: "Use only when spacing requires it." }),
      compatRow(4, { parent_part: "510160101", relationship_type: "HIGH_POWER_STRAIN_RELIEF", position_type: "MODULE_ACCESSORY", compatible_parts: "510109572", status: "REQUIRED_PER_MODULE", conditions: "RCV side only; one kit per module." })
    ]
  });
  assert.deepEqual(build.issues, []);
  assert.deepEqual(build.unmappedColumns, { PARTS: [], COMPATIBILITY: [] });
  const plate = build.parts.find(part => part.partNumber === "310113531")!;
  assert.equal(plate.category, "strain-relief");
  assert.equal(plate.side, "DUAL");
  assert.deepEqual(plate.extraAttributes, { strainReliefIntegrated: false, strainReliefType: "PLATE" });
  const backshell = build.parts.find(part => part.partNumber === "310113794")!;
  assert.equal(backshell.category, "backshell");
  assert.equal(backshell.extraAttributes?.maxBundleDiameterIn, 1.5);
  const frame = build.parts.find(part => part.partNumber === "410123102-1")!;
  assert.equal(frame.category, "frame");
  assert.equal(frame.extraAttributes?.strainReliefIntegrated, true);
  assert.equal(frame.extraAttributes?.maxBundleDiameterIn, 1.37);
  assert.deepEqual((frame.attributes as FrameAttributes).slotIds, ["A", "B"]);
  assert.ok(!build.relationships.some(rel => rel.parentPartId === frame.id), "Variant fits must not be inferred from a base frame");
  const direct = build.relationships.find(rel => rel.relationshipType === "STRAIN_RELIEF_PLATE")!;
  assert.equal(direct.status, "allowed");
  assert.equal(direct.positionType, "FRAME_ACCESSORY");
  assert.equal(direct.extra?.conditions, "Standard ITA only.");
  const conditional = build.relationships.find(rel => rel.relationshipType === "STRAIN_RELIEF_STANDOFF")!;
  assert.equal(conditional.status, "review");
  assert.equal(conditional.notes, "Optional. | Use only when spacing requires it.");
  const highPower = build.relationships.find(rel => rel.relationshipType === "STRAIN_RELIEF_ALLOWED")!;
  assert.equal(highPower.parentPartId, "prt-module-510160101");
  assert.equal(highPower.sourceStatus, "REQUIRED_PER_MODULE");
  assert.equal(highPower.extra?.sourceRelationshipType, "HIGH_POWER_STRAIN_RELIEF");
  assert.equal(highPower.extra?.requiredPerModule, true);
});

test("parseVpcCatalog maps part types, keeps grouped compat rows, and dual-writes contacts", () => {
  const build = parseVpcCatalog({
    parts: baseParts,
    compatibility: [
      compatRow(2, {
        parent_part: "410123101",
        parent_positions: "A,B",
        relationship_type: "MODULE_ALLOWED",
        position_type: "MODULE_SLOT",
        compatible_parts: "510161101,510161130",
        quantity: null,
        removable: null,
        status: "CONFIRMED_FAMILY",
        notes: "family",
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      }),
      compatRow(3, {
        parent_part: "510161101",
        parent_positions: "A1,B1",
        relationship_type: "CONTACT_ALLOWED",
        position_type: "QUADRAPADDLE",
        compatible_parts: "610138109",
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: null,
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      }),
      compatRow(4, {
        parent_part: "610138109",
        parent_positions: null,
        relationship_type: "WIRE_COMPATIBILITY",
        position_type: "WIRE",
        compatible_parts: null,
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: null,
        wire_gauges_awg: "22,24",
        wire_cable_or_interface: "Discrete wire"
      }),
      compatRow(5, {
        parent_part: "510161101",
        parent_positions: null,
        relationship_type: "MATES_WITH",
        position_type: "MODULE",
        compatible_parts: "510160101",
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: "Primary mating module.",
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      }),
      compatRow(6, {
        parent_part: "510161130",
        parent_positions: "A1,A2",
        relationship_type: "INSERT_ALLOWED",
        position_type: "SIM_SLOT",
        compatible_parts: "510181110",
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: "section A",
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      }),
      compatRow(7, {
        parent_part: "510161130",
        parent_positions: "B1,B2",
        relationship_type: "INSERT_ALLOWED",
        position_type: "SIM_SLOT",
        compatible_parts: "510181110",
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: "section B",
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      }),
      compatRow(8, {
        parent_part: "410123101",
        parent_positions: "A,B",
        relationship_type: "MODULE_ALLOWED",
        position_type: "MODULE_SLOT",
        compatible_parts: "510161101",
        quantity: null,
        removable: null,
        status: "CONDITIONAL_CLEARANCE",
        notes: "clearance note",
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      })
    ]
  });

  const ita = build.parts.find((part) => part.partNumber === "410123101");
  assert.equal(ita?.category, "frame");
  assert.equal(ita?.partType, "ITA");
  assert.deepEqual((ita?.attributes as FrameAttributes).slotIds, ["A", "B"]);
  assert.equal((ita?.attributes as FrameAttributes).moduleCapacity, 2);

  const host = build.parts.find((part) => part.partNumber === "510161130");
  const hostAttrs = host?.attributes as ModuleAttributes;
  assert.equal(host?.partType, "MODULE");
  assert.equal(hostAttrs.simSlotCount, 16);
  assert.deepEqual(hostAttrs.simSlotSections, [["A1", "A2"], ["B1", "B2"]]);

  const insert = build.parts.find((part) => part.partNumber === "510181110");
  assert.equal(insert?.partType, "SIM_INSERT");
  assert.equal((insert?.attributes as ModuleAttributes).slotOccupancy, 6);

  const contact = build.parts.find((part) => part.partNumber === "610138109");
  const contactAttrs = contact?.attributes as ContactAttributes;
  assert.deepEqual(contactAttrs.acceptedGauges, ["22", "24"]);
  assert.equal(contactAttrs.wireInterface, "Discrete wire");
  assert.equal(contactAttrs.acceptedAwgMin, 22);
  assert.equal(contactAttrs.acceptedAwgMax, 24);
  assert.equal(contactAttrs.gender, "ITA");

  const module = build.parts.find((part) => part.partNumber === "510161101");
  assert.deepEqual((module?.attributes as ModuleAttributes).pinIds, ["A1", "B1"]);
  assert.equal((module?.attributes as ModuleAttributes).pinCount, 160);

  const allowed = build.relationships.filter((row) => row.relationshipType === "MODULE_ALLOWED");
  assert.equal(allowed.length, 2);
  const family = allowed.find((row) => row.status === "allowed");
  assert.deepEqual(family?.compatibleParts, ["510161101", "510161130"]);
  const clearance = allowed.find((row) => row.status === "review");
  assert.deepEqual(clearance?.compatibleParts, ["510161101"]);
  assert.equal(clearance?.sourceStatus, "CONDITIONAL_CLEARANCE");

  const inserts = build.relationships.filter((row) => row.relationshipType === "INSERT_ALLOWED");
  assert.equal(inserts.length, 2);
  assert.ok(inserts.every((row) => row.positionType === "SIM_SLOT"));
  assert.ok(inserts.some((row) => row.parentPositions.join(",") === "A1,A2"));
  assert.ok(inserts.some((row) => row.parentPositions.join(",") === "B1,B2"));

  const wire = build.relationships.find((row) => row.relationshipType === "WIRE_COMPATIBILITY");
  assert.deepEqual(wire?.compatibleParts, []);
  assert.deepEqual(wire?.extra?.gauges, ["22", "24"]);

  assert.equal(build.moduleContactCompat.length, 1);
  assert.equal(build.moduleContactCompat[0].contactPartId, "prt-contact-610138109");
  assert.equal(build.stats.partsByType.ITA, 1);
  assert.equal(build.unmappedColumns.PARTS.length, 0);
});

test("parseVpcCatalog records orphan children and skips unknown part types", () => {
  const build = parseVpcCatalog({
    parts: [
      partRow(2, {
        part_number: "1",
        part_type: "WIDGET",
        side: "ITA",
        family: "x",
        description: "nope",
        electrical_mode: "NONE",
        module_capacity: null,
        position_count: "0",
        active: "True",
        notes: null,
        sim_slots: null,
        sim_slot_sections: null
      }),
      ...baseParts.slice(0, 2)
    ],
    compatibility: [
      compatRow(2, {
        parent_part: "410123101",
        parent_positions: "A",
        relationship_type: "MODULE_ALLOWED",
        position_type: "MODULE_SLOT",
        compatible_parts: "999999999",
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: null,
        wire_gauges_awg: null,
        wire_cable_or_interface: null
      })
    ]
  });
  assert.ok(build.issues.some((issue) => issue.kind === "unknown-part-type"));
  assert.ok(build.issues.some((issue) => issue.kind === "orphan-child"));
  assert.equal(build.relationships.length, 0);
});

test("non-numeric gauges do not invent acceptedAwgMin/Max", () => {
  const build = parseVpcCatalog({
    parts: [baseParts[4]],
    compatibility: [
      compatRow(2, {
        parent_part: "610138109",
        parent_positions: null,
        relationship_type: "WIRE_COMPATIBILITY",
        position_type: "WIRE",
        compatible_parts: null,
        quantity: null,
        removable: null,
        status: "CONFIRMED",
        notes: null,
        wire_gauges_awg: "RG316,RG178",
        wire_cable_or_interface: null
      })
    ]
  });
  const contact = build.parts[0].attributes as ContactAttributes;
  assert.deepEqual(contact.acceptedGauges, ["RG316", "RG178"]);
  assert.equal(contact.acceptedAwgMin, undefined);
  assert.equal(contact.acceptedAwgMax, undefined);
});
