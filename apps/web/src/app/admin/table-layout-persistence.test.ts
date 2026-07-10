import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTableLayoutStorageKey,
  pickLatestTableLayout,
  readLocalTableLayoutSnapshot,
  writeLocalTableLayoutSnapshot
} from "./table-layout-persistence";

describe("table layout persistence helpers", () => {
  const scope = "admin_item_database_wire";
  const editScope = "admin_item_database_edit_fields_wire";

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips local snapshot by scope key", () => {
    writeLocalTableLayoutSnapshot(scope, {
      columnOrder: ["partNumber", "family"],
      columnWidths: { partNumber: 180, family: 150 },
      savedAt: 12345
    });

    expect(readLocalTableLayoutSnapshot(scope)).toEqual({
      columnOrder: ["partNumber", "family"],
      columnWidths: { partNumber: 180, family: 150 },
      savedAt: 12345
    });
  });

  it("round-trips modal field-order snapshots with empty widths", () => {
    writeLocalTableLayoutSnapshot(editScope, {
      columnOrder: ["partNumber", "family", "awg"],
      columnWidths: {},
      savedAt: 555
    });
    expect(readLocalTableLayoutSnapshot(editScope)).toEqual({
      columnOrder: ["partNumber", "family", "awg"],
      columnWidths: {},
      savedAt: 555
    });
  });

  it("ignores malformed local snapshot payloads", () => {
    window.localStorage.setItem(getTableLayoutStorageKey(scope), JSON.stringify({ nope: true }));
    expect(readLocalTableLayoutSnapshot(scope)).toBeNull();
  });

  it("prefers local layout when it is newer than remote", () => {
    const latest = pickLatestTableLayout(
      {
        columnOrder: ["partNumber", "family"],
        columnWidths: { family: 199 },
        savedAt: Date.parse("2026-05-19T12:00:00.000Z")
      },
      {
        columnOrder: ["partNumber", "description"],
        columnWidths: { description: 220 },
        updatedAt: "2026-05-19T11:59:00.000Z"
      }
    );
    expect(latest).toEqual({
      columnOrder: ["partNumber", "family"],
      columnWidths: { family: 199 }
    });
  });

  it("prefers remote layout when remote timestamp is newer", () => {
    const latest = pickLatestTableLayout(
      {
        columnOrder: ["partNumber", "family"],
        columnWidths: { family: 199 },
        savedAt: Date.parse("2026-05-19T11:00:00.000Z")
      },
      {
        columnOrder: ["partNumber", "description"],
        columnWidths: { description: 220 },
        updatedAt: "2026-05-19T11:59:00.000Z"
      }
    );
    expect(latest).toEqual({
      columnOrder: ["partNumber", "description"],
      columnWidths: { description: 220 }
    });
  });
});
