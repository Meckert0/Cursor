import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RevisionDto } from "@/lib/api";
import { WirelistGrid } from "./wirelist-grid";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function snapshot(): RevisionDto["snapshot"] {
  return {
    connectors: [
      {
        id: "c1",
        reference: "J1",
        partNumber: "MOD-1",
        pins: [{ id: "1", number: "1" }]
      }
    ],
    junctions: [],
    paths: [
      {
        id: "p1",
        runNumber: 1,
        wireName: "wire1",
        fromConnectorId: "c1",
        toConnectorId: "",
        pathType: "wire",
        wirelistManaged: true,
        fromLocation: "J1 - 1",
        toLocation: "GONE - 9"
      }
    ],
    pinMappings: [],
    bundles: [],
    annotations: []
  };
}

describe("WirelistGrid locations", () => {
  it("keeps typed locations and only flags them when the verifier is on", () => {
    render(
      <WirelistGrid
        revisionId="rev-wirelist"
        initialSnapshot={snapshot()}
        initialSnapshotHash="hash"
        wireCatalog={[]}
        connectorCatalog={[]}
        importWirelistAction={async () => ({ ok: false, error: "unused" })}
        exportWirelistAction={async () => ({ ok: false, error: "unused" })}
        saveWirelistAction={async () => ({ ok: false, error: "unused" })}
      />
    );

    const fromLocation = document.querySelector<HTMLInputElement>('[data-cell-key="fromLocation"]');
    const toLocation = document.querySelector<HTMLInputElement>('[data-cell-key="toLocation"]');
    expect(fromLocation).toHaveValue("J1 - 1");
    expect(toLocation).toHaveValue("GONE - 9");
    expect(fromLocation).not.toHaveAttribute("list");
    expect(toLocation).not.toHaveAttribute("list");
    expect(document.querySelector("datalist")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    expect(fromLocation).toHaveValue("J1 - 1");
    expect(toLocation).toHaveValue("GONE - 9");
    expect(fromLocation?.closest("td")).not.toHaveAttribute("title");
    expect(toLocation?.closest("td")).toHaveAttribute("title", "Connector name does not exist");
  });
});
