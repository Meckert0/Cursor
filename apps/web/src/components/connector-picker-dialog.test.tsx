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
afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });

function mount(overrides: Partial<React.ComponentProps<typeof ConnectorPickerDialog>> = {}) {
  const onSelect = vi.fn(), onClose = vi.fn();
  render(<ConnectorPickerDialog parts={parts} destination="J3" onCreatePart={create} onSelect={onSelect} onClose={onClose} {...overrides} />);
  return { onSelect, onClose, dialog: screen.getByRole("dialog", { name: overrides.mode === "sim-insert" ? "Select SIM insert" : overrides.mode === "frame" ? "Define Frame" : "Define Connector" }) };
}
const tableRows = () => within(screen.getByRole("table", { name: "Parts matching your search" })).getAllByRole("row").slice(1);

describe("ConnectorPickerDialog", () => {
  it("removes the redundant top dropdowns while retaining column sorting and filtering", () => {
    mount();
    const options = within(screen.getByRole("group", { name: "Filter and column options" }));
    for (const name of ["Type filter", "Positions filter", "Availability filter"]) expect(options.queryByRole("button", { name })).not.toBeInTheDocument();
    for (const name of ["Positions", "Availability"]) {
      expect(screen.getByRole("button", { name: `Sort ${name} ascending` })).toBeVisible();
      expect(screen.getByRole("button", { name: `Filter ${name}` })).toBeVisible();
    }
  });
  it("resizes and reorders columns with keyboard controls while retaining the selected part", () => {
    const { onSelect } = mount();
    fireEvent.click(screen.getByRole("radio", { name: "Preview MOD-096" }));
    const resize = screen.getByRole("separator", { name: "Resize Description column" });
    const width = Number(resize.getAttribute("aria-valuenow"));
    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(resize).toHaveAttribute("aria-valuenow", String(width + 10));
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Description column" }), { key: "ArrowLeft" });
    const headers = screen.getByRole("table").querySelectorAll<HTMLElement>("th[data-picker-column]");
    expect(Array.from(headers, header => header.dataset.pickerColumn).slice(0, 2)).toEqual(["description", "partNumber"]);
    expect(screen.getByRole("radio", { name: "Preview MOD-096" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Filter Description" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Use connector/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(parts[0]);
  });
  it("restores customized columns when reopened and resets the layout without resetting search", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open picker</button>{open ? <ConnectorPickerDialog parts={parts} destination="J3" onCreatePart={create} onSelect={vi.fn()} onClose={() => setOpen(false)} /> : null}</>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open picker" }));
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize Description column" }), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Description column" }), { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Open picker" }));
    expect(screen.getByRole("separator", { name: "Resize Description column" })).toHaveAttribute("aria-valuenow", "295");
    expect(screen.getByRole("table").querySelector("th[data-picker-column]")).toHaveAttribute("data-picker-column", "description");
    fireEvent.change(screen.getByLabelText("Search the parts library"), { target: { value: "MOD" } });
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    expect(screen.getByRole("separator", { name: "Resize Description column" })).toHaveAttribute("aria-valuenow", "245");
    expect(screen.getByRole("table").querySelector("th[data-picker-column]")).toHaveAttribute("data-picker-column", "partNumber");
    expect(screen.getByLabelText("Search the parts library")).toHaveValue("MOD");
  });
  it("filters blank filler modules by their Blank insert family", () => {
    mount({ parts: [...parts, part("BLANK-MODULE", { description: "Blank module", family: "ITA/RCV", side: "DUAL", attributes: { positionCount: 0 } })] });
    fireEvent.click(screen.getByRole("button", { name: "Family filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Blank insert 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toHaveTextContent("BLANK-MODULE");
    expect(tableRows()[0]).toHaveTextContent("Blank insert");
    expect(tableRows()[0]).toHaveTextContent("ITA & Receiver");
  });
  it("shares ITA and Receiver membership between top and column Side filters", () => {
    mount({ parts: [part("ITA-ONLY"), part("RCV-ONLY", { side: "RECEIVER" }), part("SHARED", { side: "DUAL" })] });
    fireEvent.click(screen.getByRole("button", { name: "Side filter" }));
    expect(screen.queryByRole("checkbox", { name: /Dual|ITA & Receiver/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "ITA 2", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(tableRows().map(row => within(row).getByRole("radio").getAttribute("aria-label"))).toEqual(["Preview ITA-ONLY", "Preview SHARED"]);
    expect(tableRows()[1]).toHaveTextContent("ITA & Receiver");
    fireEvent.click(screen.getByRole("button", { name: "Filter Side" }));
    expect(screen.getByRole("checkbox", { name: "ITA 2", exact: true })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "ITA 2", exact: true }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Receiver 2", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(screen.getByRole("button", { name: "Side filter" })).toHaveTextContent("Receiver");
    expect(tableRows().map(row => within(row).getByRole("radio").getAttribute("aria-label"))).toEqual(["Preview RCV-ONLY", "Preview SHARED"]);
    fireEvent.click(screen.getByRole("button", { name: "Side filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "ITA 2", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(tableRows()).toHaveLength(3);
  });
  it("limits SIM slot selection to inserts and includes sortable occupancy without offering host creation", () => {
    const insert = part("SIM-PAIR", { partType: "SIM_INSERT", attributes: { slotOccupancy: 2, pinCount: 4 } });
    const { onSelect } = mount({ mode: "sim-insert", parts: [...parts, insert, part("FRAME", { category: "frame", partType: "ITA" })] });
    expect(tableRows()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sort Slots occupied ascending" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Add new/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(tableRows()).toHaveLength(1);
    fireEvent.click(screen.getByRole("radio", { name: "Preview SIM-PAIR" }));
    fireEvent.click(screen.getByRole("button", { name: /^Use SIM insert/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(insert);
  });
  it.each(["connector", "frame"] as const)("restricts the %s picker independently of search and user filters", mode => {
    const catalog = [
      ...parts,
      part("ITA-FRAME", { category: "frame", partType: "ITA", description: "ITA housing", attributes: { moduleCapacity: 6 } }),
      part("RCV-FRAME", { category: "frame", partType: "RECEIVER", description: "Receiver housing", attributes: { moduleCapacity: 4 } }),
      part("SIM-INSERT", { partType: "SIM_INSERT" })
    ];
    mount({ mode, parts: catalog });
    expect(tableRows()).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: "Preview SIM-INSERT" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: `Preview ${mode === "frame" ? "MOD-096" : "ITA-FRAME"}` })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: `Preview ${mode === "frame" ? "ITA-FRAME" : "MOD-096"}` })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search the parts library"), { target: { value: mode === "frame" ? "MOD-096" : "ITA-FRAME" } });
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(tableRows()).toHaveLength(2);
    if (mode === "frame") {
      expect(screen.getByRole("button", { name: "Module capacity filter" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "+ Add new connector" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Filter Type" }));
      expect(screen.queryByRole("checkbox", { name: /^Module/ })).not.toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: /^ITA housing/ })).toBeVisible();
      expect(screen.getByRole("checkbox", { name: /^Receiver housing/ })).toBeVisible();
    }
  });

  it("creates and selects the frame when a connector has the same part number", async () => {
    const connector = part("same-module", { partNumber: "SAME-123" });
    const frame = part("new-frame", { partNumber: "SAME-123", category: "frame", partType: "RECEIVER", attributes: { moduleCapacity: 2 } });
    const onSelect = vi.fn();
    function Harness() {
      const [catalog, setCatalog] = useState([connector]);
      return <ConnectorPickerDialog mode="frame" parts={catalog} destination="J1" onClose={vi.fn()} onSelect={onSelect} onCreatePart={async data => {
        expect(data.get("category")).toBe("frame");
        expect(data.get("partType")).toBe("RECEIVER");
        expect(data.get("attr:moduleCapacity")).toBe("2");
        setCatalog([connector, frame]);
        return { ok: true, connectorCatalog: [connector, frame], newConnectorPartNumber: "SAME-123" };
      }} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add new frame" }));
    fireEvent.change(screen.getByLabelText("Housing type"), { target: { value: "RECEIVER" } });
    fireEvent.change(screen.getByLabelText("Part number"), { target: { value: "SAME-123" } });
    fireEvent.change(screen.getByLabelText("Module capacity"), { target: { value: "2" } });
    fireEvent.submit(screen.getByRole("button", { name: "Add frame" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Preview SAME-123" })).toBeChecked());
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toHaveTextContent("Receiver housing");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Use frame/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(frame);
  });
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
    fireEvent.click(screen.getByRole("button", { name: "Filter Positions" }));
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filter" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Minimum must be less than or equal to maximum");
    expect(tableRows()).toHaveLength(2);
  });

  it("retains slot context and uses explicit same-side and opposite-side modes", () => {
    const onReverseChange = vi.fn();
    render(<ConnectorPickerDialog mode="frame" parts={[...parts, part("FRAME", { category: "frame", partType: "ITA" })]} destination="J3" slot={{ slotId: "A", framePartNumber: "FRAME-6", reverse: false, onReverseChange }} onCreatePart={create} onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Select slot A module" })).toHaveTextContent("FRAME-6");
    expect(screen.queryByRole("button", { name: "Type filter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Preview FRAME" })).not.toBeInTheDocument();
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
