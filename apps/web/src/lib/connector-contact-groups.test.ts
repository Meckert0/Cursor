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
    description: extra?.description ?? "Test module",
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

  it("shows the module part number beside the connector name", () => {
    const connectors: RevisionDto["snapshot"]["connectors"] = [
      {
        id: "c_canvas_1",
        reference: "J1",
        partNumber: "510103",
        backshellPartNumber: "410120",
        strainReliefPartNumber: "SR-1",
        pins: [
          { id: "1", number: "1" },
          { id: "2", number: "2" }
        ]
      }
    ];
    const catalog = [
      module(
        { pinCount: 16, contactFamily1: "TP", pinCount2: 19, contactFamily2: "MC", gender: "ITA" },
        { id: "mod-510", partNumber: "510103", side: "ITA", description: "Signal and power" }
      )
    ];

    expect(buildConnectorDetailsRows(connectors, catalog)).toEqual([
      {
        id: "c_canvas_1",
        modules: [
          {
            id: "c_canvas_1",
            label: "J1 — 510103 — Signal and power",
            contacts: ["16 TP ITA", "19 MC ITA"]
          }
        ]
      }
    ]);
  });

  it("uses the catalog module part number when the snapshot omits it", () => {
    const connectors: RevisionDto["snapshot"]["connectors"] = [
      {
        id: "c1",
        reference: "J1",
        libraryComponentId: "mod-1",
        pins: [{ id: "1", number: "1" }]
      }
    ];

    expect(buildConnectorDetailsRows(connectors, [module({ pinCount: 2, contactFamily1: "MC" }, { description: "Mini coax" })])).toEqual([
      {
        id: "c1",
        modules: [
          {
            id: "c1",
            label: "J1 — MOD-1 — Mini coax",
            contacts: ["2 MC"]
          }
        ]
      }
    ]);
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
        { id: "mod-a", partNumber: "MOD-A", side: "ITA", description: "Power and signal" }
      ),
      module(
        { pinCount: 2, contactFamily1: "MC" },
        { id: "mod-b", partNumber: "MOD-B", side: "ITA", description: "Coax pair" }
      )
    ];

    expect(buildConnectorDetailsRows(connectors, catalog)).toEqual([
      {
        id: "c1",
        housing: "J1",
        modules: [
          {
            id: "A",
            label: "J1A — MOD-A — Power and signal",
            contacts: ["16 TP ITA", "19 MC ITA"]
          },
          {
            id: "B",
            label: "J1B — MOD-B — Coax pair",
            contacts: ["2 MC ITA"]
          }
        ]
      }
    ]);
  });
});
