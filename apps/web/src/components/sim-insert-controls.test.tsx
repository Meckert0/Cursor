import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LibraryComponentDto } from "@/lib/api";
import type { SimInsertAssignment, SimRelationship } from "@/lib/sim-modules";
import { SimInsertControls } from "./sim-insert-controls";

const host: LibraryComponentDto = {
  id: "host", category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", partNumber: "SIM-HOST", family: "SIM", description: "SIM module",
  attributes: { simSlotCount: 3, simSlotSections: [["A1", "A2"], ["B1"]] },
  isActive: true, isReviewed: true, stockStatus: "in_stock", createdByUserId: "u", createdAt: "2026-01-01", lastEditedByUserId: "u", lastEditedAt: "2026-01-01", updatedAt: "2026-01-01"
};
const insert: LibraryComponentDto = { ...host, id: "pair", partType: "SIM_INSERT", electricalMode: "PASSIVE", partNumber: "SIM-PAIR", description: "Two-slot insert", attributes: { slotOccupancy: 2, pinIds: ["P", "N"] } };
const pair: SimInsertAssignment = { slotId: "A1", occupiedSlotIds: ["A1", "A2"], libraryComponentId: insert.id, partNumber: insert.partNumber, pins: [{ id: "P", number: "P" }, { id: "N", number: "N" }] };
const relationships: SimRelationship[] = [{ parentPartId: host.id, relationshipType: "INSERT_ALLOWED", compatibleParts: [insert.partNumber], parentPositions: [], status: "allowed" }];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

function mount(overrides: Partial<ComponentProps<typeof SimInsertControls>> = {}) {
  const onChoose = vi.fn(), onRemove = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <SimInsertControls host={host} catalog={[host, insert]} relationships={relationships} assignments={[]} reference="J1A" readOnly={false}
      onChoose={onChoose} onRemove={onRemove} {...overrides} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />;
  }
  render(<Harness />);
  const preview = screen.getByRole("button", { name: "Configure SIM inserts for J1A" });
  preview.focus();
  fireEvent.click(preview);
  return { onChoose, onRemove, preview, dialog: screen.getByRole("dialog", { name: "J1A · SIM inserts" }) };
}

describe("SIM module editor", () => {
  it("preserves catalog sections and slot order in the thumbnail and editor and selects empty slots", () => {
    const { dialog, preview, onChoose } = mount();
    const image = within(preview).getByRole("img", { name: "J1A SIM slot layout" });
    expect(Array.from(image.querySelectorAll("text"), text => text.textContent)).toEqual(["A1", "A2", "B1"]);
    const sections = within(dialog).getAllByRole("group", { name: /^SIM section/ });
    expect(within(sections[0]).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["J1A SIM slot A1", "J1A SIM slot A2"]);
    expect(within(sections[1]).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "J1A SIM slot B1" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Select SIM insert B1 for J1A" }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("B1");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(preview).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("edits a multi-slot insert from any covered slot using the insert's starting slot", () => {
    const { dialog, onChoose, onRemove, preview } = mount({ assignments: [pair] });
    expect(preview).toHaveTextContent("2/3 filled");
    fireEvent.click(within(dialog).getByRole("button", { name: "J1A SIM slot A2" }));
    expect(within(dialog).getByRole("heading", { name: "Slots A1, A2" })).toBeVisible();
    expect(within(dialog).getByText(insert.description)).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Select SIM insert A2/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Change SIM insert A1 for J1A" }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("A1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove SIM insert A1 for J1A" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("A1");
  });

  it("keeps incompatible and orphaned inserts visible and removable", () => {
    const orphan = { ...pair, slotId: "C1", occupiedSlotIds: ["C1", "C2"] };
    const { dialog, onRemove, preview } = mount({ assignments: [pair, orphan], relationships: [] });
    expect(preview).toHaveTextContent("0/3 filled · 2 need attention");
    expect(within(dialog).getByText("This insert no longer fits or is not compatible.")).toBeVisible();
    const outside = within(dialog).getByRole("region", { name: "Inserts outside this layout" });
    expect(outside).toHaveTextContent("Slot C1 is no longer available.");
    fireEvent.click(within(outside).getByRole("button", { name: "Remove SIM insert C1 for J1A" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("C1");
  });

  it("allows inspecting occupied and empty slots in read-only mode without editing", () => {
    const { dialog, onChoose, onRemove } = mount({ assignments: [pair], readOnly: true });
    expect(within(dialog).getByRole("button", { name: "Change SIM insert A1 for J1A" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Remove SIM insert A1 for J1A" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "J1A SIM slot B1" }));
    expect(within(dialog).getByRole("button", { name: "Select SIM insert B1 for J1A" })).toBeDisabled();
    expect(onChoose).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("labels the numbered fallback when a host has no catalog layout", () => {
    const { dialog } = mount({ host: { ...host, attributes: { simSlotCount: 2 } } });
    expect(within(dialog).getByText("Physical layout unavailable; showing numbered slots.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "J1A SIM slot 1" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "J1A SIM slot 2" })).toBeVisible();
  });

  it.each([ ["510161130", 16, 56.13, 12.45, [8, 8]], ["510144001", 11, 50, 16, [5, 5, 1]] ] as const)("uses the same VPC geometry in the %s preview and module editor", (partNumber, count, width, height, bankSizes) => {
    const { dialog, preview, onChoose } = mount({ host: { ...host, partNumber, attributes: { simSlotCount: count } } });
    const thumbnail = within(preview).getByRole("img", { name: "J1A SIM slot layout" });
    expect(thumbnail).toHaveAttribute("viewBox", `0 0 ${width} ${height}`);
    expect(dialog.querySelector("svg")).toHaveAttribute("viewBox", thumbnail.getAttribute("viewBox"));
    expect(within(dialog).getByRole("link", { name: "VPC drawing ↗" })).toHaveAttribute("href", `https://www.vpc.com/resources/files/${partNumber}-pdf/`);
    expect(within(dialog).queryByText("Physical layout unavailable; showing numbered slots.")).not.toBeInTheDocument();
    const banks = within(dialog).getAllByRole("group", { name: /^SIM section/ });
    expect(banks.map(bank => within(bank).getAllByRole("button").length)).toEqual(bankSizes);
    const first = within(dialog).getByRole("button", { name: "J1A SIM slot 1", exact: true });
    const nextBank = within(dialog).getByRole("button", { name: `J1A SIM slot ${bankSizes[0] + 1}`, exact: true });
    expect(first.style.left).toBe(nextBank.style.left);
    expect(parseFloat(first.style.top)).toBeLessThan(parseFloat(nextBank.style.top));
    fireEvent.click(nextBank);
    fireEvent.click(within(dialog).getByRole("button", { name: `Select SIM insert ${bankSizes[0] + 1} for J1A` }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(String(bankSizes[0] + 1));
  });

  it("keeps the editor open when the last retained insert is removed from an unavailable host", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [assignments, setAssignments] = useState([pair]);
      return <SimInsertControls assignments={assignments} catalog={[insert]} relationships={[]} reference="J1A" readOnly={false} open={open}
        onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onChoose={vi.fn()} onRemove={() => setAssignments([])} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Configure SIM inserts for J1A" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove SIM insert A1 for J1A" }));
    expect(screen.getByRole("dialog", { name: "J1A · SIM inserts" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure SIM inserts for J1A" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
