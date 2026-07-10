"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DetailsSummary } from "@/components/details-summary";
import type { LibraryComponentDto, LibraryFieldDefinitionDto, RevisionDto } from "@/lib/api";
import {
  buildConnectorPins,
  formatConnectorPinsLabel,
  getSleevingLabel,
  normalizeSelectedPathId,
  readCanvasDraftSnapshot,
  readPinCountFromComponent,
  SLEEVING_OPTIONS
} from "@/lib/cable-canvas-utils";
import styles from "./cable-canvas.module.css";

type NodePosition = {
  x: number;
  y: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
};

type ConnectState = {
  fromNodeId: string;
  pointerCanvasX: number;
  pointerCanvasY: number;
};

type JunctionNode = NonNullable<RevisionDto["snapshot"]["junctions"]>[number];
type CanvasDraft = {
  connectors: RevisionDto["snapshot"]["connectors"];
  junctions: JunctionNode[];
  paths: RevisionDto["snapshot"]["paths"];
  positions: Record<string, NodePosition>;
};
type CanvasSelection =
  | { type: "connector"; id: string }
  | { type: "junction"; id: string }
  | { type: "path"; id: string };
type UndoSnapshot = {
  connectors: RevisionDto["snapshot"]["connectors"];
  junctions: JunctionNode[];
  paths: RevisionDto["snapshot"]["paths"];
  positions: Record<string, NodePosition>;
  selectedEntity: CanvasSelection | null;
  selectedPathId: string;
};
const UNDO_HISTORY_LIMIT = 25;

