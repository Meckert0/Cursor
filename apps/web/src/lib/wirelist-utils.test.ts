import { describe, expect, it } from "vitest";
import type { RevisionDto } from "./api";
import {
  buildConnectorPositionLookup,
  buildWirelistNodeIds,
  formatWirelistLocation,
  parseConnectorPinsField,
  parseImportedWirelistRows,
  parseWirelistLocation,
  snapshotToWirelistRows,
  validateWirelistRows,
  verifyWirelistContact,
  verifyWirelistLocation,
  wirelistRowsToTemplateRecords,
  wirelistRowsToSnapshot
} from "./wirelist-utils";
import type { WirelistRow } from "./wirelist-utils";

function blankRow(overrides: Partial<WirelistRow>): WirelistRow {
  return {
    id: "p1",
    runNumber: "1",
    fromLocation: "",
    fromContact: "",
    fromSignalDescription: "",
    wireAwg: "",
    wirePartNumber: "",
    length: "",
    wireColor: "",
    wireGroup: "",
    toLocation: "",
    toContact: "",
    toSignalDescription: "",
    labelPartNumber: "",
    labelText: "",
    notes: "",
    wireName: "wire1",
    sleeving: "none",
    wireComponentId: "",
    ...overrides
  };
}

describe("wirelist-utils", () => {
  const snapshot = {
    connectors: [
      {
        id: "c1",
        reference: "J1",
        pins: [
          { id: "1", number: "1" },
          { id: "3", number: "3" },
          { id: "A1", number: "A1" }
        ]
      },
      {
        id: "c2",
        reference: "J2",
        pins: [
          { id: "1", number: "1" },
          { id: "A1", number: "A1" }
        ]
      }
    ],
    junctions: [{ id: "j1", location: { x: 20, y: 20 }, junctionType: "splice" }],
    paths: [
      {
        id: "p1",
        runNumber: 1,
        wireName: "wire1",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "wire",
        length: 10,
        fromContact: "1",
        fromSignalDescription: "SRC SIG",
        wireAwg: "22",
        wirePartNumber: "PN-22-WHT",
        wireColor: "white",
        wireGroup: "A",
        toContact: "1",
        toSignalDescription: "DST SIG",
        labelPartNumber: "LBL-001",
        labelText: "WIRE-1",
        notes: "Initial note"
      }
    ],
    pinMappings: [],
    bundles: [],
    annotations: []
  } as RevisionDto["snapshot"];

  it("maps snapshot paths to wirelist rows and back", () => {
    const rows = snapshotToWirelistRows(snapshot);
    expect(rows[0]).toMatchObject({
      id: "p1",
      runNumber: "1",
      fromLocation: "J1",
      toLocation: "J2",
      length: "10",
      wirePartNumber: "PN-22-WHT",
      sleeving: "none"
    });

    const roundTrip = wirelistRowsToSnapshot(snapshot, rows);
    expect(roundTrip.paths[0]?.wireName).toBe("wire1");
    expect(roundTrip.paths[0]?.length).toBe(10);
    expect(roundTrip.paths[0]?.fromSignalDescription).toBe("SRC SIG");
    expect(roundTrip.paths[0]?.labelText).toBe("WIRE-1");
  });

  it("does not populate wirelist rows from canvas cable sections", () => {
    const rows = snapshotToWirelistRows({
      ...snapshot,
      paths: [
        {
          id: "p-cable",
          pathType: "cable",
          fromConnectorId: "c1",
          toConnectorId: "c2"
        },
        snapshot.paths[0]
      ],
      pinMappings: []
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("p1");
  });

  it("preserves canvas cable sections when saving wirelist rows", () => {
    const baseline = {
      ...snapshot,
      paths: [
        {
          id: "p-cable",
          pathType: "cable",
          fromConnectorId: "c1",
          toConnectorId: "c2",
          length: 8
        },
        snapshot.paths[0]
      ]
    };
    const rows = snapshotToWirelistRows(baseline);
    const saved = wirelistRowsToSnapshot(baseline, rows);
    expect(saved.paths).toHaveLength(2);
    expect(saved.paths.find((path) => path.id === "p-cable")).toMatchObject({
      pathType: "cable",
      length: 8
    });
  });

  it("preserves sleeving on snapshot round-trip without exporting it", () => {
    const rows = snapshotToWirelistRows({
      ...snapshot,
      paths: [
        {
          ...snapshot.paths[0],
          sleeving: "expandable_sleeving"
        }
      ]
    });
    expect(rows[0]?.sleeving).toBe("expandable_sleeving");

    const roundTrip = wirelistRowsToSnapshot(snapshot, rows);
    expect(roundTrip.paths[0]?.sleeving).toBe("expandable_sleeving");

    const template = wirelistRowsToTemplateRecords(rows);
    expect(template[0]).not.toHaveProperty("Sleeving");
    expect(Object.keys(template[0] ?? {})).not.toContain("Sleeving");

    const imported = parseImportedWirelistRows({
      records: template,
      existingRows: rows,
      wireCatalog: []
    });
    expect(imported[0]?.sleeving).toBe("expandable_sleeving");
  });

  it("applies optional Sleeving column from legacy imports", () => {
    const existing = snapshotToWirelistRows(snapshot);
    const imported = parseImportedWirelistRows({
      records: [
        {
          "Run #": 1,
          "From Location (Conn - Pin)": "J1",
          "From Contact": "",
          "From Signal Desc": "",
          "Wire AWG": "",
          "Wire/Patchcord P/N": "PN-22-WHT",
          "Length (in)": "10",
          Sleeving: "expandable_sleeving",
          "Wire Color": "white",
          "Wire Group": "A",
          "To Location (Conn-Pin)": "J2",
          "To Contact": "",
          "To Signal Desc": "",
          "Label P/N": "",
          "Label Text": "WIRE-1",
          Notes: ""
        }
      ],
      existingRows: existing,
      wireCatalog: []
    });
    expect(imported[0]?.sleeving).toBe("expandable_sleeving");
  });

  it("validates malformed row values", () => {
    const errors = validateWirelistRows(
      [
        blankRow({
          id: "",
          runNumber: "",
          fromLocation: "missing",
          toLocation: "missing",
          length: "-4"
        })
      ],
      buildWirelistNodeIds(snapshot),
      [...snapshot.connectors]
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.includes("unknown connector"))).toBe(true);
  });

  it("parses imported records and resolves wire component ids by part number", () => {
    const rows = parseImportedWirelistRows({
      records: [
        {
          "Run #": 2,
          "From Location (Conn - Pin)": "J2 - 1",
          "From Contact": "1",
          "From Signal Desc": "IN",
          "Wire AWG": "22",
          "Wire/Patchcord P/N": "PN-22-WHT",
          "Length (in)": "4.5",
          Sleeving: "expandable_sleeving",
          "Wire Color": "white",
          "Wire Group": "B",
          "To Location (Conn-Pin)": "J1 - 1",
          "To Contact": "1",
          "To Signal Desc": "OUT",
          "Label P/N": "LBL-22",
          "Label Text": "WIRE-2",
          Notes: "Imported"
        }
      ],
      existingRows: snapshotToWirelistRows(snapshot),
      wireCatalog: [
        {
          id: "cmp-wire-22",
          category: "wire",
          family: "MIL",
          partNumber: "PN-22-WHT",
          description: "desc",
          isActive: true,
          isReviewed: true,
          stockStatus: "in_stock",
          createdByUserId: "u",
          createdAt: "2020-01-01T00:00:00.000Z",
          lastEditedByUserId: "u",
          lastEditedAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z",
          attributes: { awg: "22", color: "white" }
        }
      ]
    });
    expect(rows[0]?.wireComponentId).toBe("cmp-wire-22");
    expect(rows[0]?.wirePartNumber).toBe("PN-22-WHT");
    expect(rows[0]?.sleeving).toBe("expandable_sleeving");
    expect(rows[0]?.fromLocation).toBe("J2 - 1");
    expect(rows[0]?.toSignalDescription).toBe("OUT");
  });

  it("serializes rows into template records", () => {
    const rows = snapshotToWirelistRows(snapshot);
    const records = wirelistRowsToTemplateRecords(rows);
    expect(records[0]).toMatchObject({
      "Run #": 1,
      "From Location (Conn - Pin)": "J1",
      "Wire/Patchcord P/N": "PN-22-WHT",
      "Label Text": "WIRE-1"
    });
  });
});

describe("parseWirelistLocation / formatWirelistLocation", () => {
  it("parses connector-pin forms including hyphenated refs", () => {
    expect(parseWirelistLocation("J1-3")).toEqual({ connectorRef: "J1", pinNumber: "3" });
    expect(parseWirelistLocation("J2-A1")).toEqual({ connectorRef: "J2", pinNumber: "A1" });
    expect(parseWirelistLocation("J1 - 3")).toEqual({ connectorRef: "J1", pinNumber: "3" });
    expect(parseWirelistLocation("CONN-A - 5")).toEqual({ connectorRef: "CONN-A", pinNumber: "5" });
    expect(parseWirelistLocation("J1")).toEqual({ connectorRef: "J1", pinNumber: "" });
    expect(parseWirelistLocation("")).toEqual({ connectorRef: "", pinNumber: "" });
  });

  it("formats locations with a stable Conn - Pin separator", () => {
    expect(formatWirelistLocation("J1", "3")).toBe("J1 - 3");
    expect(formatWirelistLocation("J2", "A1")).toBe("J2 - A1");
    expect(formatWirelistLocation("J1", "")).toBe("J1");
  });
});

describe("pin mapping save/load round-trip", () => {
  const snapshot = {
    connectors: [
      {
        id: "c1",
        reference: "J1",
        pins: [
          { id: "1", number: "1" },
          { id: "3", number: "3" }
        ]
      },
      {
        id: "c2",
        reference: "J2",
        pins: [
          { id: "1", number: "1" },
          { id: "A1", number: "A1" }
        ]
      }
    ],
    junctions: [{ id: "j1", location: { x: 20, y: 20 }, junctionType: "splice" }],
    paths: [
      {
        id: "p1",
        runNumber: 1,
        wireName: "wire1",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "wire"
      }
    ],
    pinMappings: [] as Array<{
      id: string;
      pathId: string;
      fromConnectorId: string;
      fromPinId: string;
      toConnectorId: string;
      toPinId: string;
      mappingType: "one_to_one" | "one_to_many" | "loopback";
    }>,
    bundles: [],
    annotations: []
  };

  it("emits a pin mapping when both Conn-Pin ends resolve", () => {
    const rows = [
      blankRow({
        fromLocation: "J1-3",
        toLocation: "J2-A1",
        length: "12"
      })
    ];
    const next = wirelistRowsToSnapshot(snapshot, rows);
    expect(next.paths[0]).toMatchObject({
      fromConnectorId: "c1",
      toConnectorId: "c2"
    });
    expect(next.pinMappings).toEqual([
      {
        id: "pm_p1",
        pathId: "p1",
        fromConnectorId: "c1",
        fromPinId: "3",
        toConnectorId: "c2",
        toPinId: "A1",
        mappingType: "one_to_one"
      }
    ]);
  });

  it("round-trips Conn-Pin cells through save and load", () => {
    const rows = [
      blankRow({
        fromLocation: "J1-3",
        toLocation: "J2-A1"
      })
    ];
    const saved = wirelistRowsToSnapshot(snapshot, rows);
    const reloaded = snapshotToWirelistRows(saved);
    expect(reloaded[0]?.fromLocation).toBe("J1-3");
    expect(reloaded[0]?.toLocation).toBe("J2-A1");
  });

  it("preserves in-progress Conn-Pin text through save and load", () => {
    const rows = [
      blankRow({
        fromLocation: "J1 - ",
        toLocation: "J2 - 1"
      })
    ];
    const saved = wirelistRowsToSnapshot(snapshot, rows);
    expect(saved.paths[0]?.fromLocation).toBe("J1 - ");
    expect(saved.paths[0]?.wirelistManaged).toBe(true);
    const reloaded = snapshotToWirelistRows(saved);
    expect(reloaded[0]?.fromLocation).toBe("J1 - ");
    expect(reloaded[0]?.toLocation).toBe("J2 - 1");
  });

  it("keeps completely blank wirelist rows through save and load", () => {
    const saved = wirelistRowsToSnapshot(snapshot, [blankRow({})]);
    expect(saved.paths[0]?.wirelistManaged).toBe(true);
    const reloaded = snapshotToWirelistRows(saved);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.fromLocation).toBe("");
    expect(reloaded[0]?.toLocation).toBe("");
  });

  it("renders Conn-Pin from an existing pin mapping on load", () => {
    const withMapping = {
      ...snapshot,
      pinMappings: [
        {
          id: "m1",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "3",
          toConnectorId: "c2",
          toPinId: "A1",
          mappingType: "one_to_one" as const
        }
      ]
    };
    const rows = snapshotToWirelistRows(withMapping);
    expect(rows[0]?.fromLocation).toBe("J1 - 3");
    expect(rows[0]?.toLocation).toBe("J2 - A1");
  });

  it("reuses existing mapping ids and clears mappings when pins are removed", () => {
    const withMapping = {
      ...snapshot,
      pinMappings: [
        {
          id: "m-existing",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "3",
          toConnectorId: "c2",
          toPinId: "A1",
          mappingType: "one_to_one" as const
        }
      ]
    };
    const kept = wirelistRowsToSnapshot(withMapping, [
      blankRow({ fromLocation: "J1 - 3", toLocation: "J2 - A1" })
    ]);
    expect(kept.pinMappings[0]?.id).toBe("m-existing");

    const cleared = wirelistRowsToSnapshot(withMapping, [
      blankRow({ fromLocation: "J1", toLocation: "J2" })
    ]);
    expect(cleared.pinMappings).toEqual([]);
  });

  it("marks same-connector mappings as loopback", () => {
    const next = wirelistRowsToSnapshot(snapshot, [
      blankRow({ fromLocation: "J1-1", toLocation: "J1-3" })
    ]);
    expect(next.pinMappings[0]?.mappingType).toBe("loopback");
  });

  it("does not emit a pin mapping for junction endpoints", () => {
    const next = wirelistRowsToSnapshot(snapshot, [
      blankRow({ fromLocation: "J1-1", toLocation: "j1" })
    ]);
    expect(next.paths[0]?.toConnectorId).toBe("j1");
    expect(next.pinMappings).toEqual([]);
  });

  it("round-trips Conn-Pin when pins come only from the connector catalog", () => {
    const emptyPinsSnapshot = {
      ...snapshot,
      connectors: [
        { id: "c1", reference: "J1", partNumber: "CONN-A", pins: [] },
        { id: "c2", reference: "J2", partNumber: "CONN-B", pins: [] }
      ]
    };
    const catalog = [
      { partNumber: "CONN-A", attributes: { pinIds: ["1", "2"] } },
      { partNumber: "CONN-B", attributes: { pinIds: ["1", "2"] } }
    ];
    const saved = wirelistRowsToSnapshot(
      emptyPinsSnapshot,
      [blankRow({ fromLocation: "J1-1", toLocation: "J2-2" })],
      catalog
    );
    expect(saved.pinMappings).toEqual([
      {
        id: "pm_p1",
        pathId: "p1",
        fromConnectorId: "c1",
        fromPinId: "1",
        toConnectorId: "c2",
        toPinId: "2",
        mappingType: "one_to_one"
      }
    ]);
    const reloaded = snapshotToWirelistRows(saved);
    expect(reloaded[0]?.fromLocation).toBe("J1-1");
    expect(reloaded[0]?.toLocation).toBe("J2-2");
  });

  it("resolves pin positions that match pin.id when pin.number differs", () => {
    const mismatchedSnapshot = {
      ...snapshot,
      connectors: [
        {
          id: "c1",
          reference: "J1",
          pins: [{ id: "P1", number: "A" }]
        },
        {
          id: "c2",
          reference: "J2",
          pins: [{ id: "P2", number: "B" }]
        }
      ]
    };
    const saved = wirelistRowsToSnapshot(mismatchedSnapshot, [
      blankRow({ fromLocation: "J1-P1", toLocation: "J2-P2" })
    ]);
    expect(saved.pinMappings[0]).toMatchObject({
      fromPinId: "P1",
      toPinId: "P2"
    });
    const reloaded = snapshotToWirelistRows(saved);
    expect(reloaded[0]?.fromLocation).toBe("J1-P1");
    expect(reloaded[0]?.toLocation).toBe("J2-P2");
  });
});

