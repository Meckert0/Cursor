import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RevisionDto } from "@/lib/api";
import { WirelistDetailsSection } from "./wirelist-details-section";

afterEach(() => {
  cleanup();
});

const snapshot = {
  connectors: [{ id: "c1", reference: "J1", partNumber: "SAVED-1", pins: [] }],
  junctions: [],
  paths: [],
  pinMappings: [],
  bundles: [],
  annotations: []
} as RevisionDto["snapshot"];

describe("WirelistDetailsSection", () => {
  it("hides the connector details until Show Details is clicked", () => {
    render(<WirelistDetailsSection revisionId="rev-1" snapshot={snapshot} />);

    expect(screen.getByRole("button", { name: "Show Details" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Connectors" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show Details" }));

    expect(screen.getByRole("button", { name: "Hide Details" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Connectors" })).toBeInTheDocument();
    expect(screen.getByText("SAVED-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide Details" }));

    expect(screen.getByRole("button", { name: "Show Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connectors" })).not.toBeInTheDocument();
  });
});
