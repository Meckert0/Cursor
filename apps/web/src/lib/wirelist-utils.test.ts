import { describe, expect, it } from "vitest";
import {
  buildConnectorPositionLookup,
  buildWirelistNodeIds,
  formatWirelistLocation,
  parseConnectorPinsField,
  parseImportedWirelistRows,
  parseWirelistLocation,
  snapshotToWirelistRows,
  validateWirelistRows,
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
  } as const;

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

  it("round-trips sleeving through wirelist rows", () => {
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

    const updated = rows.map((row) =>
      row.id === "p1" ? { ...row, sleeving: "wire_braid_under_expandable_sleeving" as const } : row
    );
    const roundTrip = wirelistRowsToSnapshot(snapshot, updated);
    expect(roundTrip.paths[0]?.sleeving).toBe("wire_braid_under_expandable_sleeving");

    const template = wirelistRowsToTemplateRecords(updated);
    expect(template[0]?.Sleeving).toBe("wire_braid_under_expandable_sleeving");
    const imported = parseImportedWirelistRows({
      records: template,
      existingRows: rows,
      wireCatalog: []
    });
    expect(imported[0]?.sleeving).toBe("wire_braid_under_expandable_sleeving");
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
          awg: "22",
          color: "white",
          isActive: true,
          isReviewed: true,
          stockStatus: "in_stock",
          compatibilityHints: [],
          createdByUserId: "u",
          createdAt: "2020-01-01T00:00:00.000Z",
          lastEditedByUserId: "u",
          lastEditedAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z",
          customFieldValues: {}
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
    expect(reloaded[0]?.fromLocation).toBe("J1 - 3");
    expect(reloaded[0]?.toLocation).toBe("J2 - A1");
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
    { partNumber: "CONN-7", customFieldValues: { pins: "1,2,3,4,5,6,7" } }
  ];

  it("checks positions against the catalog pins field when the part matches", () => {
    const lookup = buildConnectorPositionLookup(connectors, connectorCatalog);
    expect(verifyWirelistLocation("J1 - 5", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J1 - 7", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J1 - 8", lookup)).toEqual({
      state: "partial",
      message: "Connector position not correct"
    });
  });

  it("matches the pins field key case-insensitively", () => {
    const lookup = buildConnectorPositionLookup(connectors, [
      { partNumber: "CONN-7", customFieldValues: { Pins: "1,2,3" } }
    ]);
    expect(verifyWirelistLocation("J1 - 3", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J1 - 4", lookup).state).toBe("partial");
  });

  it("falls back to snapshot pins when no catalog entry matches", () => {
    const lookup = buildConnectorPositionLookup(connectors, connectorCatalog);
    expect(verifyWirelistLocation("J2 - 2", lookup).state).toBe("valid");
    expect(verifyWirelistLocation("J2 - 3", lookup).state).toBe("partial");
  });
});
