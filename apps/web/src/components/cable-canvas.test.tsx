import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("centers compact section labels with accessible names and expandable diameter details", () => {
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
    expect(carried).toHaveAccessibleName(
      formatCableSectionCanvasLabel({
        wireName: "section1",
        lengthInches: 24,
        sleeving: "expandable_sleeving",
        bundleDiameterIn: bundleDiameterInches([0.062])
      })
    );
    const summary = carried.querySelector(`.${styles.cableLabelSummary}`) as HTMLElement;
    expect(within(summary).getByText("24 in")).toBeInTheDocument();
    expect(within(summary).getByText("expandable sleeving")).toBeInTheDocument();
    expect(summary).not.toHaveTextContent("section1");
    expect(summary).not.toHaveTextContent("bundle dia");
    const details = carried.querySelector(`.${styles.cableLabelDetails}`) as HTMLElement;
    expect(within(details).getByText("section1")).toBeInTheDocument();
    expect(details).toHaveTextContent(carriedDiameter);
    expect(empty).toHaveAccessibleName("section2 - 8 in | no sleeving | bundle dia —");
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
    expect(canvasCss).toContain("stroke-width: 12;");
    expect(canvasCss).toContain("stroke-dasharray: 8 4;");
    expect(canvasCss).toContain("stroke-width: 16;");
    expect(canvasCss).toContain("stroke: #1e293b;");

    const sections = document.querySelectorAll("[data-cable-section]");
    expect(sections).toHaveLength(2);
    const expandable = sections[0]?.querySelectorAll("line");
    expect(expandable).toHaveLength(1);
    expect(expandable?.[0]?.getAttribute("x1")).toBe("80");
    expect(expandable?.[0]?.getAttribute("y1")).toBe("68");
    expect(expandable?.[0]?.getAttribute("x2")).toBe("280");
    expect(expandable?.[0]?.getAttribute("class")).toContain(styles.selectedLine);
    expect(expandable?.[0]?.getAttribute("class")).toContain(styles.sleevingExpandable);
    const expandableOutline = sections[0]?.querySelector("rect");
    expect(expandableOutline?.getAttribute("class")).toContain(styles.cableSleeveOutline);
    expect(expandableOutline?.getAttribute("class")).toContain(styles.cableSleeveOutlineSleeved);
    expect(expandableOutline?.getAttribute("class")).toContain(styles.selectedLine);
    expect(expandableOutline?.getAttribute("transform")).toBe("rotate(0 180 68)");
    expect(Number(expandableOutline?.getAttribute("width"))).toBeCloseTo(199);
    expect(Number(expandableOutline?.getAttribute("height"))).toBeCloseTo(15);
    const outlineNodes = sections[0]?.querySelectorAll("line, rect");
    expect(outlineNodes?.[outlineNodes.length - 1]?.tagName).toBe("rect");
    const plain = sections[1]?.querySelectorAll("line");
    expect(plain).toHaveLength(1);
    expect(plain?.[0]?.getAttribute("class")).toBeNull();
    const plainOutline = sections[1]?.querySelector("rect");
    expect(plainOutline?.getAttribute("class")).toContain(styles.cableSleeveOutline);
    expect(plainOutline?.getAttribute("class")).not.toContain(styles.cableSleeveOutlineSleeved);
    expect(canvasCss).toContain(".lines rect.cableSleeveOutline");
    expect(canvasCss).toContain(".lines rect.cableSleeveOutline.cableSleeveOutlineSleeved {\n  stroke: #64748b;");
    expect(canvasCss).toContain("fill: transparent;");
    expect(canvasCss).not.toContain("cableOutlineExpandable");
  });

  it("draws braid-under-sleeving cables as overlapping crosses at twice the thickness", () => {
    const braidSnapshot = snapshot();
    braidSnapshot.paths = [
      {
        id: "p-braid",
        wireName: "cable-braid",
        fromConnectorId: "c1",
        toConnectorId: "c2",
        pathType: "cable",
        length: 10,
        sleeving: "wire_braid_under_expandable_sleeving"
      }
    ];
    render(
      <CableCanvas
        revisionId="rev-cable-braid"
        snapshot={braidSnapshot}
        snapshotHash="hash"
        connectorCatalog={[]}
        quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })}
        readOnly
      />
    );

    const braidLines = [...document.querySelectorAll('[data-testid="cable-canvas"] svg line')].filter((line) =>
      line.getAttribute("class")?.includes(styles.sleevingBraid)
    );
    expect(braidLines.length).toBeGreaterThan(4);
    expect(braidLines.length % 2).toBe(0);
    expect(braidLines[0]?.getAttribute("class")).toContain(styles.selectedLine);
    const outlines = document.querySelectorAll("[data-cable-section] rect");
    expect(outlines).toHaveLength(1);
    expect(outlines[0]?.getAttribute("class")).toContain(styles.cableSleeveOutline);
    expect(outlines[0]?.getAttribute("class")).toContain(styles.cableSleeveOutlineSleeved);
    expect(outlines[0]?.getAttribute("class")).toContain(styles.selectedLine);
    expect(outlines[0]?.getAttribute("class")).not.toContain("cableOutline");
    const ys = braidLines.flatMap((line) => [Number(line.getAttribute("y1")), Number(line.getAttribute("y2"))]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(16);
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
    const input = screen.getByLabelText("Length in inches for section2");
    expect(input).toHaveStyle({ left: "380px", top: "128px" });
    expect(input).toHaveValue("8");
    expect(screen.queryByTestId("cable-label-p2")).not.toBeInTheDocument();
  });

  it("selects a keyboard-focused section before applying Delete", () => {
    render(
      <CableCanvas
        revisionId="rev-section-focus"
        snapshot={snapshot()}
        snapshotHash="hash"
        connectorCatalog={[]}
        quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })}
      />
    );
    fireEvent.focus(screen.getByTestId("cable-label-p2"));
    expect(screen.getByText("Selected: section2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.queryByTestId("cable-label-p2")).not.toBeInTheDocument();
    expect(screen.getByTestId("cable-label-p1")).toBeInTheDocument();
  });

  it("hides the slot name field when a frame has one slot", () => {
    const frameSnapshot = snapshot();
    frameSnapshot.connectors = [
      {
        id: "c1",
        reference: "J1",
        partNumber: "FRAME-1",
        pins: [],
        location: { x: 20, y: 40 },
        slots: [{ slotId: "A", reference: "J1A", pins: [] }]
      },
      {
        id: "c2",
        reference: "J2",
        partNumber: "FRAME-2",
        pins: [],
        location: { x: 220, y: 40 },
        slots: [
          { slotId: "A", reference: "J2A", pins: [] },
          { slotId: "B", reference: "J2B", pins: [] }
        ]
      }
    ];
    render(
      <CableCanvas
        revisionId="rev-single-slot"
        snapshot={frameSnapshot}
        snapshotHash="hash"
        connectorCatalog={[]}
        quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })}
      />
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /J1/ }));
    expect(screen.queryByLabelText("Slot A module name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Define slot A module" })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: /J2/ }));
    expect(screen.getByLabelText("Slot A module name")).toHaveValue("J2A");
    expect(screen.getByLabelText("Slot B module name")).toHaveValue("J2B");
  });
});