describe("validateWirelistRows location checks", () => {
  const snapshot = {
    connectors: [
      { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }, { id: "3", number: "3" }] },
      { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
    ],
    junctions: [{ id: "j1", location: { x: 0, y: 0 } }],
    paths: [],
    pinMappings: [],
    bundles: [],
    annotations: []
  };

  it("flags unknown connectors and unknown pins", () => {
    const errors = validateWirelistRows(
      [blankRow({ fromLocation: "JX-1", toLocation: "J1-9" })],
      buildWirelistNodeIds(snapshot),
      snapshot.connectors
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Row 1: From Location references unknown connector "JX".',
        'Row 1: To Location pin "9" not found on connector J1.'
      ])
    );
  });

  it("allows known connectors without a pin and known Conn-Pin pairs", () => {
    expect(
      validateWirelistRows(
        [blankRow({ fromLocation: "J1", toLocation: "J2-1" })],
        buildWirelistNodeIds(snapshot),
        snapshot.connectors
      )
    ).toEqual([]);
  });

  it("skips location checks when includeLocationValidation is false", () => {
    expect(
      validateWirelistRows(
        [blankRow({ fromLocation: "JX-1", toLocation: "J1-9" })],
        buildWirelistNodeIds(snapshot),
        snapshot.connectors,
        [],
        null,
        { includeLocationValidation: false }
      )
    ).toEqual([]);
  });

  it("allows catalog pin positions that are missing from snapshot pins", () => {
    const connectors = [
      { id: "c1", reference: "J1", partNumber: "CONN-7", pins: [{ id: "1", number: "1" }] }
    ];
    const catalog = [{ partNumber: "CONN-7", attributes: { pinIds: ["1", "2", "3", "4", "5", "6", "7"] } }];
    expect(
      validateWirelistRows(
        [blankRow({ fromLocation: "J1-5", toLocation: "J1-7" })],
        ["c1", "J1"],
        connectors,
        catalog
      )
    ).toEqual([]);
  });
});

