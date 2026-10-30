import { beforeEach, describe, expect, it } from "vitest";
import type { RevisionDto } from "./api";
import {
  buildColumnsCounted,
  formatWireCutLabel,
  isPatchcordPartNumber,
  isPreterminatedContactMarker,
  parseNotesItems
} from "./wirelist-columns-counted";
import type { WirelistRow } from "./wirelist-utils";

let rowCounter = 0;

beforeEach(() => {
  rowCounter = 0;
});

function row(overrides: Partial<WirelistRow>): WirelistRow {
  rowCounter += 1;
  return {
    id: `p_wire_${rowCounter}`,
    runNumber: String(rowCounter),
    fromLocation: "J1 - 1",
    fromContact: "",
    fromSignalDescription: "",
    wireAwg: "",
    wirePartNumber: "",
    length: "",
    wireColor: "",
    wireGroup: "",
    toLocation: "J2 - 1",
    toContact: "",
    toSignalDescription: "",
    labelPartNumber: "",
    labelText: "",
    notes: "",
    wireName: `wire${rowCounter}`,
    wireComponentId: "",
    sleeving: "none",
    ...overrides
  };
}

function items(list: Array<{ value: string; qty: number }>): Array<[string, number]> {
  return list.map((entry) => [entry.value, entry.qty]);
}

describe("buildColumnsCounted contacts", () => {
  it("counts From and To contacts together, skips - and ↑, and keeps W/CBL out of the parts list", () => {
    const counted = buildColumnsCounted([
      row({ fromContact: "100", toContact: "200" }),
      row({ fromContact: "100", toContact: "100" }),
      row({ fromContact: "-", toContact: "↑" }),
      row({ fromContact: "W/CBL", toContact: "300", wirePartNumber: "CBL-1" }),
      row({ fromContact: "w/ cbl", toContact: "WCBL", wirePartNumber: "CBL-1" })
    ]);

    expect(items(counted.bomContacts)).toEqual([
      ["100", 3],
      ["200", 1],
      ["300", 1]
    ]);
    expect(counted.preterminatedEnds).toBe(3);
    expect(counted.bomContacts.find((entry) => entry.value === "100")?.sources).toEqual(["1", "2"]);
  });

  it("moves contacts written in parentheses to Non-BOM items", () => {
    const counted = buildColumnsCounted([
      row({ fromContact: "(100)", toContact: "100" }),
      row({ fromContact: "(100)", toContact: "(CUST 55)" })
    ]);

    expect(items(counted.nonBomItems)).toEqual([
      ["(100)", 2],
      ["(CUST 55)", 1]
    ]);
    expect(items(counted.bomContacts)).toEqual([["100", 1]]);
  });

  it("treats trimmed, case-insensitive values as the same part", () => {
    const counted = buildColumnsCounted([
      row({ fromContact: "abc-1 " }),
      row({ fromContact: "ABC-1" })
    ]);
    expect(items(counted.bomContacts)).toEqual([["abc-1", 2]]);
  });
});

