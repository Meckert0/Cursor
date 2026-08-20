import test from "node:test";
import assert from "node:assert/strict";
import { buildBom, createLibraryLookup } from "./bom.js";
import { makePart } from "./part-test-helpers.js";
import type { Revision } from "./types.js";

function fullyAccessorizedRevision(): Revision {
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
          backshellPartNumber: "BS-EMI-15",
          backshellLibraryComponentId: "cmp-backshell-15",
          strainReliefPartNumber: "SR-CLAMP-15",
          strainReliefLibraryComponentId: "cmp-sr-15",
          pins: [{ id: "1", number: "1" }]
        },
        {
          id: "c2",
          reference: "J2",
          partNumber: "MDM-15P",
          libraryComponentId: "cmp-module-001",
          backshellPartNumber: "BS-EMI-15",
          backshellLibraryComponentId: "cmp-backshell-15",
          strainReliefPartNumber: "SR-CLAMP-15",
          strainReliefLibraryComponentId: "cmp-sr-15",
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
          wireAwg: "22",
          wireColor: "white",
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
          wirePartNumber: "M22759/16-22",
          wireAwg: "22",
          wireColor: "white"
        }
      ],
      pinMappings: [],
      bundles: [],
      annotations: []
    }
  };
}

function fullLibrary() {
  return createLibraryLookup([
    makePart({
      id: "cmp-module-001",
      category: "module",
      family: "Micro-D",
      partNumber: "MDM-15P",
      description: "15-pin module",
      attributes: { pinIds: [] }
    }),
    makePart({
      id: "cmp-wire-001",
      category: "wire",
      family: "MIL-W-22759",
      partNumber: "M22759/16-22",
      description: "22 AWG PTFE wire, white",
      attributes: { awg: "22", color: "white" }
    }),
    makePart({
      id: "cmp-label-001",
      category: "label",
      family: "Heatshrink",
      partNumber: "LBL-22",
      description: "Wire label"
    }),
    makePart({
      id: "cmp-contact-001",
      category: "contact",
      family: "Micro-D",
      partNumber: "CNT-22",
      description: "Crimp contact",
      attributes: { acceptedFamilies: [] }
    }),
    makePart({
      id: "cmp-backshell-15",
      category: "backshell",
      family: "EMI",
      partNumber: "BS-EMI-15",
      description: "EMI backshell for 15-pin Micro-D"
    }),
    makePart({
      id: "cmp-sr-15",
      category: "strain-relief",
      family: "Clamp",
      partNumber: "SR-CLAMP-15",
      description: "Strain-relief clamp for 15-pin Micro-D"
    }),
    makePart({
      id: "cmp-sleeve-exp",
      category: "sleeve-tube-braid",
      family: "expandable_sleeving",
      partNumber: "SLV-EXP-025",
      description: "Expandable PET sleeving, 0.25 in"
    })
  ]);
}

test("buildBom aggregates a fully accessorized cable with every line type resolved", () => {
  const bom = buildBom(fullyAccessorizedRevision(), fullLibrary());
  assert.equal(bom.summary.unresolved, 0);
  assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MDM-15P" && line.quantity === 2));
  assert.ok(bom.lines.some((line) => line.category === "backshell" && line.partNumber === "BS-EMI-15" && line.quantity === 2));
  assert.ok(
    bom.lines.some((line) => line.category === "strain-relief" && line.partNumber === "SR-CLAMP-15" && line.quantity === 2)
  );
  const wireLine = bom.lines.find((line) => line.category === "wire" && line.partNumber === "M22759/16-22");
  assert.ok(wireLine);
  assert.equal(wireLine?.quantity, 20);
  assert.equal(wireLine?.unit, "in");
  assert.equal(wireLine?.awg, "22");
  assert.equal(wireLine?.color, "white");
  assert.match(wireLine?.notes ?? "", /22 AWG/);
  assert.match(wireLine?.notes ?? "", /white/i);
  assert.ok(bom.lines.some((line) => line.category === "label" && line.partNumber === "LBL-22" && line.quantity === 1));
  assert.ok(bom.lines.some((line) => line.category === "contact" && line.partNumber === "CNT-22" && line.quantity === 2));
  assert.ok(
    bom.lines.some(
      (line) => line.category === "sleeve-tube-braid" && line.partNumber === "SLV-EXP-025" && line.quantity === 12
    )
  );
});

