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

test("mapWorkbookStatus maps confirmed family to allowed and conditional to review", () => {
  assert.deepEqual(mapWorkbookStatus("CONFIRMED_FAMILY"), { status: "allowed", unknown: false });
  assert.deepEqual(mapWorkbookStatus("CONDITIONAL_CLEARANCE"), { status: "review", unknown: false });
  assert.deepEqual(mapWorkbookStatus("NOPE"), { status: "review", unknown: true });
});

test("parseVpcCatalog maps part types, explodes compat, and dual-writes contacts", () => {
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
  const clearance = allowed.find((row) => row.childPartId === "prt-module-510161101");
  assert.equal(clearance?.status, "review");
  assert.equal(clearance?.sourceStatus, "CONDITIONAL_CLEARANCE");

  const inserts = build.relationships.filter((row) => row.relationshipType === "INSERT_ALLOWED");
  assert.equal(inserts.length, 2);
  assert.ok(inserts.some((row) => row.positionType === "SIM_SLOT:A"));
  assert.ok(inserts.some((row) => row.positionType === "SIM_SLOT:B"));

  const wire = build.relationships.find((row) => row.relationshipType === "WIRE_COMPATIBILITY");
  assert.equal(wire?.childPartId, undefined);
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