function buildNextWireName(paths: RevisionDto["snapshot"]["paths"]): string {
  const numericSuffixes = paths
    .map((path) => /^wire(\d+)$/.exec(path.wireName ?? "")?.[1])
    .map((value) => (value ? Number.parseInt(value, 10) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  const next = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : paths.length + 1;
  return `wire${next}`;
}

function buildNextCanvasId(existingIds: string[], prefix: "c_canvas_" | "j_canvas_" | "p_canvas_"): string {
  const used = new Set(existingIds);
  let next = used.size + 1;
  while (used.has(`${prefix}${next}`)) {
    next += 1;
  }
  return `${prefix}${next}`;
}

const BUILTIN_COMPONENT_FIELD_KEYS = new Set([
  "partNumber",
  "family",
  "description",
  "awg",
  "color",
  "isActive",
  "stockStatus",
  "compatibilityHints",
  "createdByUserId",
  "createdAt",
  "isReviewed",
  "reviewedByUserId",
  "reviewedAt",
  "lastEditedByUserId",
  "lastEditedAt"
]);

function readComponentFieldValue(component: LibraryComponentDto, key: string): string {
  if (BUILTIN_COMPONENT_FIELD_KEYS.has(key)) {
    const value = (component as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return value === undefined || value === null ? "" : String(value);
  }
  return component.customFieldValues?.[key] ?? "";
}

function buildNextConnectorReference(connectors: RevisionDto["snapshot"]["connectors"]): string {
  const used = new Set(connectors.map((connector) => connector.reference.toLowerCase()));
  let next = connectors.length + 1;
  while (used.has(`j${next}`)) {
    next += 1;
  }
  return `J${next}`;
}

function buildDefaultPositions(
  connectors: RevisionDto["snapshot"]["connectors"],
  junctions: JunctionNode[]
): Record<string, NodePosition> {
  const result: Record<string, NodePosition> = {};
  connectors.forEach((connector, index) => {
    if (connector.location) {
      result[connector.id] = {
        x: connector.location.x,
        y: connector.location.y
      };
      return;
    }
    result[connector.id] = {
      x: 60 + (index % 4) * 170,
      y: 60 + Math.floor(index / 4) * 120
    };
  });
  junctions.forEach((junction, index) => {
    if (junction.location) {
      result[junction.id] = {
        x: junction.location.x,
        y: junction.location.y
      };
      return;
    }
    result[junction.id] = {
      x: 130 + (index % 5) * 140,
      y: 140 + Math.floor(index / 5) * 100
    };
  });
  return result;
}

function loadLegacyLayoutPositions(storageKey: string): Record<string, NodePosition> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Record<string, NodePosition>;
  } catch {
    return {};
  }
}

function loadInitialDraft(
  revisionId: string,
  snapshot: RevisionDto["snapshot"],
  layoutStorageKey: string
): CanvasDraft {
  const { connectors, junctions, paths } = readCanvasDraftSnapshot(revisionId, snapshot);
  const basePositions = buildDefaultPositions(connectors, junctions);
  const legacyLayoutPositions = loadLegacyLayoutPositions(layoutStorageKey);

  if (typeof window === "undefined") {
    return {
      connectors,
      junctions,
      paths,
      positions: basePositions
    };
  }

  const draftStorageKey = `cable-canvas-draft:${revisionId}`;
  let draftPositions: Record<string, NodePosition> = {};
  try {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    const draft = rawDraft ? (JSON.parse(rawDraft) as Partial<CanvasDraft>) : null;
    draftPositions =
      draft?.positions && typeof draft.positions === "object" ? (draft.positions as Record<string, NodePosition>) : {};
  } catch {
    draftPositions = {};
  }

  return {
    connectors,
    junctions,
    paths,
    positions: { ...basePositions, ...legacyLayoutPositions, ...draftPositions }
  };
}

export function CableCanvas({
  revisionId,
  snapshot,
  wireCatalog,
  connectorCatalog,
  connectorFieldDefinitions = [],
  quickAddWireAction,
  quickAddConnectorAction,
  readOnly = false
}: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
  wireCatalog: LibraryComponentDto[];
  connectorCatalog: LibraryComponentDto[];
  connectorFieldDefinitions?: LibraryFieldDefinitionDto[];
  quickAddWireAction: (formData: FormData) => Promise<{
    ok: boolean;
    notice?: string;
    error?: string;
    newWireComponentId?: string;
    wireCatalog: LibraryComponentDto[];
  }>;
  quickAddConnectorAction: (formData: FormData) => Promise<{
    ok: boolean;
    notice?: string;
    error?: string;
    newConnectorPartNumber?: string;
    connectorCatalog: LibraryComponentDto[];
  }>;
  readOnly?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeWidth = 120;
  const connectorNodeHeight = 56;
  const junctionNodeSize = 24;
  const layoutStorageKey = `cable-canvas-layout:${revisionId}`;
  const draftStorageKey = `cable-canvas-draft:${revisionId}`;
  const initialDraft = useMemo(() => loadInitialDraft(revisionId, snapshot, layoutStorageKey), [
    revisionId,
    snapshot,
    layoutStorageKey
  ]);
  const [connectors, setConnectors] = useState<RevisionDto["snapshot"]["connectors"]>(() => initialDraft.connectors);
  const [junctions, setJunctions] = useState<JunctionNode[]>(() => initialDraft.junctions);
  const [pathsState, setPathsState] = useState<RevisionDto["snapshot"]["paths"]>(() => initialDraft.paths);
  const [positions, setPositions] = useState<Record<string, NodePosition>>(() => initialDraft.positions);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [connectState, setConnectState] = useState<ConnectState | null>(null);
  const [selectedPathId, setSelectedPathId] = useState(snapshot.paths[0]?.id ?? "");
  const [selectedEntity, setSelectedEntity] = useState<CanvasSelection | null>(
    snapshot.paths[0]?.id ? { type: "path", id: snapshot.paths[0].id } : null
  );
  const [wireCatalogState, setWireCatalogState] = useState<LibraryComponentDto[]>(wireCatalog);
  const [connectorCatalogState, setConnectorCatalogState] = useState<LibraryComponentDto[]>(connectorCatalog);
  const [quickAddNotice, setQuickAddNotice] = useState("");
  const [quickAddError, setQuickAddError] = useState("");
  const [quickAddPending, setQuickAddPending] = useState(false);
  const [connectorQuickAddNotice, setConnectorQuickAddNotice] = useState("");
  const [connectorQuickAddError, setConnectorQuickAddError] = useState("");
  const [connectorQuickAddPending, setConnectorQuickAddPending] = useState(false);
  const [showAddWireDialog, setShowAddWireDialog] = useState(false);
  const [showAddConnectorDialog, setShowAddConnectorDialog] = useState(false);
  const [showConnectorSearchDialog, setShowConnectorSearchDialog] = useState(false);
  const [connectorSearchQuery, setConnectorSearchQuery] = useState("");
  const [connectorNameDraft, setConnectorNameDraft] = useState("");
  const [connectorNameError, setConnectorNameError] = useState<string | null>(null);
  const [connectorNameSyncKey, setConnectorNameSyncKey] = useState("");
  const [inlineLengthEdit, setInlineLengthEdit] = useState<{ pathId: string; draft: string } | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [undoHistory, setUndoHistory] = useState<UndoSnapshot[]>([]);
  const inlineLengthInputRef = useRef<HTMLInputElement | null>(null);
  const positionsRef = useRef(positions);
  const dragStartSnapshotRef = useRef<UndoSnapshot | null>(null);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    window.localStorage.setItem(layoutStorageKey, JSON.stringify(positions));
  }, [positions, layoutStorageKey]);

  useEffect(() => {
    try {
      const draft: CanvasDraft = {
        connectors,
        junctions,
        paths: pathsState,
        positions
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // ignore storage failures
    }
  }, [connectors, draftStorageKey, junctions, pathsState, positions]);

  useEffect(() => {
    if (!dragState) {
      return;
    }
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const isConnector = connectors.some((connector) => connector.id === dragState.nodeId);
      const width = isConnector ? nodeWidth : junctionNodeSize;
      const height = isConnector ? connectorNodeHeight : junctionNodeSize;
      const nextX = Math.max(0, Math.min(rect.width - width, event.clientX - rect.left - dragState.offsetX));
      const nextY = Math.max(0, Math.min(rect.height - height, event.clientY - rect.top - dragState.offsetY));
      setPositions((previous) => ({
        ...previous,
        [dragState.nodeId]: { x: nextX, y: nextY }
      }));
    };
    const onPointerUp = () => {
      const dragStartSnapshot = dragStartSnapshotRef.current;
      const startPosition = dragStartSnapshot?.positions[dragState.nodeId];
      const endPosition = positionsRef.current[dragState.nodeId];
      const moved = Boolean(
        startPosition &&
          endPosition &&
          (startPosition.x !== endPosition.x || startPosition.y !== endPosition.y)
      );
      if (moved && dragStartSnapshot) {
        setUndoHistory((previous) => {
          const next = [...previous, dragStartSnapshot];
          return next.length > UNDO_HISTORY_LIMIT ? next.slice(next.length - UNDO_HISTORY_LIMIT) : next;
        });
      }
      dragStartSnapshotRef.current = null;
      setDragState(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [connectors, connectorNodeHeight, dragState, junctionNodeSize, nodeWidth]);

  useEffect(() => {
    if (!connectState) {
      return;
    }
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      setConnectState((previous) =>
        previous
          ? {
              ...previous,
              pointerCanvasX: event.clientX - rect.left,
              pointerCanvasY: event.clientY - rect.top
            }
          : null
      );
    };
    const onPointerUp = () => {
      setConnectState(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [connectState]);

  const allNodeIds = useMemo(
    () => [...connectors.map((connector) => connector.id), ...junctions.map((junction) => junction.id)],
    [connectors, junctions]
  );
  const junctionIdSet = useMemo(() => new Set(junctions.map((junction) => junction.id)), [junctions]);

  const getNodeCenter = useCallback(
    (nodeId: string) => {
      const position = positions[nodeId];
      if (!position) {
        return null;
      }
      if (junctionIdSet.has(nodeId)) {
        return { x: position.x + junctionNodeSize / 2, y: position.y + junctionNodeSize / 2 };
      }
      return { x: position.x + nodeWidth / 2, y: position.y + connectorNodeHeight / 2 };
    },
    [connectorNodeHeight, junctionIdSet, junctionNodeSize, nodeWidth, positions]
  );

  const paths = useMemo(
    () =>
      pathsState
        .map((path) => {
          const from = getNodeCenter(path.fromConnectorId);
          const to = getNodeCenter(path.toConnectorId);
          if (!from || !to) {
            return null;
          }
          return {
            id: path.id,
            pathType: path.pathType,
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [getNodeCenter, pathsState]
  );

  const normalizedSelectedPathId = useMemo(
    () => normalizeSelectedPathId(pathsState, selectedPathId),
    [pathsState, selectedPathId]
  );
  const selectedPath = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== "path") {
      return null;
    }
    return pathsState.find((path) => path.id === normalizedSelectedPathId) ?? null;
  }, [pathsState, normalizedSelectedPathId, selectedEntity]);

  useEffect(() => {
    if (!inlineLengthEdit || !inlineLengthInputRef.current) {
      return;
    }
    inlineLengthInputRef.current.focus();
    inlineLengthInputRef.current.select();
  }, [inlineLengthEdit]);
  const selectedEntityLabel = useMemo(() => {
    if (!selectedEntity) {
      return "none";
    }
    if (selectedEntity.type === "path") {
      const path = pathsState.find((entry) => entry.id === selectedEntity.id);
      return path ? `wire ${path.wireName ?? path.id}` : "wire";
    }
    if (selectedEntity.type === "connector") {
      const connector = connectors.find((entry) => entry.id === selectedEntity.id);
      return connector ? `connector ${connector.reference}` : "connector";
    }
    return `junction ${selectedEntity.id}`;
  }, [connectors, pathsState, selectedEntity]);
  const wireOptions = useMemo(
    () => wireCatalogState.filter((component) => component.category === "wire"),
    [wireCatalogState]
  );
  const connectorOptions = useMemo(
    () => connectorCatalogState.filter((component) => component.category === "module"),
    [connectorCatalogState]
  );
  const selectedConnector = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== "connector") {
      return null;
    }
    return connectors.find((connector) => connector.id === selectedEntity.id) ?? null;
  }, [connectors, selectedEntity]);
  const connectorSearchFields = useMemo(
    () => connectorFieldDefinitions.filter((definition) => definition.showInSearch),
    [connectorFieldDefinitions]
  );
  const connectorAddFormFields = useMemo(
    () => connectorFieldDefinitions.filter((definition) => definition.showOnAddForm),
    [connectorFieldDefinitions]
  );
  const connectorSearchColumns = useMemo(() => {
    if (connectorSearchFields.length > 0) {
      return connectorSearchFields.map((definition) => ({ key: definition.key, label: definition.label }));
    }
    return [
      { key: "partNumber", label: "Part number" },
      { key: "family", label: "Family" },
      { key: "description", label: "Description" }
    ];
  }, [connectorSearchFields]);
  const filteredConnectorSearchResults = useMemo(() => {
    const query = connectorSearchQuery.trim().toLowerCase();
    if (!query) {
      return connectorOptions;
    }
    const searchKeys = connectorSearchFields.length > 0
      ? connectorSearchFields.map((definition) => definition.key)
      : ["partNumber", "family", "description"];
    return connectorOptions.filter((component) =>
      searchKeys.some((key) => readComponentFieldValue(component, key).toLowerCase().includes(query))
    );
  }, [connectorOptions, connectorSearchFields, connectorSearchQuery]);

  const connectorNameKey = selectedConnector
    ? `${selectedConnector.id}:${selectedConnector.reference}`
    : "";
  if (connectorNameKey !== connectorNameSyncKey) {
    setConnectorNameSyncKey(connectorNameKey);
    setConnectorNameDraft(selectedConnector?.reference ?? "");
    setConnectorNameError(null);
  }
  const selectedWire = useMemo(
    () => wireOptions.find((wire) => wire.id === selectedPath?.wireComponentId) ?? null,
    [selectedPath?.wireComponentId, wireOptions]
  );

  const connectPreview = useMemo(() => {
    if (!connectState) {
      return null;
    }
    const start = getNodeCenter(connectState.fromNodeId);
    if (!start) {
      return null;
    }
    return {
      x1: start.x,
      y1: start.y,
      x2: connectState.pointerCanvasX,
      y2: connectState.pointerCanvasY
    };
  }, [connectState, getNodeCenter]);

  const addConnector = () => {
    if (readOnly) {
      return;
    }
    pushUndoCheckpoint();
    const connectorId = buildNextCanvasId(
      connectors.map((connector) => connector.id),
      "c_canvas_"
    );
    const reference = buildNextConnectorReference(connectors);
    setConnectors((previous) => [...previous, { id: connectorId, reference, pins: [] }]);
    setPositions((previous) => ({
      ...previous,
      [connectorId]: { x: 80 + ((connectors.length + 1) % 5) * 150, y: 80 + Math.floor((connectors.length + 1) / 5) * 110 }
    }));
    setSelectedEntity({ type: "connector", id: connectorId });
  };

  const addJunction = () => {
    if (readOnly) {
      return;
    }
    pushUndoCheckpoint();
    const junctionId = buildNextCanvasId(
      junctions.map((junction) => junction.id),
      "j_canvas_"
    );
    setJunctions((previous) => [...previous, { id: junctionId, location: { x: 0, y: 0 }, junctionType: "splice" }]);
    setPositions((previous) => ({
      ...previous,
      [junctionId]: { x: 140 + (junctions.length % 5) * 130, y: 160 + Math.floor(junctions.length / 5) * 96 }
    }));
    setSelectedEntity({ type: "junction", id: junctionId });
  };

  const addPathBetweenNodes = (fromId: string, toId: string) => {
    if (readOnly) {
      return;
    }
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    if (!allNodeIds.includes(fromId) || !allNodeIds.includes(toId)) {
      return;
    }
    const existingPath = pathsState.find(
      (path) =>
        (path.fromConnectorId === fromId && path.toConnectorId === toId) ||
        (path.fromConnectorId === toId && path.toConnectorId === fromId)
    );
    if (existingPath) {
      setSelectedPathId(existingPath.id);
      setSelectedEntity({ type: "path", id: existingPath.id });
      return;
    }
    const nextPathId = buildNextCanvasId(
      pathsState.map((path) => path.id),
      "p_canvas_"
    );
    pushUndoCheckpoint();
    setPathsState((previous) => [
      ...previous,
      {
        id: nextPathId,
        wireName: buildNextWireName(pathsState),
        fromConnectorId: fromId,
        toConnectorId: toId,
        pathType: "wire",
        length: undefined,
        sleeving: "none",
        wireComponentId: undefined
      }
    ]);
    setSelectedPathId(nextPathId);
    setSelectedEntity({ type: "path", id: nextPathId });
  };

  function createUndoSnapshot(): UndoSnapshot {
    return {
      connectors,
      junctions,
      paths: pathsState,
      positions,
      selectedEntity,
      selectedPathId
    };
  }

  function pushUndoCheckpoint(snapshot?: UndoSnapshot) {
    setUndoHistory((previous) => {
      const next = [...previous, snapshot ?? createUndoSnapshot()];
      return next.length > UNDO_HISTORY_LIMIT ? next.slice(next.length - UNDO_HISTORY_LIMIT) : next;
    });
  }

  function applySnapshot(snapshotToApply: UndoSnapshot) {
    setConnectors(snapshotToApply.connectors);
    setJunctions(snapshotToApply.junctions);
    setPathsState(snapshotToApply.paths);
    setPositions(snapshotToApply.positions);
    setSelectedEntity(snapshotToApply.selectedEntity);
    setSelectedPathId(snapshotToApply.selectedPathId);
    setDragState(null);
    setConnectState(null);
    setInlineLengthEdit(null);
  }

  const handleUndo = () => {
    if (readOnly) {
      return;
    }
    const snapshot = undoHistory.at(-1);
    if (!snapshot) {
      return;
    }
    applySnapshot(snapshot);
    setUndoHistory((previous) => previous.slice(0, -1));
  };

  const removeSelectedEntity = () => {
    if (readOnly) {
      return;
    }
    if (!selectedEntity) {
      return;
    }
    if (selectedEntity.type === "path") {
      pushUndoCheckpoint();
      const nextPaths = pathsState.filter((path) => path.id !== selectedEntity.id);
      setPathsState(nextPaths);
      setSelectedPathId(normalizeSelectedPathId(nextPaths, ""));
      setSelectedEntity(null);
      return;
    }
    pushUndoCheckpoint();
    const nextPaths = pathsState.filter(
      (path) => path.fromConnectorId !== selectedEntity.id && path.toConnectorId !== selectedEntity.id
    );
    const nextPositions = { ...positions };
    delete nextPositions[selectedEntity.id];
    if (selectedEntity.type === "connector") {
      setConnectors((previous) => previous.filter((connector) => connector.id !== selectedEntity.id));
    } else {
      setJunctions((previous) => previous.filter((junction) => junction.id !== selectedEntity.id));
    }
    setPathsState(nextPaths);
    setPositions(nextPositions);
    setSelectedPathId(normalizeSelectedPathId(nextPaths, selectedPathId));
    setSelectedEntity(null);
    if (dragState?.nodeId === selectedEntity.id) {
      setDragState(null);
    }
    if (connectState?.fromNodeId === selectedEntity.id) {
      setConnectState(null);
    }
  };

  const updateSelectedPath = (patch: Partial<RevisionDto["snapshot"]["paths"][number]>) => {
    if (readOnly) {
      return;
    }
    if (!normalizedSelectedPathId) {
      return;
    }
    const currentPath = pathsState.find((path) => path.id === normalizedSelectedPathId);
    if (!currentPath) {
      return;
    }
    const hasChanges = Object.entries(patch).some(([key, value]) => currentPath[key as keyof typeof currentPath] !== value);
    if (!hasChanges) {
      return;
    }
    pushUndoCheckpoint();
    setPathsState((previous) =>
      previous.map((path) => (path.id === normalizedSelectedPathId ? { ...path, ...patch } : path))
    );
  };

  const updateSelectedPathLength = (nextLength: string) => {
    if (!selectedPath) {
      return;
    }
    const normalized = nextLength.trim();
    if (normalized.length === 0) {
      updateSelectedPath({ length: undefined });
      return;
    }
    const parsed = Number(normalized);
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }
    updateSelectedPath({ length: parsed });
  };

  const updateSelectedPathSleevingType = (nextType: string) => {
    if (!selectedPath) {
      return;
    }
    const normalized = nextType as "none" | "expandable_sleeving" | "wire_braid_under_expandable_sleeving";
    updateSelectedPath({ sleeving: normalized });
  };

  const commitConnectorName = (rawValue: string) => {
    if (readOnly) {
      return;
    }
    if (!selectedEntity || selectedEntity.type !== "connector") {
      return;
    }
    const activeConnector = connectors.find((connector) => connector.id === selectedEntity.id);
    if (!activeConnector) {
      return;
    }
    const normalized = rawValue.trim();
    if (!normalized) {
      setConnectorNameError("Connector name is required.");
      return;
    }
    if (normalized === activeConnector.reference) {
      setConnectorNameError(null);
      return;
    }
    const isTaken = connectors.some(
      (connector) =>
        connector.id !== activeConnector.id && connector.reference.toLowerCase() === normalized.toLowerCase()
    );
    if (isTaken) {
      setConnectorNameError("That name is already used by another connector.");
      return;
    }
    setConnectorNameError(null);
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) =>
        connector.id === activeConnector.id ? { ...connector, reference: normalized } : connector
      )
    );
  };

  const applyConnectorLibrarySelection = (component: LibraryComponentDto) => {
    if (readOnly) {
      return;
    }
    if (!selectedEntity || selectedEntity.type !== "connector") {
      return;
    }
    const activeConnector = connectors.find((connector) => connector.id === selectedEntity.id);
    if (!activeConnector) {
      return;
    }
    const normalizedPartNumber = component.partNumber.trim();
    const pinCount = readPinCountFromComponent(component) ?? 0;
    const nextPins = buildConnectorPins(pinCount);
    const partNumberUnchanged = normalizedPartNumber === (activeConnector.partNumber ?? "");
    const libraryIdUnchanged = component.id === (activeConnector.libraryComponentId ?? "");
    const pinsUnchanged =
      nextPins.length === activeConnector.pins.length &&
      nextPins.every((pin, index) => {
        const existing = activeConnector.pins[index];
        return existing?.id === pin.id && existing?.number === pin.number;
      });
    if (partNumberUnchanged && libraryIdUnchanged && pinsUnchanged) {
      return;
    }
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) =>
        connector.id === activeConnector.id
          ? {
              ...connector,
              partNumber: normalizedPartNumber || undefined,
              libraryComponentId: component.id || undefined,
              pins: nextPins
            }
          : connector
      )
    );
  };

  const startInlineLengthEdit = (pathId: string) => {
    if (readOnly) {
      return;
    }
    const path = pathsState.find((entry) => entry.id === pathId);
    if (!path) {
      return;
    }
    setSelectedPathId(pathId);
    setSelectedEntity({ type: "path", id: pathId });
    setInlineLengthEdit({
      pathId,
      draft: typeof path.length === "number" ? String(path.length) : "0"
    });
  };

  const commitInlineLengthEdit = () => {
    if (readOnly) {
      return;
    }
    if (!inlineLengthEdit) {
      return;
    }
    const normalized = inlineLengthEdit.draft.trim();
    const parsed = Number(normalized);
    if (normalized.length === 0 || Number.isNaN(parsed) || parsed < 0) {
      setInlineLengthEdit(null);
      return;
    }
    const currentPath = pathsState.find((path) => path.id === inlineLengthEdit.pathId);
    if (!currentPath || currentPath.length === parsed) {
      setInlineLengthEdit(null);
      return;
    }
    pushUndoCheckpoint();
    setPathsState((previous) =>
      previous.map((path) => (path.id === inlineLengthEdit.pathId ? { ...path, length: parsed } : path))
    );
    setInlineLengthEdit(null);
  };

  const handleQuickAddWireSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (readOnly) {
      return;
    }
    event.preventDefault();
    setQuickAddNotice("");
    setQuickAddError("");
    setQuickAddPending(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await quickAddWireAction(formData);
    setQuickAddPending(false);
    setWireCatalogState(result.wireCatalog);
    if (!result.ok) {
      setQuickAddError(result.error ?? "Wire quick-add failed.");
      return;
    }
    setQuickAddNotice(result.notice ?? "Wire added.");
    if (selectedEntity?.type === "path" && result.newWireComponentId) {
      const selectedPathState = pathsState.find((path) => path.id === selectedEntity.id);
      if (selectedPathState?.wireComponentId !== result.newWireComponentId) {
        pushUndoCheckpoint();
      }
      setPathsState((previous) =>
        previous.map((path) =>
          path.id === selectedEntity.id ? { ...path, wireComponentId: result.newWireComponentId } : path
        )
      );
    }
    form.reset();
    setShowAddWireDialog(false);
  };

  const handleQuickAddConnectorSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (readOnly) {
      return;
    }
    event.preventDefault();
    setConnectorQuickAddNotice("");
    setConnectorQuickAddError("");
    setConnectorQuickAddPending(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await quickAddConnectorAction(formData);
    setConnectorQuickAddPending(false);
    setConnectorCatalogState(result.connectorCatalog);
    if (!result.ok) {
      setConnectorQuickAddError(result.error ?? "Connector quick-add failed.");
      return;
    }
    setConnectorQuickAddNotice(result.notice ?? "Connector added.");
    if (selectedEntity?.type === "connector" && result.newConnectorPartNumber) {
      const newComponent = result.connectorCatalog.find(
        (component) => component.partNumber === result.newConnectorPartNumber
      );
      if (newComponent) {
        applyConnectorLibrarySelection(newComponent);
      }
    }
    form.reset();
    setShowAddConnectorDialog(false);
    setShowConnectorSearchDialog(false);
    setConnectorSearchQuery("");
  };

  const handleCanvasBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(`.${styles.connectorNode}, .${styles.junctionNode}, .${styles.connectHandle}`)) {
      return;
    }
    if (target instanceof SVGLineElement || target instanceof SVGTextElement || target instanceof SVGForeignObjectElement) {
      return;
    }
    setSelectedEntity(null);
    setSelectedPathId("");
  };

  return (
    <section className={styles.wrapper}>
      <section className={styles.topSection}>
        <div className={styles.toolbar}>
          <button type="button" onClick={addConnector} disabled={readOnly}>
            Add connector
          </button>
          <button type="button" onClick={addJunction} disabled={readOnly}>
            Add junction
          </button>
          <button type="button" className={styles.deleteButton} onClick={removeSelectedEntity} disabled={readOnly || !selectedEntity}>
            Delete
          </button>
          <button type="button" className={styles.undoButton} onClick={handleUndo} disabled={readOnly || undoHistory.length === 0}>
            Undo
          </button>
          <span className={styles.selectionSummary}>Selected: {selectedEntityLabel}</span>
        </div>
        <div className={styles.selectionDetailsShell}>
          {selectedEntity?.type === "path" ? (
            <div className={styles.detailPanel}>
              <label>
                Wire part number
                <select
                  value={selectedPath?.wireComponentId ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateSelectedPath({
                      wireComponentId: event.target.value || undefined
                    })
                  }
                >
                  <option value="">No wire selected</option>
                  {wireOptions.map((wire) => (
                    <option key={wire.id} value={wire.id}>
                      {wire.partNumber}
                      {wire.awg ? ` | AWG ${wire.awg}` : ""}
                      {wire.color ? ` | ${wire.color}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setShowAddWireDialog(true)} disabled={readOnly}>
                Add new wire
              </button>
              {quickAddNotice ? <span className={styles.quickAddNotice}>{quickAddNotice}</span> : null}
              {quickAddError ? <span className={styles.quickAddError}>{quickAddError}</span> : null}
              <label>
                Length (inches)
                <input
                  value={typeof selectedPath?.length === "number" ? String(selectedPath.length) : ""}
                  disabled={readOnly}
                  onChange={(event) => updateSelectedPathLength(event.target.value)}
                  placeholder="e.g. 30"
                />
              </label>
              <label>
                Sleeving
                <select
                  value={selectedPath?.sleeving ?? "none"}
                  disabled={readOnly}
                  onChange={(event) => updateSelectedPathSleevingType(event.target.value)}
                >
                  {SLEEVING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {selectedEntity?.type === "connector" && selectedConnector ? (
            <div className={styles.detailPanel}>
              <label>
                Connector name
                <input
                  value={connectorNameDraft}
                  disabled={readOnly}
                  onChange={(event) => setConnectorNameDraft(event.target.value)}
                  onBlur={(event) => commitConnectorName(event.target.value)}
                  placeholder="e.g. J1"
                />
              </label>
              {connectorNameError ? <span className={styles.quickAddError}>{connectorNameError}</span> : null}
              {selectedConnector.partNumber ? (
                <span className={styles.connectorPartNumber}>Part number: {selectedConnector.partNumber}</span>
              ) : null}
              <button type="button" onClick={() => setShowConnectorSearchDialog(true)}>
                Define Connector
              </button>
              {connectorQuickAddNotice ? <span className={styles.quickAddNotice}>{connectorQuickAddNotice}</span> : null}
              {connectorQuickAddError ? <span className={styles.quickAddError}>{connectorQuickAddError}</span> : null}
            </div>
          ) : null}
          {!selectedEntity || selectedEntity.type === "junction" ? (
            <div className={styles.detailPanelEmpty} aria-hidden="true" />
          ) : null}
        </div>
      </section>
      {showAddConnectorDialog ? (
        <div className={styles.quickAddOverlay} role="dialog" aria-modal="true" aria-label="Add new connector">
          <form className={styles.quickAddDialog} onSubmit={handleQuickAddConnectorSubmit}>
            <h3>Add new connector</h3>
            {connectorAddFormFields.some((field) => field.key === "partNumber") ? null : (
              <label>
                Part number
                <input name="partNumber" placeholder="new connector part number" required />
              </label>
            )}
            {connectorAddFormFields.map((field) => {
              const inputName = BUILTIN_COMPONENT_FIELD_KEYS.has(field.key) ? field.key : `customField:${field.key}`;
              return (
                <label key={field.id}>
                  {field.label}
                  <input name={inputName} placeholder={field.label} required={field.key === "partNumber"} />
                </label>
              );
            })}
            <div className={styles.quickAddActions}>
              <button type="button" onClick={() => setShowAddConnectorDialog(false)} disabled={connectorQuickAddPending}>
                Cancel
              </button>
              <button type="submit" disabled={readOnly || connectorQuickAddPending}>
                {connectorQuickAddPending ? "Adding..." : "Add connector"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {showConnectorSearchDialog ? (
        <div className={styles.quickAddOverlay} role="dialog" aria-modal="true" aria-label="Define Connector">
          <div className={styles.connectorSearchDialog}>
            <h3>Define Connector</h3>
            <div className={styles.connectorSearchControls}>
              <input
                className={styles.connectorSearchInput}
                value={connectorSearchQuery}
                onChange={(event) => setConnectorSearchQuery(event.target.value)}
                placeholder="Search connectors..."
                autoFocus
              />
              <button type="button" onClick={() => setShowAddConnectorDialog(true)} disabled={readOnly}>
                Add new connector
              </button>
            </div>
            <div className={styles.connectorSearchTableWrap}>
              <table className={styles.connectorSearchTable}>
                <thead>
                  <tr>
                    {connectorSearchColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                    <th aria-label="Select" />
                  </tr>
                </thead>
                <tbody>
                  {filteredConnectorSearchResults.length === 0 ? (
                    <tr>
                      <td colSpan={connectorSearchColumns.length + 1}>No connectors found.</td>
                    </tr>
                  ) : (
                    filteredConnectorSearchResults.map((component) => (
                      <tr key={component.id}>
                        {connectorSearchColumns.map((column) => (
                          <td key={column.key}>{readComponentFieldValue(component, column.key)}</td>
                        ))}
                        <td>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              applyConnectorLibrarySelection(component);
                              setShowConnectorSearchDialog(false);
                              setConnectorSearchQuery("");
                            }}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.quickAddActions}>
              <button
                type="button"
                onClick={() => {
                  setShowConnectorSearchDialog(false);
                  setConnectorSearchQuery("");
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showAddWireDialog ? (
        <div className={styles.quickAddOverlay} role="dialog" aria-modal="true" aria-label="Add new wire">
          <form className={styles.quickAddDialog} onSubmit={handleQuickAddWireSubmit}>
            <h3>Add new wire</h3>
            <label>
              Part number
              <input name="partNumber" placeholder="new wire part number" required />
            </label>
            <label>
              AWG
              <input name="awg" placeholder="AWG" required />
            </label>
            <label>
              Color
              <input name="color" placeholder="color" required />
            </label>
            <div className={styles.quickAddActions}>
              <button type="button" onClick={() => setShowAddWireDialog(false)} disabled={quickAddPending}>
                Cancel
              </button>
              <button type="submit" disabled={readOnly || quickAddPending}>
                {quickAddPending ? "Adding..." : "Add wire"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <div className={styles.canvas} ref={canvasRef} data-testid="cable-canvas" onPointerDown={handleCanvasBackgroundPointerDown}>
        <svg className={styles.lines} aria-hidden>
          {paths.map((path) => {
            const pathEntry = pathsState.find((entry) => entry.id === path.id);
            const isEditingLength = inlineLengthEdit?.pathId === path.id;
            const midpointX = (path.x1 + path.x2) / 2 + 6;
            const midpointY = (path.y1 + path.y2) / 2 - 4;
            return (
              <g key={path.id}>
                <line
                  x1={path.x1}
                  y1={path.y1}
                  x2={path.x2}
                  y2={path.y2}
                  className={selectedEntity?.type === "path" && selectedEntity.id === path.id ? styles.selectedLine : undefined}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedPathId(path.id);
                    setSelectedEntity({ type: "path", id: path.id });
                  }}
                />
                {isEditingLength ? (
                  <foreignObject x={midpointX - 24} y={midpointY - 20} width={70} height={24}>
                    <input
                      ref={inlineLengthInputRef}
                      className={styles.inlineLengthInput}
                      value={inlineLengthEdit.draft}
                      onChange={(event) =>
                        setInlineLengthEdit((previous) =>
                          previous && previous.pathId === path.id ? { ...previous, draft: event.target.value } : previous
                        )
                      }
                      onBlur={commitInlineLengthEdit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitInlineLengthEdit();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setInlineLengthEdit(null);
                        }
                      }}
                      aria-label={`Length in inches for ${pathEntry?.wireName ?? path.id}`}
                    />
                  </foreignObject>
                ) : (
                  <text
                    x={midpointX}
                    y={midpointY}
                    className={styles.lengthLabel}
                    onDoubleClick={() => startInlineLengthEdit(path.id)}
                  >
                    {(pathEntry?.wireName ?? path.id) +
                      ` - ${pathEntry?.length ?? 0} in` +
                      ` | ${getSleevingLabel(pathEntry?.sleeving ?? "none")}` +
                      (selectedEntity?.type === "path" && selectedEntity.id === path.id && selectedWire
                        ? ` (${selectedWire.partNumber})`
                        : "")}
                  </text>
                )}
              </g>
            );
          })}
          {connectPreview ? (
            <line
              x1={connectPreview.x1}
              y1={connectPreview.y1}
              x2={connectPreview.x2}
              y2={connectPreview.y2}
              className={styles.previewLine}
            />
          ) : null}
        </svg>

        {connectors.map((connector) => {
          const position = positions[connector.id] ?? { x: 0, y: 0 };
          return (
            <button
              key={connector.id}
              type="button"
              disabled={readOnly}
              className={`${styles.connectorNode} ${
                selectedEntity?.type === "connector" && selectedEntity.id === connector.id ? styles.selectedNode : ""
              }`}
              style={{ left: `${position.x}px`, top: `${position.y}px` }}
              onPointerDown={(event) => {
                if (readOnly) {
                  return;
                }
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                dragStartSnapshotRef.current = createUndoSnapshot();
                setSelectedEntity({ type: "connector", id: connector.id });
                setDragState({
                  nodeId: connector.id,
                  offsetX: event.clientX - rect.left,
                  offsetY: event.clientY - rect.top
                });
              }}
              onPointerUp={() => {
                if (connectState && connectState.fromNodeId !== connector.id) {
                  addPathBetweenNodes(connectState.fromNodeId, connector.id);
                }
                setConnectState(null);
              }}
            >
              <strong>{connector.reference}</strong>
              <span>{connector.id}</span>
              <span>{formatConnectorPinsLabel(connector)}</span>
              <span
                className={styles.connectHandle}
                onPointerDown={(event) => {
                  if (readOnly) {
                    return;
                  }
                  event.stopPropagation();
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  setConnectState({
                    fromNodeId: connector.id,
                    pointerCanvasX: canvasRect ? event.clientX - canvasRect.left : 0,
                    pointerCanvasY: canvasRect ? event.clientY - canvasRect.top : 0
                  });
                }}
              >
                +
              </span>
            </button>
          );
        })}
        {junctions.map((junction) => {
          const position = positions[junction.id] ?? { x: 0, y: 0 };
          return (
            <button
              key={junction.id}
              type="button"
              disabled={readOnly}
              className={`${styles.junctionNode} ${
                selectedEntity?.type === "junction" && selectedEntity.id === junction.id ? styles.selectedNode : ""
              }`}
              style={{ left: `${position.x}px`, top: `${position.y}px` }}
              onPointerDown={(event) => {
                if (readOnly) {
                  return;
                }
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                dragStartSnapshotRef.current = createUndoSnapshot();
                setSelectedEntity({ type: "junction", id: junction.id });
                setDragState({
                  nodeId: junction.id,
                  offsetX: event.clientX - rect.left,
                  offsetY: event.clientY - rect.top
                });
              }}
              onPointerUp={() => {
                if (connectState && connectState.fromNodeId !== junction.id) {
                  addPathBetweenNodes(connectState.fromNodeId, junction.id);
                }
                setConnectState(null);
              }}
              aria-label={`Junction ${junction.id}`}
              title={`Junction ${junction.id}`}
            >
              <span
                className={styles.connectHandle}
                onPointerDown={(event) => {
                  if (readOnly) {
                    return;
                  }
                  event.stopPropagation();
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  setConnectState({
                    fromNodeId: junction.id,
                    pointerCanvasX: canvasRect ? event.clientX - canvasRect.left : 0,
                    pointerCanvasY: canvasRect ? event.clientY - canvasRect.top : 0
                  });
                }}
              >
                +
              </span>
            </button>
          );
        })}
      </div>
      <section className={styles.detailsBlock}>
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setIsDetailsOpen((previous) => !previous)}
          aria-expanded={isDetailsOpen}
        >
          {isDetailsOpen ? "Hide Details" : "Show Details"}
        </button>
        {isDetailsOpen ? (
          <DetailsSummary
            revisionId={revisionId}
            snapshot={{ connectors, junctions, paths: pathsState }}
            connectors={connectors}
            junctions={junctions}
            paths={pathsState}
          />
        ) : null}
      </section>
    </section>
  );
}
