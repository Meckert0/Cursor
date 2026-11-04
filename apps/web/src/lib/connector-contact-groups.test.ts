import { describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "./api";
import {
  buildConnectorModuleEntries,
  displayConnectorGender,
  formatContactAwgRange,
  formatContactGroupLabel,
  formatContactPositionList,
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

function contact(partNumber: string, attributes: Record<string, unknown>, description?: string): LibraryComponentDto {
  return {
    ...module(attributes, { id: `contact-${partNumber}`, partNumber, description: description ?? `Contact ${partNumber}` }),
    category: "contact",
    partType: undefined
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

  it("formats contact AWG ranges from accepted min and max, AWG text, or gauges", () => {
    expect(formatContactAwgRange(contact("C-1", { acceptedAwgMin: 26, acceptedAwgMax: 22 }))).toBe("22-26 AWG");
    expect(formatContactAwgRange(contact("C-2", { acceptedAwgMin: 20, acceptedAwgMax: 20 }))).toBe("20 AWG");
    expect(formatContactAwgRange(contact("C-3", { awg: "16-20" }))).toBe("16-20 AWG");
    expect(formatContactAwgRange(contact("C-4", { acceptedGauges: ["22", "24"] }))).toBe("22, 24 AWG");
    expect(formatContactAwgRange(contact("C-5", {}))).toBe("");
    expect(formatContactAwgRange(undefined)).toBe("");
  });

  it("collapses consecutive contact positions into a range", () => {
    expect(formatContactPositionList("All")).toBe("All");
    expect(formatContactPositionList("1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12")).toBe("1–12");
    expect(formatContactPositionList("2, 3, 10")).toBe("2–3, 10");
    expect(formatContactPositionList("A, B")).toBe("A, B");
  });

  it("lists every canvas module sorted by designator with its connector info", () => {
    const connectors: RevisionDto["snapshot"]["connectors"] = [
      {
        id: "c10",
        reference: "J10",
        partNumber: "510103",
        backshellPartNumber: "410120",
        strainReliefPartNumber: "SR-1",
        pins: [
          { id: "1", number: "1" },
          { id: "2", number: "2" }
        ]
      },
      {
        id: "c2",
        reference: "J2",
        partNumber: "ITA-2",
        pins: [],
        slots: [
          {
            slotId: "B",
            reference: "J2B",
            pins: []
          },
          {
            slotId: "A",
            reference: "J2A",
            partNumber: "MOD-A",
            libraryComponentId: "mod-a",
            backshellPartNumber: "BS-9",
            pins: [{ id: "1", number: "1" }]
          }
        ]
      },
      {
        id: "c1",
        reference: "P1",
        partNumber: "ITA-1",
        pins: [],
        slots: [{ slotId: "A", reference: "P1A", partNumber: "MOD-B", libraryComponentId: "mod-b", pins: [] }]
      },
      { id: "c3", reference: "J3", pins: [] }
    ];
    const catalog = [
      module(
        { pinCount: 16, contactFamily1: "TP", pinCount2: 19, contactFamily2: "MC", gender: "ITA" },
        { id: "mod-510", partNumber: "510103", side: "ITA", description: "Signal and power" }
      ),
      module({ pinCount: 2, contactFamily1: "MC" }, { id: "mod-a", partNumber: "MOD-A", side: "RECEIVER", description: "Coax pair" }),
      module({ pinCount: 4, contactFamily1: "TP" }, { id: "mod-b", partNumber: "MOD-B", description: "Only module" })
    ];

    const entries = buildConnectorModuleEntries({ connectors, connectorCatalog: catalog });
    expect(entries.map((entry) => entry.designator)).toEqual(["J2A", "J2B", "J3", "J10", "P1"]);
    expect(entries[0]).toMatchObject({
      designator: "J2A",
      partNumber: "MOD-A",
      description: "Coax pair",
      gender: "RCV",
      contactGroups: ["2 MC RCV"],
      frame: { reference: "J2", partNumber: "ITA-2", slotId: "A" },
      backshellPartNumber: "BS-9",
      strainReliefPartNumber: "",
      moduleDefined: true
    });
    expect(entries[1]).toMatchObject({ designator: "J2B", partNumber: "", moduleDefined: false, contactGroups: [] });
    expect(entries[2]).toMatchObject({ designator: "J3", partNumber: "", moduleDefined: false });
    expect(entries[3]).toMatchObject({
      designator: "J10",
      partNumber: "510103",
      description: "Signal and power",
      contactGroups: ["16 TP ITA", "19 MC ITA"],
      backshellPartNumber: "410120",
      strainReliefPartNumber: "SR-1"
    });
    expect(entries[3]?.frame).toBeUndefined();
    expect(entries[4]).toMatchObject({
      designator: "P1",
      partNumber: "MOD-B",
      frame: { reference: "P1", partNumber: "ITA-1", slotId: "A" }
    });
  });

  it("uses the catalog module part number when the snapshot omits it", () => {
    const entries = buildConnectorModuleEntries({
      connectors: [{ id: "c1", reference: "J1", libraryComponentId: "mod-1", pins: [{ id: "1", number: "1" }] }],
      connectorCatalog: [module({ pinCount: 2, contactFamily1: "MC" }, { description: "Mini coax" })]
    });
    expect(entries[0]).toMatchObject({ partNumber: "MOD-1", description: "Mini coax", contactGroups: ["2 MC"] });
  });

  it("lists compatible contacts with AWG range and positions from contact relationships", () => {
    const entries = buildConnectorModuleEntries({
      connectors: [{ id: "c1", reference: "J1", partNumber: "MOD-1", libraryComponentId: "mod-1", pins: [] }],
      connectorCatalog: [module({ pinCount: 4, contactFamily1: "TP" })],
      contactCatalog: [
        contact("CNT-22", { acceptedAwgMin: 22, acceptedAwgMax: 26 }, "Pin, size 22"),
        contact("CNT-16", { acceptedAwgMin: 16, acceptedAwgMax: 20 }, "Pin, size 16"),
        contact("CNT-BAD", { acceptedAwgMin: 12, acceptedAwgMax: 14 })
      ],
      contactRelationships: [
        { parentPartId: "mod-1", compatibleParts: ["CNT-22"], parentPositions: ["10", "2"], status: "allowed" },
        { parentPartId: "mod-1", compatibleParts: ["CNT-22"], parentPositions: ["3"], status: "allowed" },
        { parentPartId: "mod-1", compatibleParts: ["CNT-16", "CNT-MISSING"], parentPositions: [], status: "review" },
        { parentPartId: "mod-1", compatibleParts: ["CNT-BAD"], parentPositions: [], status: "forbidden" },
        { parentPartId: "mod-2", compatibleParts: ["CNT-22"], parentPositions: [], status: "allowed" }
      ],
      moduleContactCompat: [{ modulePartId: "mod-1", contactPartId: "contact-CNT-BAD", status: "allowed" }]
    });

    expect(entries[0]?.compatibleContacts).toEqual([
      { partNumber: "CNT-16", description: "Pin, size 16", awgRange: "16-20 AWG", positions: "All", status: "review" },
      { partNumber: "CNT-22", description: "Pin, size 22", awgRange: "22-26 AWG", positions: "2, 3, 10", status: "allowed" },
      { partNumber: "CNT-MISSING", description: "", awgRange: "", positions: "All", status: "review" }
    ]);
  });

  it("falls back to module-contact compatibility rows when a module has no relationships", () => {
    const entries = buildConnectorModuleEntries({
      connectors: [
        {
          id: "c1",
          reference: "J1",
          partNumber: "ITA-1",
          pins: [],
          slots: [{ slotId: "A", reference: "J1", partNumber: "MOD-1", pins: [] }]
        }
      ],
      connectorCatalog: [module({ pinCount: 4, contactFamily1: "TP" })],
      contactCatalog: [contact("CNT-20", { awg: "20" }), contact("CNT-X", {})],
      moduleContactCompat: [
        { modulePartId: "mod-1", contactPartId: "contact-CNT-20", status: "allowed" },
        { modulePartId: "mod-1", contactPartId: "contact-CNT-X", status: "forbidden" }
      ]
    });
    expect(entries[0]?.designator).toBe("J1");
    expect(entries[0]?.compatibleContacts).toEqual([
      { partNumber: "CNT-20", description: "Contact CNT-20", awgRange: "20 AWG", positions: "All", status: "allowed" }
    ]);
  });

  it("names a one-slot frame module after the connector", () => {
    const entries = buildConnectorModuleEntries({
      connectors: [
        {
          id: "c1",
          reference: "J1",
          partNumber: "ITA-1",
          libraryComponentId: "frame-1",
          pins: [],
          slots: [{ slotId: "A", reference: "J1A", partNumber: "MOD-A", libraryComponentId: "mod-a", pins: [] }]
        }
      ],
      connectorCatalog: []
    });
    expect(entries[0]?.designator).toBe("J1");
  });
});
