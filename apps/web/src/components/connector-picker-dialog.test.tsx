import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryComponentDto } from "@/lib/api";
import { ConnectorPickerDialog } from "./connector-picker-dialog";

function part(id: string, overrides: Partial<LibraryComponentDto> = {}): LibraryComponentDto {
  return {
    id, category: "module", partType: "MODULE", partNumber: id, description: "Signal module", family: "i1", side: "ITA",
    isActive: true, isReviewed: true, stockStatus: "in_stock", attributes: { positionCount: 96 },
    createdByUserId: "u1", createdAt: "2026-01-01", lastEditedByUserId: "u1", lastEditedAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides
  };
}
const parts = [part("MOD-096"), part("MOD-064", { family: "iCon", description: "Power module", attributes: { positionCount: 64 } })];
const create = async () => ({ ok: true, connectorCatalog: parts });

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(overrides: Partial<React.ComponentProps<typeof ConnectorPickerDialog>> = {}) {
  const onSelect = vi.fn(), onClose = vi.fn();
  render(<ConnectorPickerDialog parts={parts} destination="J3" onCreatePart={create} onSelect={onSelect} onClose={onClose} {...overrides} />);
  return { onSelect, onClose, dialog: screen.getByRole("dialog", { name: "Define Connector" }) };
}
const tableRows = () => within(screen.getByRole("table", { name: "Parts matching your search" })).getAllByRole("row").slice(1);

describe("ConnectorPickerDialog", () => {
  it("previews without applying, confirms once, and starts with confirmation disabled", () => {
    const { onSelect } = mount();
    const confirm = screen.getByRole("button", { name: /^Use connector/ });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Preview MOD-096" }));
    expect(screen.getByRole("region", { name: "Selected part specifications" })).toHaveTextContent("MOD-096");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(parts[0]);
  });

  it("clears a selection when discovery changes and cannot resurrect it after clearing search", () => {
    const { onSelect } = mount();
    fireEvent.click(screen.getByRole("radio", { name: "Preview MOD-096" }));
    fireEvent.change(screen.getByLabelText("Search the parts library"), { target: { value: "does-not-exist" } });
    expect(screen.getByRole("button", { name: /^Use connector/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Filter Positions" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: /^Use connector/ })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sorts and filters Description independently from the part number", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sort Description ascending" }));
    expect(tableRows()[0]).toHaveTextContent("MOD-064");
    fireEvent.click(screen.getByRole("button", { name: "Sort Description descending" }));
    expect(tableRows()[0]).toHaveTextContent("MOD-096");
    fireEvent.click(screen.getByRole("button", { name: "Filter Description" }));
    const menu = screen.getByRole("dialog", { name: "Description options" });
    fireEvent.change(within(menu).getByLabelText("Description"), { target: { value: "power" } });
    fireEvent.click(within(menu).getByRole("button", { name: "Apply filter" }));
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toHaveTextContent("MOD-064");
  });

  it("shares applied values between top filters and column menus and discards an un-applied draft", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Family filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /i1/ }));
    expect(tableRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(tableRows()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Family filter" })).toHaveTextContent("i1");
    fireEvent.click(screen.getByRole("button", { name: "Filter Family" }));
    expect(screen.getByRole("checkbox", { name: /i1/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /iCon/ }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Define Connector" }), { key: "Escape" });
    expect(tableRows()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Filter Family" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(tableRows()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Family filter" })).toHaveTextContent("Any");
  });

  it("retains hidden column conditions and gives optional fields both controls", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Filter Review status" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Reviewed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Review status" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Module capacity" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply columns" }));
    expect(screen.queryByRole("button", { name: "Filter Review status" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Review status filter" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sort Module capacity ascending" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Filter Module capacity" })).toBeVisible();
  });

  it("preserves search when resetting filters, but Clear all removes both", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Search the parts library"), { target: { value: "module" } });
    fireEvent.click(screen.getByRole("button", { name: "Family filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /i1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByLabelText("Search the parts library")).toHaveValue("module");
    expect(tableRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Family filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /i1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByLabelText("Search the parts library")).toHaveValue("");
  });

  it("rejects reversed ranges without replacing applied results", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Positions filter" }));
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Minimum must be less than or equal to maximum");
    expect(tableRows()).toHaveLength(2);
  });

  it("retains slot context and uses explicit same-side and opposite-side modes", () => {
    const onReverseChange = vi.fn();
    render(<ConnectorPickerDialog parts={parts} destination="J3" slot={{ slotId: "A", framePartNumber: "FRAME-6", reverse: false, onReverseChange }} onCreatePart={create} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Select slot A module" })).toHaveTextContent("FRAME-6");
    expect(screen.getByRole("button", { name: "Type filter" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "+ Add new connector" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opposite-side modules" }));
    expect(onReverseChange).toHaveBeenCalledWith(true);
  });

  it("does not allow read-only application or creation", () => {
    const { onSelect } = mount({ readOnly: true });
    expect(screen.getByRole("radio", { name: "Preview MOD-096" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Add new connector" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Use connector/ })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("paginates a larger catalog and clears pending selection when paging", () => {
    mount({ parts: Array.from({ length: 51 }, (_, index) => part(`MOD-${index + 1}`)) });
    expect(tableRows()).toHaveLength(50);
    fireEvent.click(screen.getByRole("radio", { name: "Preview MOD-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toHaveTextContent("MOD-51");
    expect(screen.getByRole("button", { name: /^Use connector/ })).toBeDisabled();
  });

  it("adds a part to the catalog, then requires explicit confirmation to apply it", async () => {
    const created = part("NEW-123");
    const onSelect = vi.fn();
    const onCreate = vi.fn(async (data: FormData) => {
      expect(data.get("partNumber")).toBe("NEW-123");
      return { ok: true, connectorCatalog: [...parts, created], newConnectorPartNumber: created.partNumber };
    });
    function Harness() {
      const [catalog, setCatalog] = useState(parts);
      return <ConnectorPickerDialog parts={catalog} destination="J3" onSelect={onSelect} onClose={vi.fn()} onCreatePart={async data => { const result = await onCreate(data); setCatalog(result.connectorCatalog); return result; }} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add new connector" }));
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: "NEW-123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Add connector" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Preview NEW-123" })).toBeChecked());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Use connector/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(created);
  });

  it("reports quick-add failures inside the form and preserves search on Back", async () => {
    mount({ onCreatePart: async () => { throw new Error("Catalog unavailable"); } });
    fireEvent.change(screen.getByLabelText("Search the parts library"), { target: { value: "MOD-096" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add new connector" }));
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: "NEW" } });
    fireEvent.submit(screen.getByRole("button", { name: "Add connector" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Catalog unavailable"));
    fireEvent.click(screen.getAllByRole("button", { name: "Back to results" }).at(-1)!);
    expect(screen.getByLabelText("Search the parts library")).toHaveValue("MOD-096");
  });

  it("restores focus and background scrolling when the picker closes", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open picker</button>{open ? <ConnectorPickerDialog parts={parts} destination="J3" onCreatePart={create} onSelect={vi.fn()} onClose={() => setOpen(false)} /> : null}</>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open picker" });
    trigger.focus(); fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });
});
