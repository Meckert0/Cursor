import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LibraryComponentDto, PartMediaDto, RevisionDto } from "@/lib/api";
import { CableCanvas } from "./cable-canvas";
import styles from "./cable-canvas.module.css";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function part(id: string): LibraryComponentDto {
  return {
    id, category: "module", partType: "MODULE", partNumber: id.toUpperCase(), family: "Test", description: id,
    isActive: true, isReviewed: true, stockStatus: "unknown", createdByUserId: "u", createdAt: "2026-01-01",
    lastEditedByUserId: "u", lastEditedAt: "2026-01-01", updatedAt: "2026-01-01", attributes: { pinCount: 2 }
  };
}

function media(partId: string, extra: Partial<PartMediaDto> = {}): PartMediaDto {
  return { id: `${partId}-side`, partId, url: `/part-media/${partId}.png`, viewType: "side_profile", mimeType: "image/png", sortOrder: 0, isPrimary: true, pixelWidth: 240, pixelHeight: 80, ...extra };
}

function snapshot(connectors?: RevisionDto["snapshot"]["connectors"]): RevisionDto["snapshot"] {
  return {
    connectors: connectors ?? [{ id: "c1", reference: "J1", libraryComponentId: "one", partNumber: "ONE", pins: [], location: { x: 20, y: 40 } }],
    paths: [], pinMappings: [], bundles: [], annotations: []
  };
}

const catalog = [part("one"), part("two")];

