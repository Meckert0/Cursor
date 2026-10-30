import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { DetailsSummary } from "./details-summary";

function module(partNumber: string, id: string): LibraryComponentDto {
  return {
    id,
    category: "module",
    family: "iCon",
    partNumber,
    description: "Test module",
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
    attributes: { pinCount: 16, contactFamily1: "TP", gender: "ITA" }
  };
}

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
          module("510103", "mod-510"),
          module("MOD-A", "mod-a")
        ]}
      />
    );

    expect(screen.getByText("J1 — 510103")).toBeInTheDocument();
    expect(screen.getByText("J2")).toBeInTheDocument();
    expect(screen.getByText("J2A — MOD-A: 16 TP ITA")).toBeInTheDocument();
    expect(
      screen.getByText("cable1: c_canvas_1 -> c_canvas_2, 24 in, expandable sleeving, bundle dia —")
    ).toBeInTheDocument();
    expect(screen.getByText("J1 -> J2: 24 in")).toBeInTheDocument();
    expect(screen.queryByText(/c_canvas_1\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ sections?/)).not.toBeInTheDocument();
    expect(screen.queryByText("ITA-2")).not.toBeInTheDocument();
    expect(screen.queryByText("410120")).not.toBeInTheDocument();
    expect(screen.queryByText("SR-1")).not.toBeInTheDocument();
    expect(screen.queryByText("BS-9")).not.toBeInTheDocument();
  });
});
