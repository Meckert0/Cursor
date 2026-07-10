import test from "node:test";
import assert from "node:assert/strict";
import { buildBom, createLibraryLookup } from "./bom.js";
import type { LibraryComponentRecord } from "./library.js";
import type { Revision } from "./types.js";

function component(partial: Partial<LibraryComponentRecord> & Pick<LibraryComponentRecord, "id" | "category" | "partNumber">): LibraryComponentRecord {
  return {
    family: partial.family ?? "Test",
    description: partial.description ?? `${partial.partNumber} description`,
    isActive: partial.isActive ?? true,
    isReviewed: partial.isReviewed ?? true,
    stockStatus: partial.stockStatus ?? "in_stock",
    compatibilityHints: partial.compatibilityHints ?? [],
    createdByUserId: "seed",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastEditedByUserId: "seed",
    lastEditedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    customFieldValues: {},
    ...partial
  };
}

function baseRevision(): Revision {
  return {
    id: "rev-1",
    designId: "design-1",
    revisionNumber: 1,
    createdBy: "user-a",
    createdAt: "2026-01-01T00:00:00.000Z",
    rulesetVersion: "rules-2026.03",
    libraryVersion: "lib-2026.03.1",
    snapshot: {
      connectors: [
        {
          id: "c1",
          reference: "J1",
          partNumber: "MDM-15P",
          libraryComponentId: "cmp-module-001",
          pins: [{ id: "1", number: "1" }]
        },
        {
          id: "c2",
          reference: "J2",
          partNumber: "MDM-15P",
          libraryComponentId: "cmp-module-001",
          pins: [{ id: "1", number: "1" }]
        }
      ],
      paths: [
        {
          id: "p1",
          runNumber: 1,
          fromConnectorId: "c1",
          toConnectorId: "c2",
          pathType: "wire",
          length: 12,
          sleeving: "expandable_sleeving",
          wireComponentId: "cmp-wire-001",
          wirePartNumber: "M22759/16-22",
          fromContact: "CNT-22",
          toContact: "CNT-22",
          labelPartNumber: "LBL-22"
        },
        {
          id: "p2",
          runNumber: 2,
          fromConnectorId: "c1",
          toConnectorId: "c2",
          pathType: "wire",
          length: 8,
          wireComponentId: "cmp-wire-001",
          wirePartNumber: "M22759/16-22"
        }
      ],
      pinMappings: [],
      bundles: [],
      annotations: []
    }
  };
}

test("buildBom aggregates connectors, wire length, labels, contacts, and sleeving", () => {
  const lookup = createLibraryLookup([
    component({
      id: "cmp-module-001",
      category: "module",
      partNumber: "MDM-15P",
      description: "15-pin module"
    }),
    component({
      id: "cmp-wire-001",
      category: "wire",
      partNumber: "M22759/16-22",
      description: "22 AWG wire",
      awg: "22",
      color: "white"
    }),
    component({
      id: "cmp-label-001",
      category: "label",
      partNumber: "LBL-22",
      description: "Wire label"
    }),
    component({
      id: "cmp-contact-001",
      category: "contact",
      partNumber: "CNT-22",
      description: "Crimp contact"
    })
  ]);

  const bom = buildBom(baseRevision(), lookup);
  assert.equal(bom.summary.unresolved, 0);
  assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MDM-15P" && line.quantity === 2));
  const wireLine = bom.lines.find((line) => line.category === "wire" && line.partNumber === "M22759/16-22");
  assert.ok(wireLine);
  assert.equal(wireLine?.quantity, 20);
  assert.equal(wireLine?.unit, "in");
  assert.ok(bom.lines.some((line) => line.category === "label" && line.partNumber === "LBL-22" && line.quantity === 1));
  assert.ok(bom.lines.some((line) => line.category === "contact" && line.partNumber === "CNT-22" && line.quantity === 2));
  assert.ok(bom.lines.some((line) => line.category === "sleeving" && line.partNumber === "expandable_sleeving" && line.quantity === 12));
});

test("buildBom marks missing library parts as not_found", () => {
  const revision = baseRevision();
  revision.snapshot.connectors[0] = {
    ...revision.snapshot.connectors[0],
    partNumber: "MISSING-CONN",
    libraryComponentId: undefined
  };
  revision.snapshot.paths[0] = {
    ...revision.snapshot.paths[0],
    wirePartNumber: "MISSING-WIRE",
    wireComponentId: undefined
  };

  const bom = buildBom(revision, createLibraryLookup([]));
  assert.ok(bom.lines.some((line) => line.partNumber === "MISSING-CONN" && line.resolution === "not_found"));
  assert.ok(bom.lines.some((line) => line.partNumber === "MISSING-WIRE" && line.resolution === "not_found"));
  assert.ok(bom.summary.unresolved > 0);
});

test("buildBom counts wire as ea when length is missing", () => {
  const revision = baseRevision();
  revision.snapshot.paths = [
    {
      id: "p1",
      runNumber: 1,
      fromConnectorId: "c1",
      toConnectorId: "c2",
      pathType: "wire",
      wirePartNumber: "M22759/16-22",
      wireComponentId: "cmp-wire-001"
    }
  ];
  const lookup = createLibraryLookup([
    component({ id: "cmp-wire-001", category: "wire", partNumber: "M22759/16-22", awg: "22", color: "white" }),
    component({ id: "cmp-module-001", category: "module", partNumber: "MDM-15P" })
  ]);
  const bom = buildBom(revision, lookup);
  const wireLine = bom.lines.find((line) => line.category === "wire");
  assert.equal(wireLine?.unit, "ea");
  assert.equal(wireLine?.quantity, 1);
  assert.match(wireLine?.notes ?? "", /length missing/i);
});
