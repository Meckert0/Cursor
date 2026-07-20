"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { readCanvasDraftSnapshot } from "@/lib/cable-canvas-utils";
import {
  buildConnectorPositionLookup,
  buildWirelistNodeIds,
  filterPopulatedWirelistRows,
  snapshotToWirelistRows,
  validateWirelistRows,
  verifyWirelistLocation,
  wirelistRowsToSnapshot,
  WIRELIST_SLEEVING_OPTIONS,
  type WirelistLocationState,
  type WirelistRow,
  type WirelistSleeving
} from "@/lib/wirelist-utils";
import { getSleevingLabel } from "@/lib/cable-canvas-utils";
import styles from "./wirelist-grid.module.css";

const CELL_KEYS: Array<keyof WirelistRow> = [
  "runNumber",
  "fromLocation",
  "fromContact",
  "fromSignalDescription",
  "wireAwg",
  "wirePartNumber",
  "length",
  "sleeving",
  "wireColor",
  "wireGroup",
  "toLocation",
  "toContact",
  "toSignalDescription",
  "labelPartNumber",
  "labelText",
  "notes"
];

type WirelistColumn = {
  id: string;
  label: string;
  defaultWidth: number;
  resizable: boolean;
};

const WIRELIST_COLUMNS: WirelistColumn[] = [
  { id: "select", label: "", defaultWidth: 44, resizable: false },
  { id: "runNumber", label: "Run #", defaultWidth: 72, resizable: true },
  { id: "fromLocation", label: "From Location (Conn - Pin)", defaultWidth: 180, resizable: true },
  { id: "fromContact", label: "From Contact", defaultWidth: 110, resizable: true },
  { id: "fromSignalDescription", label: "From Signal Desc", defaultWidth: 140, resizable: true },
  { id: "wireAwg", label: "Wire AWG", defaultWidth: 90, resizable: true },
  { id: "wirePartNumber", label: "Wire/Patchcord P/N", defaultWidth: 150, resizable: true },
  { id: "length", label: "Length (in)", defaultWidth: 90, resizable: true },
  { id: "sleeving", label: "Sleeving", defaultWidth: 180, resizable: true },
  { id: "wireColor", label: "Wire Color", defaultWidth: 100, resizable: true },
  { id: "wireGroup", label: "Wire Group", defaultWidth: 100, resizable: true },
  { id: "toLocation", label: "To Location (Conn-Pin)", defaultWidth: 180, resizable: true },
  { id: "toContact", label: "To Contact", defaultWidth: 110, resizable: true },
  { id: "toSignalDescription", label: "To Signal Desc", defaultWidth: 140, resizable: true },
  { id: "labelPartNumber", label: "Label P/N", defaultWidth: 110, resizable: true },
  { id: "labelText", label: "Label Text", defaultWidth: 120, resizable: true },
  { id: "notes", label: "Notes", defaultWidth: 160, resizable: true }
];

const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  WIRELIST_COLUMNS.map((column) => [column.id, column.defaultWidth])
) as Record<string, number>;

const COLUMN_WIDTHS_STORAGE_KEY = "wirelist-column-widths";
const ZOOM_STORAGE_KEY = "wirelist-zoom";
const VERIFIER_STORAGE_KEY = "wirelist-verifier";
const MIN_COLUMN_WIDTH = 48;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const SAVE_DEBOUNCE_MS = 800;
const RETRY_DELAY_MS = 2000;
const HISTORY_LIMIT = 30;

function loadColumnWidths(): Record<string, number> {
  if (typeof window === "undefined") {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_COLUMN_WIDTHS };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged = { ...DEFAULT_COLUMN_WIDTHS };
    for (const column of WIRELIST_COLUMNS) {
      const width = parsed[column.id];
      if (typeof width === "number" && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH) {
        merged[column.id] = width;
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

function saveColumnWidths(columnWidths: Record<string, number>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
}

function loadZoomLevel(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) {
      return 1;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parsed));
  } catch {
    return 1;
  }
}

function saveZoomLevel(zoomLevel: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel));
}

function loadVerifierEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(VERIFIER_STORAGE_KEY) === "true";
}

function saveVerifierEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(VERIFIER_STORAGE_KEY, String(enabled));
}

type ImportResult = {
  ok: boolean;
  error?: string;
  snapshot?: RevisionDto["snapshot"];
};

