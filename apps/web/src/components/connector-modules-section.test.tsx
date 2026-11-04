import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RevisionDto } from "@/lib/api";
import { canvasDraftStorageKey } from "@/lib/cable-canvas-utils";
import { ConnectorModulesSection } from "./connector-modules-section";

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
    expect(screen.getByText("Select a module on the canvas to see compatible contacts.")).toBeInTheDocument();
  });

  it("shows an empty message without connectors", () => {
    render(<ConnectorModulesSection revisionId="rev-empty" snapshot={{ ...snapshot, connectors: [] }} />);
    expect(screen.getByText("No connectors yet.")).toBeInTheDocument();
  });
});
