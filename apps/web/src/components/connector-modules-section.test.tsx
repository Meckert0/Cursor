import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { canvasDraftStorageKey } from "@/lib/cable-canvas-utils";
import { ConnectorModulesSection } from "./connector-modules-section";
import { CableCanvas } from "./cable-canvas";
import { DetailsSummary } from "./details-summary";
import { WirelistDetailsSection } from "./wirelist-details-section";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const snapshot = {
  connectors: [{ id: "c1", reference: "J1", partNumber: "SAVED-1", pins: [] }],
  junctions: [],
  paths: [],
  pinMappings: [],
  bundles: [],
  annotations: []
} as RevisionDto["snapshot"];

describe("ConnectorModulesSection", () => {
  it("uses the unsaved canvas draft so the wirelist page matches the canvas", () => {
    window.localStorage.setItem(
      canvasDraftStorageKey("rev-draft"),
      JSON.stringify({
        connectors: [
          { id: "c1", reference: "J1", partNumber: "DRAFT-1", pins: [] },
          { id: "c2", reference: "A5", pins: [] }
        ],
        junctions: [],
        paths: [],
        positions: {},
        dirty: true
      })
    );

    render(<ConnectorModulesSection revisionId="rev-draft" snapshot={snapshot} />);

    expect(screen.getAllByRole("article").map((module) => module.getAttribute("aria-label"))).toEqual([
      "Module A5",
      "Module J1"
    ]);
    expect(screen.getByText("DRAFT-1")).toBeInTheDocument();
    expect(screen.queryByText("SAVED-1")).not.toBeInTheDocument();
    expect(screen.getByText("No part selected")).toBeInTheDocument();
    expect(screen.getByText("No module selected.")).toBeInTheDocument();
  });

  it("shows an empty message without connectors", () => {
    render(<ConnectorModulesSection revisionId="rev-empty" snapshot={{ ...snapshot, connectors: [] }} />);
    expect(screen.getByText("No connectors yet.")).toBeInTheDocument();
  });

  it.each(["details", "canvas", "wirelist"] as const)("shows A1–D40 in the %s details", (view) => {
    const positions = ["A", "B", "C", "D"].flatMap((letter) =>
      Array.from({ length: 40 }, (_, index) => `${letter}${index + 1}`)
    );
    const component: LibraryComponentDto = {
      id: "mod-160",
      category: "module",
      family: "iCon",
      partNumber: "MOD-160",
      description: "160-position module",
      isActive: true,
      isReviewed: true,
      stockStatus: "in_stock",
      createdByUserId: "u1",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastEditedByUserId: "u1",
      lastEditedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      attributes: { pinCount: 160, pinIds: positions }
    };
    const props = {
      revisionId: `rev-ranges-${view}`,
      snapshot: {
        ...snapshot,
        connectors: [{ id: "c1", reference: "J1", partNumber: component.partNumber, pins: [] }]
      },
      connectorCatalog: [component],
      contactCatalog: [
        { ...component, id: "cnt-1", category: "contact", partNumber: "CNT-1" },
        { ...component, id: "cnt-2", category: "contact", partNumber: "CNT-2" }
      ],
      contactRelationships: [
        {
          parentPartId: component.id,
          compatibleParts: ["CNT-1"],
          parentPositions: positions,
          status: "allowed" as const
        },
        {
          parentPartId: component.id,
          compatibleParts: ["CNT-2"],
          parentPositions: ["A1", "A2", "B1", "B2"],
          status: "allowed" as const
        }
      ]
    };
    if (view === "canvas") {
      render(
        <CableCanvas
          {...props}
          snapshotHash="hash"
          wireCatalog={[]}
          quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })}
          readOnly
        />
      );
    } else if (view === "wirelist") {
      render(<WirelistDetailsSection {...props} />);
    } else {
      render(<DetailsSummary {...props} />);
    }
    if (view !== "details") {
      fireEvent.click(screen.getByRole("button", { name: "Show Details" }));
    }
    const table = screen.getByRole("table", { name: "Compatible contacts for J1" });
    expect(within(table).getByRole("cell", { name: "A1–D40", exact: true })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "A1–A2, B1–B2", exact: true })).toBeInTheDocument();
    expect(table).not.toHaveTextContent("A1–A40, B1–B40");
  });
});