describe("CableCanvas part side profiles", () => {
  it("shows frame artwork for installed modules and shares the module artwork only for standalone iSeries modules", () => {
    const source = { ...part("source"), partNumber: "510161101", family: "iCon/i1" };
    const other = { ...part("other"), partNumber: "510161108", family: "iCon/i1" };
    const frame = { ...part("frame"), category: "frame" as const, partType: "ITA", family: "iCon", partNumber: "410123101" };
    const framed = snapshot([
      { id: "f", reference: "F1", libraryComponentId: frame.id, partNumber: frame.partNumber, pins: [], slots: [{ slotId: "A", reference: "F1A", libraryComponentId: other.id, partNumber: other.partNumber, pins: [] }] },
      { id: "m", reference: "J1", libraryComponentId: other.id, partNumber: other.partNumber, pins: [] }
    ]);
    render(<CableCanvas revisionId="shared-module" snapshot={framed} snapshotHash="hash" connectorCatalog={[source, other, frame]}
      sideProfileMedia={[media(source.id), media(frame.id)]} quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: [] })} readOnly />);
    const frameNode = screen.getByRole("button", { name: "Frame F1" });
    expect(new URL((within(frameNode).getByRole("img") as HTMLImageElement).src).pathname).toBe("/part-media/frame.png");
    const moduleNode = screen.getByRole("button", { name: "Connector J1" });
    expect(new URL((within(moduleNode).getByRole("img") as HTMLImageElement).src).pathname).toBe("/part-media/source.png");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("flips only the image left/right with the cable, moves its exit handle, and restores direction on undo", () => {
    const connected = snapshot([
      { id: "c1", reference: "J1", libraryComponentId: "one", pins: [], location: { x: 100, y: 40 } },
      { id: "c2", reference: "J2", libraryComponentId: "one", pins: [], location: { x: 300, y: 300 } }
    ]);
    connected.paths = [{ id: "section", fromConnectorId: "c1", toConnectorId: "c2", pathType: "cable", length: 10 }];
    const profile = media("one", { url: "/part-media/vpc-side-profiles/v2/510161101.png", orientation: "cable_exit_right", pixelWidth: 100, pixelHeight: 200 });
    render(<CableCanvas revisionId="flip-geometry" snapshot={connected} snapshotHash="hash" connectorCatalog={catalog}
      sideProfileMedia={[profile]} quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: catalog })} />);
    const first = screen.getByRole("button", { name: "Connector J1" });
    const second = screen.getByRole("button", { name: "Connector J2" });
    const firstImage = within(first).getByRole("img");
    const secondImage = within(second).getByRole("img");
    expect(firstImage).toHaveAttribute("data-cable-exit", "right");
    expect(secondImage).toHaveAttribute("data-cable-exit", "left");
    expect(secondImage).toHaveStyle({ transform: "scaleX(-1)" });
    expect(within(second).getByText("J2")).not.toHaveStyle({ transform: "scaleX(-1)" });
    expect(within(second).getByText("+")).toHaveStyle({ left: "33.6px", top: "60px" });
    const canvas = screen.getByTestId("cable-canvas");
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 600, 700);
    second.getBoundingClientRect = () => new DOMRect(300, 300, 120, 120);
    fireEvent(second, new MouseEvent("pointerdown", { bubbles: true, clientX: 310, clientY: 310 }));
    fireEvent(window, new MouseEvent("pointermove", { clientX: 0, clientY: 450 }));
    fireEvent(window, new MouseEvent("pointerup"));
    expect(firstImage).toHaveAttribute("data-cable-exit", "left");
    expect(secondImage).toHaveAttribute("data-cable-exit", "right");
    expect(secondImage.style.transform).not.toContain("rotate");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(firstImage).toHaveAttribute("data-cable-exit", "right");
    expect(secondImage).toHaveAttribute("data-cable-exit", "left");
  });

  it("uses the primary side profile while retaining selection and cable handles", () => {
    render(<CableCanvas revisionId="media-primary" snapshot={snapshot()} snapshotHash="hash" connectorCatalog={catalog}
      sideProfileMedia={[
        media("one", { id: "other", url: "/part-media/other.png", isPrimary: false, sortOrder: 0 }),
        media("one", { id: "face", url: "/part-media/face.png", viewType: "mating_face" }),
        media("one", { sortOrder: 10, altText: "ONE transparent side profile" })
      ]} quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: catalog })} />);
    const connector = screen.getByRole("button", { name: "Connector J1" });
    const image = within(connector).getByRole("img", { name: "ONE transparent side profile" });
    expect(new URL((image as HTMLImageElement).src).pathname).toBe("/part-media/one.png");
    expect(image).toHaveAttribute("width", "240");
    expect(image).toHaveAttribute("height", "80");
    expect(image).toHaveAttribute("draggable", "false");
    expect(connector).toHaveClass(styles.connectorWithProfile);
    expect(within(connector).getByText("+")).toBeVisible();
    expect(within(connector).getByText("J1")).toBeVisible();
    fireEvent.pointerDown(connector);
    expect(connector).toHaveClass(styles.selectedNode);
    expect(screen.getByLabelText("Connector name")).toHaveValue("J1");
  });

  it("replaces the image when another part is chosen and restores it on undo", () => {
    render(<CableCanvas revisionId="media-swap" snapshot={snapshot()} snapshotHash="hash" connectorCatalog={catalog}
      sideProfileMedia={[media("one"), media("two")]}
      quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: catalog })} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Connector J1" }));
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole("button", { name: "Change connector" }));
    const dialog = screen.getByRole("dialog", { name: "Define Connector" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Preview TWO" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Use connector/ }));
    expect(new URL((screen.getByRole("img", { name: "TWO side profile" }) as HTMLImageElement).src).pathname).toBe("/part-media/two.png");
    expect(screen.queryByRole("img", { name: "ONE side profile" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(new URL((screen.getByRole("img", { name: "ONE side profile" }) as HTMLImageElement).src).pathname).toBe("/part-media/one.png");
  });

  it("tries another side view after a failed image and falls back to the node when none load", () => {
    render(<CableCanvas revisionId="media-error" snapshot={snapshot()} snapshotHash="hash" connectorCatalog={catalog}
      sideProfileMedia={[media("one"), media("one", { id: "backup", url: "/part-media/backup.png", isPrimary: false })]}
      quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: catalog })} />);
    fireEvent.error(screen.getByRole("img"));
    expect(new URL((screen.getByRole("img") as HTMLImageElement).src).pathname).toBe("/part-media/backup.png");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const connector = screen.getByRole("button", { name: "Connector J1" });
    expect(connector).not.toHaveClass(styles.connectorWithProfile);
    expect(within(connector).getByText("c1")).toBeVisible();
    expect(within(connector).getByText("+")).toBeVisible();
  });

  it("matches a legacy part number only when the catalog identity is unambiguous", () => {
    render(<CableCanvas revisionId="media-legacy" snapshot={snapshot([
      { id: "legacy", reference: "J1", partNumber: "ONE", pins: [] },
      { id: "ambiguous", reference: "J2", partNumber: "TWO", pins: [] },
      { id: "missing", reference: "J3", libraryComponentId: "missing", partNumber: "ONE", pins: [] }
    ])} snapshotHash="hash" connectorCatalog={[...catalog, { ...part("duplicate"), partNumber: "TWO" }]}
      sideProfileMedia={[media("one"), media("two")]}
      quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: catalog })} readOnly />);
    expect(new URL((within(screen.getByRole("button", { name: "Connector J1" })).getByRole("img") as HTMLImageElement).src).pathname).toBe("/part-media/one.png");
    expect(within(screen.getByRole("button", { name: "Connector J2" })).queryByRole("img")).not.toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Connector J3" })).queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps cable endpoints centered as a profile is dragged, undone, and replaced by a fallback", () => {
    const connected = snapshot([
      { id: "c1", reference: "J1", libraryComponentId: "one", partNumber: "ONE", pins: [], location: { x: 20, y: 40 } },
      { id: "c2", reference: "J2", pins: [], location: { x: 220, y: 40 } }
    ]);
    connected.paths = [{ id: "section", fromConnectorId: "c1", toConnectorId: "c2", pathType: "cable", length: 10, sleeving: "none" }];
    render(<CableCanvas revisionId="media-geometry" snapshot={connected} snapshotHash="hash" connectorCatalog={catalog}
      sideProfileMedia={[media("one")]}
      quickAddConnectorAction={async () => ({ ok: true, connectorCatalog: catalog })} />);
    const canvas = screen.getByTestId("cable-canvas");
    const connector = screen.getByRole("button", { name: "Connector J1" });
    const line = () => canvas.querySelector('[data-cable-section="section"] > line')!;
    expect(connector).toHaveStyle({ height: "120px" });
    expect(line()).toHaveAttribute("x1", "80");
    expect(line()).toHaveAttribute("y1", "100");
    expect(line()).toHaveAttribute("y2", "68");

    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
    connector.getBoundingClientRect = () => new DOMRect(20, 40, 120, 120);
    fireEvent(connector, new MouseEvent("pointerdown", { bubbles: true, clientX: 30, clientY: 50 }));
    fireEvent(window, new MouseEvent("pointermove", { clientX: 1000, clientY: 1000 }));
    fireEvent(window, new MouseEvent("pointerup"));
    expect(connector).toHaveStyle({ left: "280px", top: "180px" });
    expect(line()).toHaveAttribute("x1", "340");
    expect(line()).toHaveAttribute("y1", "240");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(connector).toHaveStyle({ left: "20px", top: "40px" });
    expect(line()).toHaveAttribute("y1", "100");

    const reference = within(connector).getByText("J1");
    expect(reference).not.toHaveClass(styles.connectorProfileReferenceBelow);
    fireEvent(connector, new MouseEvent("pointerdown", { bubbles: true, clientX: 30, clientY: 50 }));
    fireEvent(window, new MouseEvent("pointermove", { clientX: 30, clientY: 0 }));
    fireEvent(window, new MouseEvent("pointerup"));
    expect(connector).toHaveStyle({ top: "0px" });
    expect(reference).toHaveClass(styles.connectorProfileReferenceBelow);
    expect(line()).toHaveAttribute("y1", "60");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(reference).not.toHaveClass(styles.connectorProfileReferenceBelow);
    fireEvent.error(screen.getByRole("img"));
    expect(connector).not.toHaveClass(styles.connectorWithProfile);
    expect(line()).toHaveAttribute("y1", "68");
  });
});
