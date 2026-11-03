import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { bundleDiameterInches, formatBundleDiameterLabel, formatCableSectionCanvasLabel } from "@/lib/cable-canvas-utils";
import { CableCanvas } from "./cable-canvas";
import styles from "./cable-canvas.module.css";

const canvasCss = readFileSync(path.resolve(process.cwd(), "src/components/cable-canvas.module.css"), "utf8");

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function wirePart(id: string, partNumber: string, overallDia: number): LibraryComponentDto {
  return {
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
  };
}

function snapshot(): RevisionDto["snapshot"] {
  return {
    connectors: [
      { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }], location: { x: 20, y: 40 } },
      { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }], location: { x: 220, y: 40 } },
      { id: "c3", reference: "J3", pins: [{ id: "1", number: "1" }], location: { x: 420, y: 160 } }
    ],
    junctions: [],
    paths: [
      {
        id: "p1",
        wireName: "cable1",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "cable",
        length: 24,
        sleeving: "expandable_sleeving"
      },
      {
        id: "p2",
        wireName: "cable2",
        fromConnectorId: "c2",
        toConnectorId: "c3",
        pathType: "cable",
        length: 8,
        sleeving: "none"
      },
      {
        id: "run-1",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "wire",
        wirelistManaged: true,
        wireComponentId: "w-22",
        fromLocation: "J1 - 1",
        toLocation: "J2 - 1"
      }
    ],
    pinMappings: [],
    bundles: [],
    annotations: []
  };
}

describe("CableCanvas cable sections", () => {
  it("draws thicker centered labels that include each section bundle diameter", () => {
    const carriedDiameter = formatBundleDiameterLabel(bundleDiameterInches([0.062]));
    render(
      <CableCanvas
        revisionId="rev-cable-labels"
        snapshot={snapshot()}
        snapshotHash="hash"
        connectorCatalog={[]}
        wireCatalog={[wirePart("w-22", "M22759/16-22", 0.062)]}
        quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })}
        readOnly
      />
    );

    const carried = screen.getByTestId("cable-label-p1");
    const empty = screen.getByTestId("cable-label-p2");
    expect(carried).toHaveTextContent(
      formatCableSectionCanvasLabel({
        wireName: "cable1",
        lengthInches: 24,
        sleeving: "expandable_sleeving",
        bundleDiameterIn: bundleDiameterInches([0.062])
      })
    );
    expect(carried).toHaveTextContent(carriedDiameter);
    expect(empty).toHaveTextContent("cable2 - 8 in | no sleeving | bundle dia —");
    expect(carried).toHaveStyle({ left: "180px", top: "68px" });
    expect(empty).toHaveStyle({ left: "380px", top: "128px" });
    expect(carried.className).toContain(styles.cableLabel);
    expect(carried.className).toContain(styles.cableLabelSelected);
    expect(empty.className).not.toContain(styles.cableLabelSelected);
    expect(canvasCss).toContain("transform: translate(-50%, -50%);");
    expect(canvasCss).toContain("background: rgba(255, 255, 255, 0.88);");
    expect(canvasCss).toContain("background: rgba(239, 246, 255, 0.94);");
    expect(canvasCss).toContain("stroke-width: 6;");
    expect(canvasCss).toContain("stroke-width: 8;");

    const lines = document.querySelectorAll('[data-testid="cable-canvas"] svg line');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute("x1")).toBe("80");
    expect(lines[0]?.getAttribute("y1")).toBe("68");
    expect(lines[0]?.getAttribute("x2")).toBe("280");
    expect(lines[0]?.getAttribute("class")).toContain(styles.selectedLine);
    expect(lines[1]?.getAttribute("class")).toBeNull();
  });

  it("keeps the length editor centered on the cable", () => {
    render(
      <CableCanvas
        revisionId="rev-cable-edit"
        snapshot={snapshot()}
        snapshotHash="hash"
        connectorCatalog={[]}
        wireCatalog={[wirePart("w-22", "M22759/16-22", 0.062)]}
        quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })}
      />
    );

    fireEvent.doubleClick(screen.getByTestId("cable-label-p2"));
    const input = screen.getByLabelText("Length in inches for cable2");
    expect(input).toHaveStyle({ left: "380px", top: "128px" });
    expect(input).toHaveValue("8");
    expect(screen.queryByTestId("cable-label-p2")).not.toBeInTheDocument();
  });
});