test("buildBom marks missing library parts as not_found", () => {
  const revision = fullyAccessorizedRevision();
  revision.snapshot.connectors[0] = {
    ...revision.snapshot.connectors[0],
    partNumber: "MISSING-CONN",
    libraryComponentId: undefined,
    backshellPartNumber: undefined,
    backshellLibraryComponentId: undefined,
    strainReliefPartNumber: undefined,
    strainReliefLibraryComponentId: undefined
  };
  revision.snapshot.connectors[1] = {
    ...revision.snapshot.connectors[1],
    backshellPartNumber: undefined,
    backshellLibraryComponentId: undefined,
    strainReliefPartNumber: undefined,
    strainReliefLibraryComponentId: undefined
  };
  revision.snapshot.paths[0] = {
    ...revision.snapshot.paths[0],
    wirePartNumber: "MISSING-WIRE",
    wireComponentId: undefined,
    sleeving: "none",
    fromContact: undefined,
    toContact: undefined,
    labelPartNumber: undefined
  };
  revision.snapshot.paths[1] = {
    ...revision.snapshot.paths[1],
    wirePartNumber: undefined,
    wireComponentId: undefined
  };

  const bom = buildBom(revision, createLibraryLookup([]));
  assert.ok(bom.lines.some((line) => line.partNumber === "MISSING-CONN" && line.resolution === "not_found"));
  assert.ok(bom.lines.some((line) => line.partNumber === "MISSING-WIRE" && line.resolution === "not_found"));
  assert.ok(bom.summary.unresolved > 0);
});

test("buildBom counts wire as ea when length is missing", () => {
  const revision = fullyAccessorizedRevision();
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
    makePart({
      id: "cmp-wire-001",
      category: "wire",
      family: "MIL-W-22759",
      partNumber: "M22759/16-22",
      description: "wire",
      attributes: { awg: "22", color: "white" }
    }),
    makePart({
      id: "cmp-module-001",
      category: "module",
      family: "Micro-D",
      partNumber: "MDM-15P",
      description: "module",
      attributes: { pinIds: [] }
    }),
    makePart({
      id: "cmp-backshell-15",
      category: "backshell",
      family: "EMI",
      partNumber: "BS-EMI-15",
      description: "backshell"
    }),
    makePart({
      id: "cmp-sr-15",
      category: "strain-relief",
      family: "Clamp",
      partNumber: "SR-CLAMP-15",
      description: "strain relief"
    })
  ]);
  const bom = buildBom(revision, lookup);
  const wireLine = bom.lines.find((line) => line.category === "wire");
  assert.equal(wireLine?.unit, "ea");
  assert.equal(wireLine?.quantity, 1);
  assert.match(wireLine?.notes ?? "", /length missing/i);
  assert.equal(wireLine?.awg, "22");
  assert.equal(wireLine?.color, "white");
});

test("buildBom resolves contact alias code to canonical part", () => {
  const revision = fullyAccessorizedRevision();
  revision.snapshot.connectors = revision.snapshot.connectors.map((connector) => ({
    ...connector,
    backshellPartNumber: undefined,
    backshellLibraryComponentId: undefined,
    strainReliefPartNumber: undefined,
    strainReliefLibraryComponentId: undefined
  }));
  revision.snapshot.paths = [
    {
      id: "p1",
      runNumber: 1,
      fromConnectorId: "c1",
      toConnectorId: "c2",
      pathType: "wire",
      length: 12,
      wireComponentId: "cmp-wire-001",
      wirePartNumber: "M22759/16-22",
      fromContact: "101",
      toContact: "101"
    }
  ];

  const lookup = createLibraryLookup(
    [
      makePart({
        id: "cmp-module-001",
        category: "module",
        family: "Micro-D",
        partNumber: "MDM-15P",
        description: "module",
        attributes: { pinIds: [] }
      }),
      makePart({
        id: "cmp-wire-001",
        category: "wire",
        family: "MIL-W-22759",
        partNumber: "M22759/16-22",
        description: "wire",
        attributes: { awg: "22", color: "white" }
      }),
      makePart({
        id: "cmp-contact-001",
        category: "contact",
        family: "Micro-D",
        partNumber: "CNT-22",
        description: "Crimp contact",
        attributes: { acceptedFamilies: [] }
      })
    ],
    [{ partId: "cmp-contact-001", codeSystem: "contact_3digit", code: "101" }]
  );

  const bom = buildBom(revision, lookup);
  const contactLine = bom.lines.find((line) => line.category === "contact");
  assert.ok(contactLine);
  assert.equal(contactLine?.partNumber, "CNT-22");
  assert.equal(contactLine?.libraryComponentId, "cmp-contact-001");
  assert.equal(contactLine?.resolution, "resolved");
  assert.equal(contactLine?.quantity, 2);
});