describe("verifyWirelistLocation", () => {
  const connectorPositions = buildConnectorPositionLookup([
    { reference: "J1", pins: [{ number: "1" }, { number: "2" }, { number: "3" }] },
    { reference: "J2", pins: [{ number: "1" }] }
  ]);

  it("marks a valid connector and position as valid", () => {
    expect(verifyWirelistLocation("J1 - 1", connectorPositions)).toEqual({
      state: "valid",
      message: null
    });
  });

  it("accepts the no-space separator form", () => {
    expect(verifyWirelistLocation("J1-2", connectorPositions).state).toBe("valid");
  });

  it("matches connector references case-insensitively", () => {
    expect(verifyWirelistLocation("j1 - 3", connectorPositions).state).toBe("valid");
  });

  it("marks a known connector with an out-of-range position as partial", () => {
    expect(verifyWirelistLocation("J1 - 9", connectorPositions)).toEqual({
      state: "partial",
      message: "Connector position not correct"
    });
  });

  it("marks a known connector with no position as partial", () => {
    expect(verifyWirelistLocation("J1", connectorPositions)).toEqual({
      state: "partial",
      message: "Connector position not correct"
    });
  });

  it("marks an unknown connector as invalid", () => {
    expect(verifyWirelistLocation("J9 - 1", connectorPositions)).toEqual({
      state: "invalid",
      message: "Connector name does not exist"
    });
  });

  it("treats empty or whitespace-only values as empty", () => {
    expect(verifyWirelistLocation("", connectorPositions)).toEqual({ state: "empty", message: null });
    expect(verifyWirelistLocation("   ", connectorPositions)).toEqual({ state: "empty", message: null });
  });
});

