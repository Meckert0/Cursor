import { describe, expect, it } from "vitest";
import type { LibraryComponentDto } from "./api";
import {
  CONNECTOR_PICKER_COLUMNS, buildPickerIndex, getPickerFacetChoices, getPickerResults,
  isPickerPart, pickerColumn, pickerDefaultColumns, pickerDisplayValue, pickerFilterError, pickerTopFilters, type PickerColumnId, type PickerFilter, type PickerFilters
} from "./connector-picker";

function part(id: string, overrides: Partial<LibraryComponentDto> = {}): LibraryComponentDto {
  return {
    id, partNumber: id, category: "module", partType: "MODULE", family: "i1", description: "Signal module",
    side: "ITA", isActive: true, isReviewed: true, stockStatus: "in_stock", attributes: {},
    createdByUserId: "u1", createdAt: "2026-01-01", lastEditedByUserId: "u1", lastEditedAt: "2026-01-01", updatedAt: "2026-01-01",
    ...overrides
  };
}
const range = (min: string, max = ""): PickerFilter => ({ kind: "number", mode: "range", min, max });
const values = (...selected: string[]): PickerFilter => ({ kind: "values", values: selected });
const contains = (value: string): PickerFilter => ({ kind: "text", operator: "contains", value });

describe("connector picker discovery", () => {
  it("offers family and side at the top while keeping positions and availability as information columns", () => {
    expect(pickerTopFilters("connector")).toEqual(["family", "side"]);
    expect(pickerDefaultColumns("connector")).toEqual(expect.arrayContaining(["positions", "stockStatus"]));
  });
  it("groups blank fillers under Blank insert and preserves SIM host family and side", () => {
    const blank = part("BLANK", { family: "ITA/RCV", description: "Blank module", side: "DUAL", attributes: { positionCount: 0 } });
    const host = part("HOST", { family: "iCon", description: "SIM host with no inserts", electricalMode: "INSERT_HOST", attributes: { simSlotCount: 16 } });
    const index = buildPickerIndex([blank, host]);
    expect(index[0].values.family).toBe("Blank insert");
    expect(index[0].values.side).toBe("ITA & Receiver");
    expect(index[1].values.family).toBe("iCon");
    expect(getPickerFacetChoices(index, "", {}, "family")).toContainEqual({ value: "Blank insert", count: 1 });
    expect(getPickerResults(index, "", { family: values("Blank insert") }, null).map(record => record.part.id)).toEqual([blank.id]);
    expect(blank.family).toBe("ITA/RCV");
  });
  it("includes shared parts under each side and lists them once when both sides are selected", () => {
    const shared = part("SHARED", { side: " dual " });
    const index = buildPickerIndex([part("ITA"), part("RCV", { side: "RCV" }), shared, part("UNKNOWN", { side: "" })]);
    expect(pickerDisplayValue(index[2], pickerColumn("side"))).toBe("ITA & Receiver");
    expect(getPickerFacetChoices(index, "", {}, "side")).toEqual([
      { value: "ITA", count: 2 }, { value: "Receiver", count: 2 }, { value: "Unspecified", count: 1 }
    ]);
    expect(getPickerResults(index, "", { side: values("ITA") }, null).map(r => r.part.id)).toEqual(["ITA", "SHARED"]);
    expect(getPickerResults(index, "", { side: values("Receiver") }, null).map(r => r.part.id)).toEqual(["RCV", "SHARED"]);
    expect(getPickerResults(index, "", { side: values("ITA", "Receiver") }, null).map(r => r.part.id)).toEqual(["ITA", "RCV", "SHARED"]);
    expect(getPickerResults(index, "", { side: values("Unspecified") }, null).map(r => r.part.id)).toEqual(["UNKNOWN"]);
    expect(shared.side).toBe(" dual ");
  });
  it("counts each side for shared-only catalogs and respects searches and other column filters", () => {
    const index = buildPickerIndex([
      part("SHARED", { side: "DUAL", family: "iCon" }),
      part("OTHER", { side: "DUAL", family: "i1" })
    ]);
    const filters = { side: values("ITA"), family: values("iCon") };
    expect(getPickerFacetChoices(index, "signal", filters, "side")).toEqual([{ value: "ITA", count: 1 }, { value: "Receiver", count: 1 }]);
    expect(getPickerFacetChoices(index, "no-match", filters, "side")).toEqual([{ value: "ITA", count: 0 }, { value: "Receiver", count: 0 }]);
    for (const query of ["ITA", "Receiver"]) expect(getPickerResults(index, query, { family: values("iCon") }, null).map(r => r.part.id)).toEqual(["SHARED"]);
  });
  it("keeps connector and housing eligibility separate, including legacy Receiver aliases", () => {
    const catalog = [
      part("module"),
      part("ita", { category: "frame", partType: "ITA" }),
      part("receiver", { category: "frame", partType: "RECEIVER" }),
      part("rcv", { category: "frame", partType: "RCV" }),
      part("sim", { partType: "SIM_INSERT" }),
      part("contact", { category: "contact", partType: "CONTACT" })
    ];
    expect(catalog.filter(p => isPickerPart(p, "connector")).map(p => p.id)).toEqual(["module"]);
    expect(catalog.filter(p => isPickerPart(p, "frame")).map(p => p.id)).toEqual(["ita", "receiver", "rcv"]);
    expect(pickerDefaultColumns("frame")).toContain("moduleCapacity");
    expect(pickerDefaultColumns("frame")).not.toContain("positions");
    expect(pickerTopFilters("frame")).toContain("moduleCapacity");
    expect(pickerDefaultColumns("connector")).toContain("positions");
  });
  it("searches all tokens across fields, preserves phrases, and normalizes part numbers", () => {
    const index = buildPickerIndex([
      part("a", { partNumber: "ABC-096-I", description: "Signal power module", family: "i1" }),
      part("b", { partNumber: "X-096", description: "Signal module", family: "iCon" }),
      part("c", { partNumber: "ABC-096-I-EXTRA", description: "Power module", family: "i1" })
    ]);
    expect(getPickerResults(index, 'i1 "signal power"', {}, null).map(r => r.part.id)).toEqual(["a"]);
    expect(getPickerResults(index, "abc096i", {}, null).map(r => r.part.id)).toEqual(["a", "c"]);
    expect(getPickerResults(index, "096 SIGNAL", {}, null).map(r => r.part.id)).toEqual(["a", "b"]);
    expect(getPickerResults(index, "", { partNumber: contains("---") }, null)).toHaveLength(0);
  });

  it("matches descriptions independently and supports equals and starts with", () => {
    const index = buildPickerIndex([part("a", { description: "Coax module" }), part("b", { description: "Signal module" })]);
    expect(getPickerResults(index, "", { description: { kind: "text", operator: "equals", value: "COAX MODULE" } }, null).map(r => r.part.id)).toEqual(["a"]);
    expect(getPickerResults(index, "", { description: { kind: "text", operator: "starts", value: "signal" } }, null).map(r => r.part.id)).toEqual(["b"]);
  });

  it("combines OR within a column with AND across columns and global search", () => {
    const index = buildPickerIndex([
      part("a", { attributes: { positionCount: 64 } }),
      part("b", { family: "iCon", attributes: { positionCount: 96 } }),
      part("c", { side: "RECEIVER", attributes: { positionCount: 96 } }),
      part("d", { description: "Power module", attributes: { positionCount: 96 } })
    ]);
    const filters: PickerFilters = { family: values("i1", "iCon"), side: values("ITA"), positions: range("64", "96") };
    expect(getPickerResults(index, "signal", filters, null).map(r => r.part.id)).toEqual(["a", "b"]);
    expect(getPickerFacetChoices(index, "signal", filters, "side")).toContainEqual({ value: "Receiver", count: 1 });
  });

  it("keeps selected zero-count values when compatibility changes the input pool", () => {
    const index = buildPickerIndex([part("a")]);
    const choices = getPickerFacetChoices(index, "", { side: values("Receiver") }, "side");
    expect(choices).toContainEqual({ value: "Receiver", count: 0 });
    expect(choices).toContainEqual({ value: "ITA", count: 1 });
    expect(getPickerResults(index, "", {}, null).map(r => r.part.id)).toEqual(["a"]);
  });

  it("counts mixed contact groups, separates frame capacity, and preserves unknowns", () => {
    const index = buildPickerIndex([
      part("mixed", { attributes: { pinCount: 64, pinCount2: 12 } }),
      part("explicit", { attributes: { positionCount: 100, pinCount: 64 } }),
      part("ids", { attributes: { pinIds: ["A1", "A2"] } }),
      part("frame", { category: "frame", partType: "RECEIVER", attributes: { slotIds: ["A", "B"], gender: "Pin" } }),
      part("missing")
    ]);
    expect(index.map(r => r.values.positions)).toEqual([76, 100, 2, null, null]);
    expect(pickerDisplayValue(index[0], pickerColumn("positions"))).toBe("64/12");
    expect(index[3].values.moduleCapacity).toBe(2);
    expect(pickerDisplayValue(index[3], pickerColumn("positions"))).toBe("Not applicable");
    expect(pickerDisplayValue(index[4], pickerColumn("positions"))).toBe("Not supplied");
    expect(pickerDisplayValue(index[3], pickerColumn("gender"))).toBe("Not applicable");
    expect(getPickerResults(index, "", { positions: { kind: "number", mode: "missing", min: "", max: "" } }, null).map(r => r.part.id)).toEqual(["missing"]);
    expect(getPickerResults(index, "", { positions: { kind: "number", mode: "notApplicable", min: "", max: "" } }, null).map(r => r.part.id)).toEqual(["frame"]);
  });

  it.each<[Record<string, unknown>, number | null, string]>([
    [{ positionCount: 108, pinCount: 100, pinCount2: 8 }, 108, "100/8"],
    [{ pinCount: "100", pinCount2: "8" }, 108, "100/8"],
    [{ positionCount: 108, pinCount: 108, contactPositions: [{ contactSize: "20", pinCount: 100 }, { contactSize: "12", pinCount: 8 }] }, 108, "100/8"],
    [{ pinCount: 0, contactPositions: [{ pinCount: 100 }, { pinCount: 8 }] }, 108, "100/8"],
    [{ contactPositions: [{ pinCount: "100" }, { pinCount: 8 }, { pinCount: 2 }] }, 110, "100/8/2"],
    [{ pinCount: 100, pinCount2: 8, contactPositions: [{ pinCount: 50 }, { pinCount: 58 }] }, 108, "100/8"],
    [{ positionCount: 108, pinCount: 100 }, 108, "108"],
    [{ pinCount: 100, pinCount2: 0 }, 100, "100"],
    [{ contactPositions: [{ pinCount: 96 }] }, 96, "96"],
    [{ positionCount: 0, pinCount: 0, pinCount2: 0 }, 0, "0"],
    [{ contactPositions: [null, {}, { pinCount: -2 }, { pinCount: 1.5 }, { pinCount: "invalid" }] }, null, "Not supplied"]
  ])("displays contact-group breakdowns while retaining numeric totals (%j)", (attributes, total, display) => {
    const record = buildPickerIndex([part("module", { attributes })])[0];
    expect(record.values.positions).toBe(total);
    expect(pickerDisplayValue(record, pickerColumn("positions"))).toBe(display);
  });

  it("searches hybrid breakdowns and uses totals for numeric ranges and sorting", () => {
    const index = buildPickerIndex([
      part("HYBRID", { attributes: { positionCount: 108, pinCount: 100, pinCount2: 8 } }),
      part("MIXED", { attributes: { pinCount: 64, pinCount2: 12 } }),
      part("SIGNAL", { attributes: { pinCount: 96 } }), part("UNKNOWN")
    ]);
    expect(getPickerResults(index, "100/8", {}, null).map(r => r.part.id)).toEqual(["HYBRID"]);
    expect(getPickerResults(index, "", { positions: range("108", "108") }, null).map(r => r.part.id)).toEqual(["HYBRID"]);
    expect(getPickerResults(index, "", { positions: range("100", "100") }, null)).toEqual([]);
    expect(getPickerResults(index, "", {}, { id: "positions", direction: "asc" }).map(r => r.part.id)).toEqual(["MIXED", "SIGNAL", "HYBRID", "UNKNOWN"]);
    expect(getPickerResults(index, "", {}, { id: "positions", direction: "desc" }).map(r => r.part.id)).toEqual(["HYBRID", "SIGNAL", "MIXED", "UNKNOWN"]);
  });

  it("validates numeric bounds and uses inclusive ranges without treating missing values as zero", () => {
    for (const filter of [range("-1"), range("1.5"), range("not a number"), range("100", "10")]) expect(pickerFilterError(filter)).not.toBeNull();
    expect(pickerFilterError(range("0", "96"))).toBeNull();
    const index = buildPickerIndex([part("zero", { attributes: { positionCount: 0 } }), part("96", { attributes: { positionCount: 96 } }), part("missing")]);
    expect(getPickerResults(index, "", { positions: range("0", "96") }, null).map(r => r.part.id)).toEqual(["96", "zero"]);
    expect(getPickerResults(index, "", { positions: range("1.5") }, null)).toEqual([]);
  });

  it("sorts numeric values naturally and keeps missing values last in both directions", () => {
    const index = buildPickerIndex([part("P-10", { attributes: { positionCount: 10 } }), part("P-2", { attributes: { positionCount: 2 } }), part("P-1")]);
    expect(getPickerResults(index, "", {}, null).map(r => r.part.id)).toEqual(["P-1", "P-2", "P-10"]);
    expect(getPickerResults(index, "", {}, { id: "positions", direction: "asc" }).map(r => r.part.id)).toEqual(["P-2", "P-10", "P-1"]);
    expect(getPickerResults(index, "", {}, { id: "positions", direction: "desc" }).map(r => r.part.id)).toEqual(["P-10", "P-2", "P-1"]);
  });

  const sortableValues: Array<[PickerColumnId, Partial<LibraryComponentDto>, Partial<LibraryComponentDto>, PickerFilter]> = [
    ["partNumber", { partNumber: "AA-1" }, { partNumber: "ZZ-1" }, contains("aa")],
    ["description", { description: "Alpha" }, { description: "Zulu" }, contains("alpha")],
    ["type", { category: "frame", partType: "ITA" }, {}, values("ITA housing")],
    ["family", { family: "Alpha" }, { family: "Zulu" }, values("Alpha")],
    ["side", { side: "ITA" }, { side: "RECEIVER" }, values("ITA")],
    ["positions", { attributes: { positionCount: 2 } }, { attributes: { positionCount: 10 } }, range("2", "2")],
    ["stockStatus", { stockStatus: "in_stock" }, { stockStatus: "out_of_stock" }, values("In stock")],
    ["reviewStatus", { isReviewed: false }, { isReviewed: true }, values("Awaiting review")],
    ["gender", { attributes: { gender: "Pin" } }, { attributes: { gender: "Socket" } }, values("Pin")],
    ["moduleCapacity", { category: "frame", partType: "ITA", attributes: { moduleCapacity: 2 } }, { category: "frame", partType: "ITA", attributes: { moduleCapacity: 10 } }, range("2", "2")],
    ["contactFamily", { attributes: { contactFamily1: "Coax" } }, { attributes: { contactFamily1: "Signal" } }, values("Coax")],
    ["contactSize", { attributes: { contactSize: "16" } }, { attributes: { contactSize: "22" } }, values("16")],
    ["emi", { attributes: { emi: false } }, { attributes: { emi: true } }, values("No")],
    ["slotOccupancy", { partType: "SIM_INSERT", attributes: { slotOccupancy: 1 } }, { partType: "SIM_INSERT", attributes: { slotOccupancy: 2 } }, range("1", "1")]
  ];
  it.each(sortableValues)("supports ascending, descending, and filtering for the %s column", (id, first, second, filter) => {
    const index = buildPickerIndex([part("b", second), part("a", first)]);
    expect(getPickerResults(index, "", {}, { id, direction: "asc" }).map(r => r.part.id)).toEqual(["a", "b"]);
    expect(getPickerResults(index, "", {}, { id, direction: "desc" }).map(r => r.part.id)).toEqual(["b", "a"]);
    expect(getPickerResults(index, "", { [id]: filter }, null).map(r => r.part.id)).toEqual(["a"]);
  });

  it("covers every declared information column and resolves ties by identity", () => {
    expect(sortableValues.map(([id]) => id)).toEqual(CONNECTOR_PICKER_COLUMNS.map(c => c.id));
    const index = buildPickerIndex([part("b", { partNumber: "SAME" }), part("a", { partNumber: "SAME" })]);
    expect(getPickerResults(index, "", {}, { id: "family", direction: "desc" }).map(r => r.part.id)).toEqual(["a", "b"]);
  });
});
