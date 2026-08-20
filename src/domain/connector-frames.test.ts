import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlotsForFrame,
  defaultSlotReference,
  expandConnectorsForDetails,
  flattenFramePins,
  moduleMatchesFrameSide,
  modulesAllowedForFrameSlot,
  namespacedPinId,
  normalizeCatalogSide,
  parseNamespacedPinId,
  retargetSlotReferences,
  slotIdsForFrame,
  usedConnectorReferences
} from "./connector-frames.js";
import type { ConnectorSlot, SnapshotConnector } from "./types.js";

test("slotIdsForFrame prefers named ids then capacity letters", () => {
  assert.deepEqual(slotIdsForFrame({ slotIds: ["A", "B"], moduleCapacity: 4 }), ["A", "B"]);
  assert.deepEqual(slotIdsForFrame({ moduleCapacity: 2 }), ["A", "B"]);
  assert.deepEqual(slotIdsForFrame({}), []);
});

test("default slot names follow canvas reference plus slot id", () => {
  assert.equal(defaultSlotReference("J1", "A"), "J1A");
  assert.equal(namespacedPinId("A", "1"), "A:1");
  assert.deepEqual(parseNamespacedPinId("A:1"), { slotId: "A", pinId: "1" });
  assert.equal(parseNamespacedPinId("1"), null);
});

test("retargetSlotReferences only rewrites default names", () => {
  const slots: ConnectorSlot[] = [
    { slotId: "A", reference: "J1A", pins: [] },
    { slotId: "B", reference: "ITA-B", pins: [] }
  ];
  assert.deepEqual(retargetSlotReferences(slots, "J1", "J2"), [
    { slotId: "A", reference: "J2A", pins: [] },
    { slotId: "B", reference: "ITA-B", pins: [] }
  ]);
});

test("flattenFramePins namespaces populated slot pins only", () => {
  const slots: ConnectorSlot[] = [
    { slotId: "A", reference: "J1A", partNumber: "MOD-A", pins: [{ id: "1", number: "1" }] },
    { slotId: "B", reference: "J1B", pins: [{ id: "1", number: "1" }] }
  ];
  assert.deepEqual(flattenFramePins(slots), [{ id: "A:1", number: "1" }]);
});

test("modulesAllowedForFrameSlot filters by frame, slot, and allowed status", () => {
  const modules = [
    { partNumber: "510161101", category: "module", partType: "MODULE" },
    { partNumber: "510161130", category: "module", partType: "MODULE" },
    { partNumber: "510181110", category: "module", partType: "SIM_INSERT" },
    { partNumber: "OTHER", category: "module", partType: "MODULE" }
  ];
  const relationships = [
    {
      parentPartId: "frame-1",
      compatibleParts: ["510161101"],
      relationshipType: "MODULE_ALLOWED",
      parentPositions: ["A"],
      status: "allowed"
    },
    {
      parentPartId: "frame-1",
      compatibleParts: ["510161130"],
      relationshipType: "MODULE_ALLOWED",
      parentPositions: ["B"],
      status: "allowed"
    },
    {
      parentPartId: "frame-1",
      compatibleParts: ["OTHER"],
      relationshipType: "MODULE_ALLOWED",
      parentPositions: ["A"],
      status: "forbidden"
    }
  ];
  assert.deepEqual(
    modulesAllowedForFrameSlot("frame-1", "A", relationships, modules).map((mod) => mod.partNumber),
    ["510161101"]
  );
  assert.deepEqual(
    modulesAllowedForFrameSlot("frame-1", "B", relationships, modules).map((mod) => mod.partNumber),
    ["510161130"]
  );
});

test("moduleMatchesFrameSide hides opposite-side modules unless reverse compatibility is on", () => {
  assert.equal(normalizeCatalogSide(" rcv "), "RECEIVER");
  assert.equal(normalizeCatalogSide("ita"), "ITA");
  assert.equal(normalizeCatalogSide("DUAL"), "DUAL");
  assert.equal(normalizeCatalogSide(undefined), "");

  const itaFrame = { side: "ITA" };
  assert.equal(moduleMatchesFrameSide({ side: "ITA" }, itaFrame, false), true);
  assert.equal(moduleMatchesFrameSide({ side: "RECEIVER" }, itaFrame, false), false);
  assert.equal(moduleMatchesFrameSide({ side: "RCV" }, itaFrame, false), false);
  assert.equal(moduleMatchesFrameSide({ side: "DUAL" }, itaFrame, false), true);
  assert.equal(moduleMatchesFrameSide({}, itaFrame, false), true);
  // Reverse compatibility checkbox keeps everything.
  assert.equal(moduleMatchesFrameSide({ side: "RECEIVER" }, itaFrame, true), true);
  // Unknown or dual frame side cannot filter.
  assert.equal(moduleMatchesFrameSide({ side: "RECEIVER" }, {}, false), true);
  assert.equal(moduleMatchesFrameSide({ side: "RECEIVER" }, { side: "DUAL" }, false), true);
  assert.equal(moduleMatchesFrameSide({ side: "ITA" }, undefined, false), true);
});

test("empty parentPositions allows the module in every slot", () => {
  const modules = [{ partNumber: "MOD-1", category: "module", partType: "MODULE" }];
  const relationships = [
    {
      parentPartId: "frame-1",
      compatibleParts: ["MOD-1"],
      relationshipType: "MODULE_ALLOWED",
      parentPositions: [],
      status: "allowed"
    }
  ];
  assert.equal(modulesAllowedForFrameSlot("frame-1", "A", relationships, modules).length, 1);
  assert.equal(modulesAllowedForFrameSlot("frame-1", "B", relationships, modules).length, 1);
});

test("expandConnectorsForDetails lists slot modules separately", () => {
  const connectors: SnapshotConnector[] = [
    {
      id: "c1",
      reference: "J1",
      partNumber: "ITA-2",
      libraryComponentId: "frame-1",
      pins: [{ id: "A:1", number: "1" }],
      slots: [
        { slotId: "A", reference: "J1A", partNumber: "MOD-A", pins: [{ id: "1", number: "1" }] },
        { slotId: "B", reference: "J1B", pins: [] }
      ]
    },
    { id: "c2", reference: "J2", partNumber: "MDM-15P", pins: [{ id: "1", number: "1" }] }
  ];
  const expanded = expandConnectorsForDetails(connectors);
  assert.deepEqual(
    expanded.map((entry) => entry.reference),
    ["J1A", "J1B", "J2"]
  );
  assert.equal(expanded[0]?.canvasId, "c1");
  assert.equal(expanded[2]?.canvasId, "c2");
});

test("usedConnectorReferences includes canvas and slot names", () => {
  const used = usedConnectorReferences([
    {
      reference: "J1",
      slots: [
        { slotId: "A", reference: "J1A", pins: [] },
        { slotId: "B", reference: "Custom-B", pins: [] }
      ]
    }
  ]);
  assert.equal(used.has("j1"), true);
  assert.equal(used.has("j1a"), true);
  assert.equal(used.has("custom-b"), true);
});

test("buildSlotsForFrame keeps matching previous slots", () => {
  const previous: ConnectorSlot[] = [
    { slotId: "A", reference: "Keep-A", partNumber: "MOD-A", pins: [{ id: "1", number: "1" }] }
  ];
  const next = buildSlotsForFrame("J1", ["A", "B"], previous);
  assert.equal(next[0]?.reference, "Keep-A");
  assert.equal(next[0]?.partNumber, "MOD-A");
  assert.equal(next[1]?.reference, "J1B");
});