describe("verifyWirelistContact", () => {
  const connectors = [
    { id: "c1", reference: "J1", libraryComponentId: "mod-1" },
    { id: "c2", reference: "J2" }
  ];
  const contactCatalog = [
    { id: "cnt-1", partNumber: "CNT-1" },
    { id: "cnt-2", partNumber: "CNT-2" },
    { id: "cnt-3", partNumber: "CNT-3" }
  ];
  const moduleContactCompat = [
    { modulePartId: "mod-1", contactPartId: "cnt-1", status: "allowed" as const },
    { modulePartId: "mod-1", contactPartId: "cnt-2", status: "forbidden" as const },
    { modulePartId: "mod-1", contactPartId: "cnt-3", status: "review" as const }
  ];

  it("treats empty contact values as empty", () => {
    expect(verifyWirelistContact("", "J1 - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "empty",
      message: null
    });
  });

  it("marks an unknown contact part number as invalid", () => {
    expect(verifyWirelistContact("NOPE", "J1 - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "invalid",
      message: "Contact part number not found"
    });
  });

  it("marks a contact as partial when the connector module is not defined", () => {
    expect(verifyWirelistContact("CNT-1", "J2 - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "partial",
      message: "Connector module is not defined"
    });
  });

  it("marks a contact as partial when the location does not resolve to a connector", () => {
    expect(verifyWirelistContact("CNT-1", "JX - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "partial",
      message: "Connector module is not defined"
    });
  });

  it("marks an allowed module-contact pair as valid", () => {
    expect(verifyWirelistContact("CNT-1", "J1 - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "valid",
      message: null
    });
  });

  it("matches contact part numbers case-insensitively", () => {
    expect(verifyWirelistContact("cnt-1", "j1-1", connectors, contactCatalog, moduleContactCompat).state).toBe(
      "valid"
    );
  });

  it("marks a forbidden module-contact pair as invalid", () => {
    expect(verifyWirelistContact("CNT-2", "J1 - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "invalid",
      message: "Contact is not compatible with this module"
    });
  });

  it("marks a review module-contact pair as partial", () => {
    expect(verifyWirelistContact("CNT-3", "J1 - 1", connectors, contactCatalog, moduleContactCompat)).toEqual({
      state: "partial",
      message: "Contact compatibility requires review"
    });
  });

  it("does not shade when the catalog has no chart row", () => {
    expect(
      verifyWirelistContact("CNT-1", "J1 - 1", connectors, contactCatalog, [
        { modulePartId: "mod-other", contactPartId: "cnt-1", status: "allowed" }
      ])
    ).toEqual({ state: "empty", message: null });
  });
});

