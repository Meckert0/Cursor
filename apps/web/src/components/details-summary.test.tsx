import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { bundleDiameterInches, formatBundleDiameterLabel } from "@/lib/cable-canvas-utils";
import { DetailsSummary } from "./details-summary";

function module(
  partNumber: string,
  id: string,
  description = "Test module",
  attributes: Record<string, unknown> = { pinCount: 16, contactFamily1: "TP", gender: "ITA" }
): LibraryComponentDto {
  return {
    id,
    category: "module",
    family: "iCon",
    partNumber,
    description,
    isActive: true,
    isReviewed: true,
    stockStatus: "in_stock",
    createdByUserId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastEditedByUserId: "u1",
    lastEditedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    side: "ITA",
    partType: "MODULE",
    attributes
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("DetailsSummary", () => {
  it("shows module part numbers, a blank bundle diameter, and connector names on endpoint totals", () => {
    const snapshot = {
      connectors: [
        {
          id: "c_canvas_1",
          reference: "J1",
          partNumber: "510103",
          backshellPartNumber: "410120",
          strainReliefPartNumber: "SR-1",
          pins: [{ id: "1", number: "1" }]
        },
        {
          id: "c_canvas_2",
          reference: "J2",
          partNumber: "ITA-2",
          pins: [],
          slots: [
            {
              slotId: "A",
              reference: "J2A",
              partNumber: "MOD-A",
              libraryComponentId: "mod-a",
              pins: [{ id: "1", number: "1" }],
              backshellPartNumber: "BS-9"
            }
          ]
        }
      ],
      junctions: [],
      paths: [
        {
          id: "p1",
          wireName: "cable1",
          fromConnectorId: "c_canvas_1",
          toConnectorId: "c_canvas_2",
          pathType: "cable",
          length: 24,
          sleeving: "expandable_sleeving"
        }
      ],
      pinMappings: [],
      bundles: [],
      annotations: []
    } as RevisionDto["snapshot"];

    render(
      <DetailsSummary
        revisionId="rev-1"
        snapshot={snapshot}
        connectorCatalog={[
          module("510103", "mod-510", "Signal module"),
          module("MOD-A", "mod-a", "Power and signal", {
            pinCount: 16,
            contactFamily1: "TP",
            pinCount2: 19,
            contactFamily2: "MC",
            gender: "ITA"
          })
        ]}
      />
    );

    const modules = screen.getAllByRole("article");
    expect(modules.map((module) => module.getAttribute("aria-label"))).toEqual(["Module J1", "Module J2"]);
    const j1 = within(modules[0]);
    expect(j1.getByText("510103")).toBeInTheDocument();
    expect(j1.getByText("Signal module")).toBeInTheDocument();
    expect(j1.getByText("16 TP ITA")).toBeInTheDocument();
    expect(j1.getByText("BS 410120")).toBeInTheDocument();
    expect(j1.getByText("SR-1")).toBeInTheDocument();
    expect(j1.queryByText(/ITA-2/)).not.toBeInTheDocument();
    const j2a = within(modules[1]);
    expect(j2a.getByText("MOD-A")).toBeInTheDocument();
    expect(j2a.getByText("16 TP ITA, 19 MC ITA")).toBeInTheDocument();
    expect(j2a.getByText("BS-9")).toBeInTheDocument();
    expect(j2a.queryByText(/slot A/)).not.toBeInTheDocument();
    expect(j2a.getByText("No compatible contacts.")).toBeInTheDocument();
    expect(
      screen.getByText("cable1: c_canvas_1 -> c_canvas_2, 24 in, expandable sleeving, bundle dia —")
    ).toBeInTheDocument();
    expect(screen.getByText("J1 -> J2: 24 in")).toBeInTheDocument();
    expect(screen.queryByText(/c_canvas_1\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ sections?/)).not.toBeInTheDocument();
  });

  it("shows a compatible contact table with AWG ranges next to each module", () => {
    const contactPart = (id: string, partNumber: string, attributes: Record<string, unknown>): LibraryComponentDto => ({
      ...module(partNumber, id, `Contact ${partNumber}`, attributes),
      category: "contact",
      partType: undefined
    });
    const snapshot = {
      connectors: [
        { id: "c2", reference: "J2", partNumber: "MOD-2", libraryComponentId: "mod-2", pins: [] },
        { id: "c1", reference: "J1", partNumber: "MOD-1", libraryComponentId: "mod-1", pins: [] }
      ],
      junctions: [],
      paths: [],
      pinMappings: [],
      bundles: [],
      annotations: []
    } as RevisionDto["snapshot"];

    render(
      <DetailsSummary
        revisionId="rev-compat"
        snapshot={snapshot}
        connectorCatalog={[module("MOD-1", "mod-1"), module("MOD-2", "mod-2")]}
        contactCatalog={[
          contactPart("cnt-22", "CNT-22", { acceptedAwgMin: 22, acceptedAwgMax: 26 }),
          contactPart("cnt-16", "CNT-16", { acceptedAwgMin: 16, acceptedAwgMax: 20 })
        ]}
        contactRelationships={[
          { parentPartId: "mod-1", compatibleParts: ["CNT-22"], parentPositions: ["1", "2"], status: "allowed" }
        ]}
        moduleContactCompat={[{ modulePartId: "mod-2", contactPartId: "cnt-16", status: "review" }]}
      />
    );

    const modules = screen.getAllByRole("article");
    expect(modules.map((module) => module.getAttribute("aria-label"))).toEqual(["Module J1", "Module J2"]);
    const j1Rows = within(screen.getByRole("table", { name: "Compatible contacts for J1" })).getAllByRole("row");
    expect(j1Rows[0]).toHaveTextContent("ContactAWGPos");
    expect(j1Rows[0]).not.toHaveTextContent("Status");
    expect(j1Rows[1]).toHaveTextContent("CNT-22 Contact CNT-2222-26 AWG1–2");
    expect(j1Rows[1]).not.toHaveTextContent("Allowed");
    const j2Rows = within(screen.getByRole("table", { name: "Compatible contacts for J2" })).getAllByRole("row");
    expect(j2Rows[1]).toHaveTextContent("CNT-16 Contact CNT-1616-20 AWGAll");
    expect(j2Rows[1]).not.toHaveTextContent("Review");
  });

  it("fills each cable section bundle diameter from the wirelist and sizes the sleeving", () => {
    const wirePart = (id: string, partNumber: string, overallDia: number): LibraryComponentDto => ({
      id,
      category: "wire",
      family: "M22759",
      partNumber,
      description: partNumber,
      isActive: true,
      isReviewed: true,
      stockStatus: "in_stock",
      createdByUserId: "u1",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastEditedByUserId: "u1",
      lastEditedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      attributes: { awg: "22", color: "white", overallDia }
    });
    const sleeve = (id: string, partNumber: string, minDia: number, maxDia: number): LibraryComponentDto => ({
      id,
      category: "sleeve-tube-braid",
      family: "expandable_sleeving",
      partNumber,
      description: partNumber,
      isActive: true,
      isReviewed: true,
      stockStatus: "in_stock",
      createdByUserId: "u1",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastEditedByUserId: "u1",
      lastEditedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      attributes: { sizeRanges: [{ minDia, maxDia }] }
    });
    const snapshot = {
      connectors: [
        { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
        { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] },
        { id: "c3", reference: "J3", pins: [{ id: "1", number: "1" }] }
      ],
      junctions: [{ id: "jx", location: { x: 0, y: 0 }, label: "JX" }],
      paths: [
        {
          id: "p-trunk",
          wireName: "cable1",
          fromConnectorId: "c1",
          toConnectorId: "jx",
          pathType: "cable",
          length: 12,
          sleeving: "expandable_sleeving"
        },
        {
          id: "p-j2",
          wireName: "cable2",
          fromConnectorId: "jx",
          toConnectorId: "c2",
          pathType: "cable",
          length: 6,
          sleeving: "expandable_sleeving"
        },
        {
          id: "p-j3",
          wireName: "cable3",
          fromConnectorId: "jx",
          toConnectorId: "c3",
          pathType: "cable",
          length: 6,
          sleeving: "none"
        },
        {
          id: "run-12",
          fromConnectorId: "c1",
          toConnectorId: "c2",
          pathType: "wire",
          wirelistManaged: true,
          wireComponentId: "w-22",
          fromLocation: "J1 - 1",
          toLocation: "J2 - 1"
        },
        {
          id: "run-13",
          fromConnectorId: "c1",
          toConnectorId: "c3",
          pathType: "wire",
          wirelistManaged: true,
          wireComponentId: "w-22b",
          fromLocation: "J1 - 1",
          toLocation: "J3 - 1"
        }
      ],
      pinMappings: [],
      bundles: [],
      annotations: []
    } as RevisionDto["snapshot"];

    const trunkDiameter = formatBundleDiameterLabel(bundleDiameterInches([0.062, 0.062]));
    const branchDiameter = formatBundleDiameterLabel(bundleDiameterInches([0.062]));

    render(
      <DetailsSummary
        revisionId="rev-bundle"
        snapshot={snapshot}
        wireCatalog={[wirePart("w-22", "M22759/16-22", 0.062), wirePart("w-22b", "M22759/16-22-BLU", 0.062)]}
        sleeveCatalog={[sleeve("slv-s", "SLV-S", 0.06, 0.09), sleeve("slv-l", "SLV-L", 0.09, 0.2)]}
      />
    );

    expect(screen.getByText(`cable1: c1 -> jx, 12 in, expandable sleeving, ${trunkDiameter}, size SLV-L`)).toBeInTheDocument();
    expect(screen.getByText(`cable2: jx -> c2, 6 in, expandable sleeving, ${branchDiameter}, size SLV-S`)).toBeInTheDocument();
    expect(screen.getByText(`cable3: jx -> c3, 6 in, no sleeving, ${branchDiameter}`)).toBeInTheDocument();
  });
});