describe("buildColumnsCounted wire and patchcords", () => {
  it("splits patchcords from wire by prefix and counts them each regardless of length", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "7-1001", length: "36" }),
      row({ wirePartNumber: "7-1001", length: "48" }),
      row({ wirePartNumber: "P-22", length: "" }),
      row({ wirePartNumber: "710123", length: "12" }),
      row({ wirePartNumber: "720555", length: "12" }),
      row({ wirePartNumber: "7-1001 (HALF)", length: "36" }),
      row({ wirePartNumber: "WIRE-A", length: "12" })
    ]);

    expect(items(counted.patchcords)).toEqual([
      ["7-1001", 2],
      ["7-1001 (HALF)", 0.5],
      ["710123", 1],
      ["720555", 1],
      ["P-22", 1]
    ]);
    expect(counted.patchcords.every((entry) => entry.unit === "ea")).toBe(true);
    expect(counted.wires.map((line) => line.partNumber)).toEqual(["WIRE-A"]);
    expect(isPatchcordPartNumber("(7-1001)")).toBe(true);
    expect(isPatchcordPartNumber("p-1")).toBe(true);
    expect(isPatchcordPartNumber("71")).toBe(false);
  });

  it("builds a cut list per length and totals bulk wire in feet across every length", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "W1", length: "10" }),
      row({ wirePartNumber: "W1", length: "20" }),
      row({ wirePartNumber: "W1", length: "30" }),
      row({ wirePartNumber: "W1", length: "10" }),
      row({ wirePartNumber: "A0", length: "6" })
    ]);

    expect(
      counted.wires.map((line) => [formatWireCutLabel(line), line.count, line.groupTotal, line.unit, line.firstInGroup])
    ).toEqual([
      ['A0 @6"', 1, 0.5, "ft", true],
      ['W1 @10"', 2, 5.8333, "ft", true],
      ['W1 @20"', 1, 5.8333, "ft", false],
      ['W1 @30"', 1, 5.8333, "ft", false]
    ]);
    expect(counted.wires[1].sources).toEqual(["1", "4"]);
  });

  it("counts W/CBL rows each, halves (HALF) rows, and keeps the (HALF) line separate like the script", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "CBL-9", length: "120", fromContact: "W/CBL", toContact: "W/CBL" }),
      row({ wirePartNumber: "CBL-9", length: "120", fromContact: "W/CBL", toContact: "W/CBL" }),
      row({ wirePartNumber: "CBL-9 (HALF)", length: "60", fromContact: "W/CBL", toContact: "55" }),
      row({ wirePartNumber: "CBL-9 (HALF)", length: "60", fromContact: "W/CBL", toContact: "55" }),
      row({ wirePartNumber: "CBL-9 (HALF)", length: "48", fromContact: "W/CBL", toContact: "55" })
    ]);

    expect(counted.wires.map((line) => [formatWireCutLabel(line), line.count, line.groupTotal, line.unit])).toEqual([
      ['CBL-9 @120"', 2, 2, "ea"],
      ['CBL-9 (HALF) @48"', 1, 1.5, "ea"],
      ['CBL-9 (HALF) @60"', 2, 1.5, "ea"]
    ]);
    expect(items(counted.bomContacts)).toEqual([["55", 3]]);
    expect(counted.warnings).toEqual([]);
  });

  it("warns when bulk wire has no usable length or carries (HALF) without W/CBL", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "W1", length: "" }),
      row({ wirePartNumber: "W1", length: "12 in" }),
      row({ wirePartNumber: "W2 (HALF)", length: "24" })
    ]);

    expect(counted.wires.map((line) => [line.partNumber, line.groupTotal])).toEqual([
      ["W1", 0],
      ["W1", 0],
      ["W2 (HALF)", 2]
    ]);
    expect(counted.warnings).toEqual([
      'Row 1: "W1" is bulk wire but Length (in) is missing or not a number; counted as 0 ft.',
      'Row 2: "W1" is bulk wire but Length (in) is missing or not a number; counted as 0 ft.',
      'Row 3: "W2 (HALF)" has (HALF) but no W/CBL contact, so it was counted as bulk wire by length.'
    ]);
  });

  it("warns once when the same part number is W/CBL on some rows and not on others", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "X", length: "12", fromContact: "W/CBL" }),
      row({ wirePartNumber: "X", length: "12" }),
      row({ wirePartNumber: "X", length: "24" })
    ]);
    expect(counted.warnings).toHaveLength(1);
    expect(counted.warnings[0]).toContain('"X" is marked W/CBL on some rows but not others');
  });

  it("routes parenthesized wire and patchcord part numbers to Non-BOM with the same quantity rules", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "(7-500)", length: "99" }),
      row({ wirePartNumber: "(W9)", length: "24" }),
      row({ wirePartNumber: "(W9)", length: "12" }),
      row({ wirePartNumber: "(CBL-2)", length: "12", toContact: "W/CBL" })
    ]);

    expect(counted.nonBomItems.map((entry) => [entry.value, entry.qty, entry.unit])).toEqual([
      ["(7-500)", 1, "ea"],
      ["(CBL-2)", 1, "ea"],
      ["(W9)", 3, "ft"]
    ]);
    expect(counted.patchcords).toEqual([]);
    expect(counted.wires).toEqual([]);
  });

  it("skips -, ↑ and blank part numbers instead of emitting empty lines", () => {
    const counted = buildColumnsCounted([
      row({ wirePartNumber: "-", length: "12" }),
      row({ wirePartNumber: "↑", length: "12" }),
      row({ wirePartNumber: "", length: "12", fromContact: "1" })
    ]);
    expect(counted.wires).toEqual([]);
    expect(counted.patchcords).toEqual([]);
    expect(counted.nonBomItems).toEqual([]);
    expect(counted.rowCount).toBe(3);
  });
});