type SaveResult = {
  ok: boolean;
  error?: string;
  snapshot?: RevisionDto["snapshot"];
  snapshotHash?: string;
  conflict?: boolean;
};

type ExportResult = {
  ok: boolean;
  error?: string;
  fileName?: string;
  fileBase64?: string;
};

function downloadBase64File(fileName: string, fileBase64: string) {
  const bytes = Uint8Array.from(atob(fileBase64), (character) => character.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createBlankRow(index: number): WirelistRow {
  return {
    id: `p_canvas_${index + 1}`,
    runNumber: String(index + 1),
    fromLocation: "",
    fromContact: "",
    fromSignalDescription: "",
    wireAwg: "",
    wirePartNumber: "",
    length: "",
    wireColor: "",
    wireGroup: "",
    toLocation: "",
    toContact: "",
    toSignalDescription: "",
    labelPartNumber: "",
    labelText: "",
    notes: "",
    wireName: `wire${index + 1}`,
    wireComponentId: "",
    sleeving: "none"
  };
}

function normalizeRows(rows: WirelistRow[]): WirelistRow[] {
  return rows.map((row, index) => ({
    ...row,
    runNumber: String(index + 1),
    wireName: row.wireName || `wire${index + 1}`
  }));
}

export function WirelistGrid({
  revisionId,
  initialSnapshot,
  initialSnapshotHash,
  wireCatalog,
  connectorCatalog,
  importWirelistAction,
  exportWirelistAction,
  saveWirelistAction
}: {
  revisionId: string;
  initialSnapshot: RevisionDto["snapshot"];
  initialSnapshotHash: string;
  wireCatalog: LibraryComponentDto[];
  connectorCatalog: LibraryComponentDto[];
  importWirelistAction: (formData: FormData) => Promise<ImportResult>;
  exportWirelistAction: (rows: WirelistRow[]) => Promise<ExportResult>;
  saveWirelistAction: (input: {
    snapshot: RevisionDto["snapshot"];
    expectedSnapshotHash: string;
  }) => Promise<SaveResult>;
}) {
  const [baselineSnapshot, setBaselineSnapshot] = useState(initialSnapshot);
  const [baselineHash, setBaselineHash] = useState(initialSnapshotHash);
  const [rows, setRows] = useState<WirelistRow[]>(() => normalizeRows(snapshotToWirelistRows(initialSnapshot)));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [history, setHistory] = useState<WirelistRow[][]>([]);
  const [redoHistory, setRedoHistory] = useState<WirelistRow[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [saveMessage, setSaveMessage] = useState("All changes saved.");
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [zoomLevel, setZoomLevel] = useState(1);
  const [verifierEnabled, setVerifierEnabled] = useState(false);
  const [draftConnectors, setDraftConnectors] = useState<RevisionDto["snapshot"]["connectors"] | null>(null);
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImportPending, startImportTransition] = useTransition();
  const [isExportPending, startExportTransition] = useTransition();
  const wireOptions = useMemo(() => wireCatalog.filter((component) => component.category === "wire"), [wireCatalog]);
  const wireOptionByPartNumber = useMemo(
    () => new Map(wireOptions.map((wire) => [wire.partNumber.trim().toLowerCase(), wire.id])),
    [wireOptions]
  );
  const connectorSource = draftConnectors ?? baselineSnapshot.connectors;
  const connectorPositions = useMemo(
    () => buildConnectorPositionLookup(connectorSource, connectorCatalog),
    [connectorSource, connectorCatalog]
  );
  const locationOptions = useMemo(
    () =>
      connectorSource.flatMap((connector) => {
        const positions = connectorPositions.get(connector.reference.trim().toLowerCase());
        return positions ? Array.from(positions, (position) => `${connector.reference} - ${position}`) : [];
      }),
    [connectorSource, connectorPositions]
  );
  const nodeIds = useMemo(() => buildWirelistNodeIds(baselineSnapshot), [baselineSnapshot]);
  const validationErrors = useMemo(
    () => validateWirelistRows(rows, nodeIds, baselineSnapshot.connectors),
    [rows, nodeIds, baselineSnapshot.connectors]
  );

  useEffect(() => {
    setColumnWidths(loadColumnWidths());
    setZoomLevel(loadZoomLevel());
    setVerifierEnabled(loadVerifierEnabled());
  }, []);

  useEffect(() => {
    setDraftConnectors(readCanvasDraftSnapshot(revisionId, baselineSnapshot).connectors);
  }, [revisionId, baselineSnapshot]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!resizingColumnId) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }
      const deltaX = event.clientX - resizeState.startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, resizeState.startWidth + deltaX);
      setColumnWidths((previous) => ({
        ...previous,
        [resizeState.columnId]: nextWidth
      }));
    }

    function handleMouseUp() {
      const resizeState = resizeStateRef.current;
      if (resizeState) {
        setColumnWidths((previous) => {
          saveColumnWidths(previous);
          return previous;
        });
      }
      resizeStateRef.current = null;
      setResizingColumnId(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumnId]);

  useEffect(() => {
    if (!dirty || validationErrors.length > 0 || conflict) {
      return;
    }
    const timeoutId = window.setTimeout(async () => {
      setSaveMessage("Saving...");
      try {
        if (retryTimeoutRef.current !== null) {
          window.clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        const result = await saveWirelistAction({
          snapshot: wirelistRowsToSnapshot(baselineSnapshot, rows),
          expectedSnapshotHash: baselineHash
        });
        if (result.conflict) {
          setConflict(true);
          setSaveMessage(result.error ?? "Snapshot was modified elsewhere. Reload to continue.");
          return;
        }
        if (!result.ok || !result.snapshot) {
          throw new Error(result.error ?? "Save failed.");
        }
        setBaselineSnapshot(result.snapshot);
        if (result.snapshotHash) {
          setBaselineHash(result.snapshotHash);
        }
        setRows(normalizeRows(snapshotToWirelistRows(result.snapshot)));
        setDirty(false);
        setSaveMessage(`Saved at ${new Date().toLocaleTimeString()}.`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Save failed.";
        if (/modified elsewhere|409/i.test(errorMessage)) {
          setConflict(true);
          setSaveMessage(errorMessage);
          return;
        }
        setSaveMessage(`Save failed (${errorMessage}). Retrying...`);
        retryTimeoutRef.current = window.setTimeout(() => setRetryTick((previous) => previous + 1), RETRY_DELAY_MS);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [baselineHash, baselineSnapshot, conflict, dirty, retryTick, revisionId, rows, saveWirelistAction, validationErrors.length]);

  function pushHistory(nextRows: WirelistRow[]) {
    const normalizedNextRows = normalizeRows(nextRows);
    setHistory((previous) => {
      const next = [...previous, rows];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
    setRedoHistory([]);
    setRows(normalizedNextRows);
    setSelectedRowIds([]);
    setDirty(true);
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((previous) =>
      previous.includes(rowId) ? previous.filter((candidate) => candidate !== rowId) : [...previous, rowId]
    );
  }

  function toggleSelectAllRows(checked: boolean) {
    setSelectedRowIds(checked ? rows.map((row) => row.id) : []);
  }

  function deleteSelectedRows() {
    if (selectedRowIds.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      `Delete ${selectedRowIds.length} selected row${selectedRowIds.length === 1 ? "" : "s"}?`
    );
    if (!confirmed) {
      return;
    }
    const selectedIdSet = new Set(selectedRowIds);
    const nextRows = rows.filter((row) => !selectedIdSet.has(row.id));
    pushHistory(nextRows);
    setSelectedRowIds([]);
  }

  function setRowCellValue(row: WirelistRow, key: keyof WirelistRow, value: string): WirelistRow {
    if (key === "wirePartNumber") {
      const resolvedWireComponentId = wireOptionByPartNumber.get(value.trim().toLowerCase()) ?? "";
      return {
        ...row,
        wirePartNumber: value,
        wireComponentId: resolvedWireComponentId
      };
    }
    if (key === "sleeving") {
      const normalized = WIRELIST_SLEEVING_OPTIONS.includes(value as WirelistSleeving)
        ? (value as WirelistSleeving)
        : "none";
      return { ...row, sleeving: normalized };
    }
    return { ...row, [key]: value } as WirelistRow;
  }

  function updateCell(rowIndex: number, key: keyof WirelistRow, value: string) {
    if (key === "runNumber") {
      return;
    }
    const nextRows = [...rows];
    if (!nextRows[rowIndex]) {
      nextRows[rowIndex] = createBlankRow(rowIndex);
    }
    nextRows[rowIndex] = setRowCellValue(nextRows[rowIndex], key, value);
    pushHistory(nextRows);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) {
      return;
    }
    setRedoHistory((current) => [...current, rows]);
    setRows(previous);
    setSelectedRowIds([]);
    setHistory((current) => current.slice(0, -1));
    setDirty(true);
  }

  function redo() {
    const next = redoHistory.at(-1);
    if (!next) {
      return;
    }
    setHistory((current) => [...current, rows]);
    setRows(next);
    setSelectedRowIds([]);
    setRedoHistory((current) => current.slice(0, -1));
    setDirty(true);
  }

  function applyPaste(rowIndex: number, cellKey: keyof WirelistRow, text: string) {
    const startColumnIndex = CELL_KEYS.indexOf(cellKey);
    if (startColumnIndex < 0) {
      return;
    }
    const lineValues = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));
    const nextRows = [...rows];
    lineValues.forEach((line, lineOffset) => {
      const targetRowIndex = rowIndex + lineOffset;
      if (!nextRows[targetRowIndex]) {
        nextRows[targetRowIndex] = createBlankRow(targetRowIndex);
      }
      line.forEach((cell, cellOffset) => {
        const targetKey = CELL_KEYS[startColumnIndex + cellOffset];
        if (!targetKey) {
          return;
        }
        if (targetKey !== "runNumber") {
          nextRows[targetRowIndex] = setRowCellValue(nextRows[targetRowIndex], targetKey, cell.trim());
        }
      });
    });
    pushHistory(nextRows);
  }

  function moveFocusToNextRow(rowIndex: number, cellKey: keyof WirelistRow) {
    const nextRowIndex = rowIndex + 1;
    const selector = `[data-row-index="${nextRowIndex}"][data-cell-key="${cellKey}"]`;
    const nextControl = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    if (!nextControl) {
      return;
    }
    nextControl.focus();
    if ("select" in nextControl) {
      nextControl.select();
    }
  }

  function handleCellKeyDown(
    rowIndex: number,
    cellKey: keyof WirelistRow,
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    moveFocusToNextRow(rowIndex, cellKey);
  }

  function startColumnResize(columnId: string, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startWidth = columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTHS[columnId] ?? MIN_COLUMN_WIDTH;
    resizeStateRef.current = { columnId, startX: event.clientX, startWidth };
    setResizingColumnId(columnId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function decreaseZoom() {
    setZoomLevel((previous) => {
      const next = Math.max(ZOOM_MIN, Number((previous - ZOOM_STEP).toFixed(1)));
      saveZoomLevel(next);
      return next;
    });
  }

  function increaseZoom() {
    setZoomLevel((previous) => {
      const next = Math.min(ZOOM_MAX, Number((previous + ZOOM_STEP).toFixed(1)));
      saveZoomLevel(next);
      return next;
    });
  }

  function toggleVerifier(enabled: boolean) {
    setVerifierEnabled(enabled);
    saveVerifierEnabled(enabled);
  }

  function locationCellClass(state: WirelistLocationState): string {
    if (!verifierEnabled) {
      return "";
    }
    if (state === "valid") {
      return styles.cellValid;
    }
    if (state === "partial") {
      return styles.cellPartial;
    }
    if (state === "invalid") {
      return styles.cellInvalid;
    }
    return "";
  }

  function handleImportSubmit(formData: FormData) {
    startImportTransition(async () => {
      const result = await importWirelistAction(formData);
      if (!result.ok || !result.snapshot) {
        setSaveMessage(result.error ?? "Import failed.");
        return;
      }
      setBaselineSnapshot(result.snapshot);
      setRows(normalizeRows(snapshotToWirelistRows(result.snapshot)));
      setSelectedRowIds([]);
      setHistory([]);
      setRedoHistory([]);
      setDirty(false);
      setSaveMessage("Wirelist imported and saved.");
    });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.set("wirelistFile", file);
    handleImportSubmit(formData);
    event.target.value = "";
  }

  function handleExportClick() {
    const exportRows = filterPopulatedWirelistRows(rows);
    if (exportRows.length === 0) {
      setSaveMessage("No wire rows to export.");
      return;
    }
    startExportTransition(async () => {
      const result = await exportWirelistAction(exportRows);
      if (!result.ok || !result.fileName || !result.fileBase64) {
        setSaveMessage(result.error ?? "Export failed.");
        return;
      }
      downloadBase64File(result.fileName, result.fileBase64);
      setSaveMessage(`Exported ${exportRows.length} row(s) to ${result.fileName}.`);
    });
  }

  const displayRows = useMemo(() => [...rows, createBlankRow(rows.length)], [rows]);

  return (
    <section className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button type="button" onClick={undo} disabled={history.length === 0}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={redoHistory.length === 0}>
          Redo
        </button>
        {selectedRowIds.length > 0 ? (
          <button type="button" onClick={deleteSelectedRows}>
            Delete rows
          </button>
        ) : null}
        <span>{selectedRowIds.length > 0 ? `${selectedRowIds.length} row(s) selected` : "No rows selected"}</span>
        <span data-testid="wirelist-save-status">{saveMessage}</span>
        {conflict ? (
          <button type="button" data-testid="wirelist-conflict-reload" onClick={() => window.location.reload()}>
            Reload
          </button>
        ) : null}
        <div className={styles.toolbarRight}>
          <div className={styles.fileActions}>
            <input
              ref={fileInputRef}
              type="file"
              name="wirelistFile"
              accept=".xlsx,.xls"
              className={styles.hiddenFileInput}
              data-testid="wirelist-import-input"
              onChange={handleImportFileChange}
            />
            <button type="button" onClick={handleImportClick} disabled={isImportPending}>
              {isImportPending ? "Importing file..." : "Import file"}
            </button>
            <button type="button" onClick={handleExportClick} disabled={isExportPending}>
              {isExportPending ? "Downloading..." : "Download file"}
            </button>
          </div>
          <div className={styles.toolbarDivider} aria-hidden="true" />
          <div className={styles.zoomControls}>
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoomLevel <= ZOOM_MIN}
              onClick={decreaseZoom}
            >
              −
            </button>
            <span className={styles.zoomLabel}>
              Zoom {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoomLevel >= ZOOM_MAX}
              onClick={increaseZoom}
            >
              +
            </button>
          </div>
          <div className={styles.toolbarDivider} aria-hidden="true" />
          <label className={styles.verifierToggle}>
            <span>Verifier Toggle</span>
            <input
              type="checkbox"
              role="switch"
              checked={verifierEnabled}
              onChange={(event) => toggleVerifier(event.target.checked)}
            />
            <span className={styles.toggleTrack} aria-hidden="true">
              <span className={styles.toggleThumb} />
            </span>
          </label>
        </div>
      </div>
      {validationErrors.length > 0 ? (
        <ul className={styles.errorList}>
          {validationErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <div
        className={styles.tableShell}
        style={{ "--wirelist-zoom": zoomLevel } as CSSProperties}
      >
        <table className={styles.table}>
          <colgroup>
            {WIRELIST_COLUMNS.map((column) => (
              <col key={column.id} style={{ width: `${columnWidths[column.id]}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {WIRELIST_COLUMNS.map((column) => (
                <th key={column.id}>
                  {column.id === "select" ? (
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={rows.length > 0 && selectedRowIds.length === rows.length}
                      onChange={(event) => toggleSelectAllRows(event.target.checked)}
                    />
                  ) : (
                    column.label
                  )}
                  {column.resizable ? (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${column.label} column`}
                      className={`${styles.resizeHandle} ${resizingColumnId === column.id ? styles.resizeHandleActive : ""}`}
                      onMouseDown={(event) => startColumnResize(column.id, event)}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => {
              const isDraftRow = rowIndex === rows.length;
              const isSelected = selectedRowIds.includes(row.id);
              const shouldVerify = verifierEnabled && !isDraftRow;
              const fromCheck = shouldVerify
                ? verifyWirelistLocation(row.fromLocation, connectorPositions)
                : { state: "empty" as WirelistLocationState, message: null };
              const toCheck = shouldVerify
                ? verifyWirelistLocation(row.toLocation, connectorPositions)
                : { state: "empty" as WirelistLocationState, message: null };
              return (
              <tr
                key={row.id}
                className={`${isDraftRow ? styles.draftRow : ""} ${isSelected ? styles.selectedRow : ""}`.trim()}
              >
                <td className={styles.selectCell}>
                  {isDraftRow ? null : (
                    <input
                      type="checkbox"
                      aria-label={`Select row ${row.runNumber}`}
                      checked={isSelected}
                      onChange={() => toggleRowSelection(row.id)}
                    />
                  )}
                </td>
                <td>
                  <input
                    value={row.runNumber}
                    readOnly
                    aria-label="Run number"
                    data-row-index={rowIndex}
                    data-cell-key="runNumber"
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "runNumber", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "runNumber", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td className={locationCellClass(fromCheck.state)} title={fromCheck.message ?? undefined}>
                  <input
                    list="wirelist-location-options"
                    value={row.fromLocation}
                    data-row-index={rowIndex}
                    data-cell-key="fromLocation"
                    onChange={(event) => updateCell(rowIndex, "fromLocation", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "fromLocation", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "fromLocation", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.fromContact}
                    data-row-index={rowIndex}
                    data-cell-key="fromContact"
                    onChange={(event) => updateCell(rowIndex, "fromContact", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "fromContact", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "fromContact", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.fromSignalDescription}
                    data-row-index={rowIndex}
                    data-cell-key="fromSignalDescription"
                    onChange={(event) => updateCell(rowIndex, "fromSignalDescription", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "fromSignalDescription", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "fromSignalDescription", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.wireAwg}
                    data-row-index={rowIndex}
                    data-cell-key="wireAwg"
                    onChange={(event) => updateCell(rowIndex, "wireAwg", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "wireAwg", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "wireAwg", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.wirePartNumber}
                    data-row-index={rowIndex}
                    data-cell-key="wirePartNumber"
                    onChange={(event) => updateCell(rowIndex, "wirePartNumber", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "wirePartNumber", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "wirePartNumber", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.length}
                    data-row-index={rowIndex}
                    data-cell-key="length"
                    onChange={(event) => updateCell(rowIndex, "length", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "length", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "length", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <select
                    value={row.sleeving}
                    data-row-index={rowIndex}
                    data-cell-key="sleeving"
                    aria-label="Sleeving"
                    onChange={(event) => updateCell(rowIndex, "sleeving", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "sleeving", event)}
                  >
                    {WIRELIST_SLEEVING_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getSleevingLabel(option)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={row.wireColor}
                    data-row-index={rowIndex}
                    data-cell-key="wireColor"
                    onChange={(event) => updateCell(rowIndex, "wireColor", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "wireColor", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "wireColor", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.wireGroup}
                    data-row-index={rowIndex}
                    data-cell-key="wireGroup"
                    onChange={(event) => updateCell(rowIndex, "wireGroup", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "wireGroup", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "wireGroup", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td className={locationCellClass(toCheck.state)} title={toCheck.message ?? undefined}>
                  <input
                    list="wirelist-location-options"
                    value={row.toLocation}
                    data-row-index={rowIndex}
                    data-cell-key="toLocation"
                    onChange={(event) => updateCell(rowIndex, "toLocation", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "toLocation", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "toLocation", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.toContact}
                    data-row-index={rowIndex}
                    data-cell-key="toContact"
                    onChange={(event) => updateCell(rowIndex, "toContact", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "toContact", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "toContact", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.toSignalDescription}
                    data-row-index={rowIndex}
                    data-cell-key="toSignalDescription"
                    onChange={(event) => updateCell(rowIndex, "toSignalDescription", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "toSignalDescription", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "toSignalDescription", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.labelPartNumber}
                    data-row-index={rowIndex}
                    data-cell-key="labelPartNumber"
                    onChange={(event) => updateCell(rowIndex, "labelPartNumber", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "labelPartNumber", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "labelPartNumber", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.labelText}
                    data-row-index={rowIndex}
                    data-cell-key="labelText"
                    onChange={(event) => updateCell(rowIndex, "labelText", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "labelText", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "labelText", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
                <td>
                  <input
                    value={row.notes}
                    data-row-index={rowIndex}
                    data-cell-key="notes"
                    onChange={(event) => updateCell(rowIndex, "notes", event.target.value)}
                    onKeyDown={(event) => handleCellKeyDown(rowIndex, "notes", event)}
                    onPaste={(event) => {
                      event.preventDefault();
                      applyPaste(rowIndex, "notes", event.clipboardData.getData("text"));
                    }}
                  />
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        <datalist id="wirelist-location-options">
          {locationOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </section>
  );
}