describe("parseConnectorPinsField", () => {
  it("splits comma separated lists", () => {
    expect(parseConnectorPinsField("1,2,3,4,5,6,7")).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("tolerates extra whitespace and mixed separators", () => {
    expect(parseConnectorPinsField(" 1, 2 ; 3   4 ")).toEqual(["1", "2", "3", "4"]);
  });

  it("returns an empty list for blank or missing values", () => {
    expect(parseConnectorPinsField("")).toEqual([]);
    expect(parseConnectorPinsField(null)).toEqual([]);
    expect(parseConnectorPinsField(undefined)).toEqual([]);
  });
});

describe("buildConnectorPositionLookup with connector catalog", () => {
  const connectors = [
    { reference: "J1", partNumber: "CONN-7", pins: [{ number: "1" }] },
    { reference: "J2", pins: [{ number: "1" }, { number: "2" }] }
  ];
  const connectorCatalog = [
    { partNumber: "CONN-7", attributes: { pinIds: ["1", "2", "3", "4", "5", "6", "7"] } }
  ];

  it("checks positions against module attributes.pinIds when the part matches", () => {
    const lookup = buildConnectorPositionLookup(connectors, connectorCatalog);
    expect(verifyWirelistLocation("J1 - 5", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J1 - 7", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J1 - 8", lookup)).toEqual({
      state: "partial",
      message: "Connector position not correct"
    });
  });

  it("falls back to snapshot pins when catalog has no pinIds", () => {
    const lookup = buildConnectorPositionLookup(connectors, [
      { partNumber: "CONN-7", attributes: {} }
    ]);
    expect(verifyWirelistLocation("J1 - 1", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J1 - 2", lookup).state).toBe("partial");
  });

  it("falls back to snapshot pins when no catalog entry matches", () => {
    const lookup = buildConnectorPositionLookup(connectors, connectorCatalog);
    expect(verifyWirelistLocation("J2 - 2", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J2 - 3", lookup).state).toBe("partial");
  });
});