test("buildBom falls back to enum sleeving label when no library mapping exists", () => {
  const revision = fullyAccessorizedRevision();
  revision.snapshot.connectors = revision.snapshot.connectors.map((connector) => ({
    ...connector,
    backshellPartNumber: undefined,
    backshellLibraryComponentId: undefined,
    strainReliefPartNumber: undefined,
    strainReliefLibraryComponentId: undefined
  }));
  revision.snapshot.paths = [
    {
      id: "p1",
      runNumber: 1,
      fromConnectorId: "c1",
      toConnectorId: "c2",
      pathType: "wire",
      length: 10,
      sleeving: "expandable_sleeving",
      wirePartNumber: "M22759/16-22",
      wireComponentId: "cmp-wire-001"
    }
  ];
  const bom = buildBom(
    revision,
    createLibraryLookup([
      makePart({
        id: "cmp-module-001",
        category: "module",
        family: "Micro-D",
        partNumber: "MDM-15P",
        description: "module",
        attributes: { pinIds: [] }
      }),
      makePart({
        id: "cmp-wire-001",
        category: "wire",
        family: "MIL-W-22759",
        partNumber: "M22759/16-22",
        description: "wire",
        attributes: { awg: "22", color: "white" }
      })
    ])
  );
  const sleevingLine = bom.lines.find((line) => line.category === "sleeving");
  assert.ok(sleevingLine);
  assert.equal(sleevingLine?.partNumber, "expandable_sleeving");
  assert.equal(sleevingLine?.resolution, "not_found");
});

test("buildBom emits a frame housing plus each populated slot module", () => {
  const revision = fullyAccessorizedRevision();
  revision.snapshot.connectors = [
    {
      id: "c1",
      reference: "J1",
      partNumber: "ITA-2SLOT",
      libraryComponentId: "cmp-frame-001",
      pins: [
        { id: "A:1", number: "1" },
        { id: "B:1", number: "1" }
      ],
      slots: [
        {
          slotId: "A",
          reference: "J1A",
          partNumber: "MOD-A",
          libraryComponentId: "cmp-mod-a",
          pins: [{ id: "1", number: "1" }],
          backshellPartNumber: "BS-EMI-15",
          backshellLibraryComponentId: "cmp-backshell-15"
        },
        {
          slotId: "B",
          reference: "J1B",
          partNumber: "MOD-B",
          libraryComponentId: "cmp-mod-b",
          pins: [{ id: "1", number: "1" }]
        }
      ]
    },
    {
      id: "c2",
      reference: "J2",
      partNumber: "MDM-15P",
      libraryComponentId: "cmp-module-001",
      pins: [{ id: "1", number: "1" }]
    }
  ];
  revision.snapshot.paths = [];
  const lookup = createLibraryLookup([
    makePart({
      id: "cmp-frame-001",
      category: "frame",
      family: "iCon",
      partNumber: "ITA-2SLOT",
      description: "Two-slot ITA",
      partType: "ITA",
      attributes: { moduleCapacity: 2, slotIds: ["A", "B"] }
    }),
    makePart({
      id: "cmp-mod-a",
      category: "module",
      family: "iCon",
      partNumber: "MOD-A",
      description: "Slot A module",
      attributes: { pinIds: ["1"] }
    }),
    makePart({
      id: "cmp-mod-b",
      category: "module",
      family: "iCon",
      partNumber: "MOD-B",
      description: "Slot B module",
      attributes: { pinIds: ["1"] }
    }),
    makePart({
      id: "cmp-module-001",
      category: "module",
      family: "Micro-D",
      partNumber: "MDM-15P",
      description: "module",
      attributes: { pinIds: [] }
    }),
    makePart({
      id: "cmp-backshell-15",
      category: "backshell",
      family: "EMI",
      partNumber: "BS-EMI-15",
      description: "backshell"
    })
  ]);
  const bom = buildBom(revision, lookup);
  assert.ok(bom.lines.some((line) => line.category === "frame" && line.partNumber === "ITA-2SLOT"));
  assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MOD-A" && line.designRefs.includes("J1A")));
  assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MOD-B" && line.designRefs.includes("J1B")));
  assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MDM-15P"));
  assert.ok(bom.lines.some((line) => line.category === "backshell" && line.designRefs.includes("J1A")));
});