describe("buildColumnsCounted labels and notes", () => {
  it("counts one label per row and ignores -, ↑ and blanks", () => {
    const counted = buildColumnsCounted([
      row({ labelPartNumber: "LBL-1" }),
      row({ labelPartNumber: "LBL-1" }),
      row({ labelPartNumber: "LBL-2" }),
      row({ labelPartNumber: "-", fromContact: "1" }),
      row({ labelPartNumber: "↑", fromContact: "1" })
    ]);
    expect(items(counted.labels)).toEqual([
      ["LBL-1", 2],
      ["LBL-2", 1]
    ]);
  });

  it("extracts PART (qty) items from notes and sums them across rows", () => {
    const counted = buildColumnsCounted([
      row({ notes: "Use following items on VPC end 611111 (1) & 622222 (2)" }),
      row({ notes: "622222 (3), 633333(4)" }),
      row({ notes: 'Heat shrink 644444 @2" (2)' }),
      row({ notes: "↑" }),
      row({ notes: "no items here" })
    ]);

    expect(items(counted.notesItems)).toEqual([
      ["611111", 1],
      ["622222", 5],
      ["633333", 4],
      ['644444 @2"', 2]
    ]);
    expect(counted.warnings).toEqual([]);
  });

  it("reports note tokens that are not whole-number quantities instead of silently producing NaN", () => {
    const parsed = parseNotesItems("(2) first 123 (HALF) 456 (0) 789 (two)");
    expect(parsed.items).toEqual([]);
    expect(parsed.problems).toEqual([
      '"(2)" has no part number in front of it.',
      '"123 (HALF)" does not have a whole-number quantity.',
      '"456 (0)" has a zero quantity.',
      '"789 (two)" does not have a whole-number quantity.'
    ]);
  });
});

describe("buildColumnsCounted connectors", () => {
  it("flattens connector, backshell, strain relief and frame slot parts into one list", () => {
    const connectors: RevisionDto["snapshot"]["connectors"] = [
      {
        id: "c1",
        reference: "J1",
        partNumber: "MOD-A",
        backshellPartNumber: "BS-1",
        strainReliefPartNumber: "SR-1",
        pins: []
      },
      { id: "c2", reference: "J2", partNumber: "MOD-A", pins: [] },
      { id: "c3", reference: "J3", partNumber: "-", pins: [] },
      {
        id: "f1",
        reference: "J4",
        partNumber: "FRAME-1",
        pins: [],
        slots: [
          { slotId: "A", reference: "J4A", partNumber: "MOD-B", pins: [], backshellPartNumber: "BS-1" },
          { slotId: "B", reference: "J4B", pins: [] }
        ]
      }
    ];
    const counted = buildColumnsCounted([], connectors);

    expect(items(counted.connectors)).toEqual([
      ["BS-1", 2],
      ["FRAME-1", 1],
      ["MOD-A", 2],
      ["MOD-B", 1],
      ["SR-1", 1]
    ]);
    expect(counted.connectors.find((entry) => entry.value === "BS-1")?.sources).toEqual(["J1", "J4A"]);
  });
});

describe("isPreterminatedContactMarker", () => {
  it("accepts the documented spellings only", () => {
    expect(isPreterminatedContactMarker("W/CBL")).toBe(true);
    expect(isPreterminatedContactMarker("w/cbl")).toBe(true);
    expect(isPreterminatedContactMarker("W/ CBL")).toBe(true);
    expect(isPreterminatedContactMarker("WCBL")).toBe(true);
    expect(isPreterminatedContactMarker("W/CB")).toBe(false);
    expect(isPreterminatedContactMarker("123456")).toBe(false);
  });
});
