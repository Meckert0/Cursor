import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditablePageHeader } from "./editable-page-header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
const copy = { title: "Harness {harnessName}", description: "Current revision {revisionNumber}" };

describe("editable page headers", () => {
  it("regular users see record values without rename controls", () => {
    const saveAction = vi.fn();
    render(<EditablePageHeader pageKey="canvas" copy={copy} values={{ harnessName: "J1", revisionNumber: 2 }} canEdit={false} saveAction={saveAction} />);
    const title = screen.getByRole("heading", { name: "Harness J1" });
    expect(title).not.toHaveAttribute("tabindex");
    fireEvent.contextMenu(title);
    fireEvent.keyDown(title, { key: "F10", shiftKey: true });
    fireEvent.contextMenu(screen.getByText("Current revision 2"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("admins can right-click to rename and save only changed fields", async () => {
    const saveAction = vi.fn().mockResolvedValue({ ok: true, copy: { ...copy, title: "Harness designer" } });
    render(<EditablePageHeader pageKey="canvas" copy={copy} canEdit saveAction={saveAction} />);
    const title = screen.getByRole("heading", { level: 1 });
    fireEvent.contextMenu(title);
    expect(screen.getByLabelText("Page title")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Page title"), { target: { value: "  Harness designer  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saveAction).toHaveBeenCalledWith("canvas", { title: "Harness designer" });
    expect(title).toHaveFocus();
    expect(title).toHaveTextContent("Harness designer");
  });

  it("keyboard access focuses the description and cancellation does not save", () => {
    const saveAction = vi.fn();
    render(<EditablePageHeader pageKey="canvas" copy={copy} canEdit saveAction={saveAction} />);
    const description = screen.getByText(copy.description);
    fireEvent.keyDown(description, { key: "F10", shiftKey: true });
    expect(screen.getByLabelText("Page description")).toHaveFocus();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveAction).not.toHaveBeenCalled();
    expect(description).toHaveFocus();
  });

  it("keeps edits open after save errors and permits empty descriptions", async () => {
    const saveAction = vi.fn().mockResolvedValue({ ok: false, error: "Save failed" });
    render(<EditablePageHeader pageKey="canvas" copy={copy} canEdit saveAction={saveAction} />);
    fireEvent.contextMenu(screen.getByRole("heading", { level: 1 }));
    fireEvent.change(screen.getByLabelText("Page description"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByLabelText("Page description")).toHaveValue("");
    expect(saveAction).toHaveBeenCalledWith("canvas", { description: "" });
  });
});
