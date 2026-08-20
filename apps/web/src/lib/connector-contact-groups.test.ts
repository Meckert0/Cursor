import { describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "./api";
import {
  buildConnectorDetailsRows,
  displayConnectorGender,
  formatContactGroupLabel,
  readModuleContactGroups
} from "./connector-contact-groups";

function module(attributes: Record<string, unknown>, extra?: Partial<LibraryComponentDto>): LibraryComponentDto {
  return {
    id: extra?.id ?? "mod-1",
    category: "module",
    family: "iCon",
    partNumber: extra?.partNumber ?? "MOD-1",
    description: "Test module",
    isActive: true,
    isReviewed: true,
    stockStatus: "in_stock",
    createdByUserId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastEditedByUserId: "u1",
    lastEditedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    side: extra?.side,
    partType: extra?.partType ?? "MODULE",
    attributes
  };
}

describe("connector contact groups", () => {
  it("maps receiver gender to RCV", () => {
    expect(displayConnectorGender("RECEIVER")).toBe("RCV");
    expect(displayConnectorGender("rcv")).toBe("RCV");
    expect(displayConnectorGender("ITA")).toBe("ITA");
    expect(displayConnectorGender("MODULE")).toBe("");
  });

  it("reads pin count, contact type, and ITA/RCV gender", () => {
    expect(
      readModuleContactGroups(
        module(
          { pinCount: 16, contactFamily1: "TP", gender: "ITA" },
          { side: "ITA" }
        )
      )
    ).toEqual([{ pinCount: 16, contactType: "TP", gender: "ITA" }]);
  });

  it("splits multi-contact modules into separate groups with the same gender", () => {
    expect(
      readModuleContactGroups(
        module({
          pinCount: 16,
          contactFamily1: "TP",
          pinCount2: 19,
          contactFamily2: "MC",
          gender: "RECEIVER"
        })
      )
    ).toEqual([
      { pinCount: 16, contactType: "TP", gender: "RCV" },
      { pinCount: 19, contactType: "MC", gender: "RCV" }
    ]);
  });

  it("uses contact positions when a module has multiple contact sizes", () => {
    expect(
      readModuleContactGroups(
        module(
          {
            contactPositions: [
              { contactSize: "20", pinCount: 10 },
              { contactFamily: "Signal", contactSize: "16", pinCount: 6 }
            ]
          },
          { side: "ITA" }
        )
      )
    ).toEqual([
      { pinCount: 10, contactType: "20", gender: "ITA" },
      { pinCount: 6, contactType: "Signal", gender: "ITA" }
    ]);
  });

  it("formats contact group labels without part numbers", () => {
    expect(formatContactGroupLabel({ pinCount: 16, contactType: "TP", gender: "ITA" })).toBe("16 TP ITA");
    expect(formatContactGroupLabel({ pinCount: 2, contactType: "", gender: "RCV" })).toBe("2 RCV");
    expect(formatContactGroupLabel({ pinCount: 9, contactType: "", gender: "" })).toBe("9");
  });

  it("groups frame slot modules under the same connector", () => {
    const connectors: RevisionDto["snapshot"]["connectors"] = [
      {
        id: "c1",
        reference: "J1",
        partNumber: "ITA-2",
        libraryComponentId: "frame-1",
        pins: [],
        slots: [
          {
            slotId: "A",
            reference: "J1A",
            partNumber: "MOD-A",
            libraryComponentId: "mod-a",
            pins: [
              { id: "1", number: "1" },
              { id: "2", number: "2" }
            ]
          },
          {
            slotId: "B",
            reference: "J1B",
            partNumber: "MOD-B",
            libraryComponentId: "mod-b",
            pins: [{ id: "1", number: "1" }]
          }
        ]
      }
    ];
    const catalog = [
      module(
        { pinCount: 16, contactFamily1: "TP", pinCount2: 19, contactFamily2: "MC", gender: "ITA" },
        { id: "mod-a", partNumber: "MOD-A", side: "ITA" }
      ),
      module({ pinCount: 2, contactFamily1: "MC" }, { id: "mod-b", partNumber: "MOD-B", side: "ITA" })
    ];

    expect(buildConnectorDetailsRows(connectors, catalog)).toEqual([
      {
        id: "c1",
        heading: "J1 (c1)",
        lines: ["J1A: 16 TP ITA", "J1A: 19 MC ITA", "J1B: 2 MC ITA"]
      }
    ]);
  });
});
