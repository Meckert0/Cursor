"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DetailsSummary } from "@/components/details-summary";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import {
  buildNextCanvasId,
  buildNextConnectorReference,
  buildNextCableName
} from "@/lib/cable-canvas-ids";
import {
  buildConnectorPinsFromComponent,
  filterAllowedAccessoryOptionsForModule,
  formatConnectorPinsLabel,
  getSleevingLabel,
  loadInitialCanvasDraft,
  normalizeSelectedPathId,
  SLEEVING_OPTIONS
} from "@/lib/cable-canvas-utils";
import {
  getPartFieldsForCategory,
  readPartFieldRawValue,
  formatPartFieldDisplayValue,
  isCanvasConnectorPart,
  isCanvasDefinablePart,
  isCanvasFramePart,
  displayPartType
} from "@/lib/part-fields";
import {
  buildSlotsForFrame,
  flattenFramePins,
  frameAttributesFromComponent,
  isFrameHousingConnector,
  moduleMatchesFrameSide,
  modulesAllowedForFrameSlot,
  retargetSlotReferences,
  slotIdsForFrame,
  usedConnectorReferences,
  type FrameModuleRelationship
} from "@/lib/connector-frames";
import {
  useCanvasHistory,
  type CanvasNodePosition as NodePosition,
  type CanvasSelection,
  type CanvasUndoSnapshot as UndoSnapshot
} from "@/lib/use-canvas-history";
import { useCanvasPersistence, type CanvasSaveResult } from "@/lib/use-canvas-persistence";
import styles from "./cable-canvas.module.css";

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

function readComponentFieldValue(component: LibraryComponentDto, key: string): string {
  const field = getPartFieldsForCategory(component.category).find((entry) => entry.key === key);
  if (!field) {
    return "";
  }
  const formatted = formatPartFieldDisplayValue(readPartFieldRawValue(component, field));
  return formatted === "-" ? "" : formatted;
}

export function CableCanvas({
  revisionId,
  snapshot,
  snapshotHash,
  connectorCatalog,
  backshellCatalog = [],
  strainReliefCatalog = [],
  moduleBackshellCompat = [],
  moduleStrainReliefCompat = [],
  moduleAllowedRelationships = [],
  quickAddConnectorAction,
  saveCanvasAction,
  readOnly = false
}: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
  snapshotHash: string;
  connectorCatalog: LibraryComponentDto[];
  backshellCatalog?: LibraryComponentDto[];
  strainReliefCatalog?: LibraryComponentDto[];
  moduleBackshellCompat?: Array<{ modulePartId: string; backshellPartId: string; status: "allowed" | "forbidden" | "review" }>;
  moduleStrainReliefCompat?: Array<{
    modulePartId: string;
    strainReliefPartId: string;
    status: "allowed" | "forbidden" | "review";
  }>;
  moduleAllowedRelationships?: FrameModuleRelationship[];
  quickAddConnectorAction: (formData: FormData) => Promise<{
    ok: boolean;
    notice?: string;
    error?: string;
    newConnectorPartNumber?: string;
    connectorCatalog: LibraryComponentDto[];
  }>;
  saveCanvasAction?: (input: {
    snapshot: RevisionDto["snapshot"];
    expectedSnapshotHash: string;
  }) => Promise<CanvasSaveResult>;
  readOnly?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeWidth = 120;
  const connectorNodeHeight = 56;
  const junctionNodeSize = 24;
  const initialDraft = useMemo(() => loadInitialCanvasDraft(revisionId, snapshot), [revisionId, snapshot]);
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
  const [connectorCatalogState, setConnectorCatalogState] = useState<LibraryComponentDto[]>(connectorCatalog);
  const [backshellCatalogState] = useState<LibraryComponentDto[]>(backshellCatalog);
  const [strainReliefCatalogState] = useState<LibraryComponentDto[]>(strainReliefCatalog);
  const [connectorQuickAddNotice, setConnectorQuickAddNotice] = useState("");
  const [connectorQuickAddError, setConnectorQuickAddError] = useState("");
  const [connectorQuickAddPending, setConnectorQuickAddPending] = useState(false);
  const [showAddConnectorDialog, setShowAddConnectorDialog] = useState(false);
  const [showConnectorSearchDialog, setShowConnectorSearchDialog] = useState(false);
  const [connectorSearchTarget, setConnectorSearchTarget] = useState<"housing" | { slotId: string }>("housing");
  const [connectorSearchQuery, setConnectorSearchQuery] = useState("");
  const [includeReverseCompat, setIncludeReverseCompat] = useState(false);
  const [connectorNameDraft, setConnectorNameDraft] = useState("");
  const [connectorNameError, setConnectorNameError] = useState<string | null>(null);
  const [connectorNameSyncKey, setConnectorNameSyncKey] = useState("");
  const [slotNameDrafts, setSlotNameDrafts] = useState<Record<string, string>>({});
  const [slotNameErrors, setSlotNameErrors] = useState<Record<string, string>>({});
  const [slotNameSyncKey, setSlotNameSyncKey] = useState("");
  const [junctionLabelDraft, setJunctionLabelDraft] = useState("");
  const [junctionLabelSyncKey, setJunctionLabelSyncKey] = useState("");
  const [inlineLengthEdit, setInlineLengthEdit] = useState<{ pathId: string; draft: string } | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { canUndo, canRedo, pushCheckpoint, undo, redo } = useCanvasHistory();
  const { dirty, conflict, saveMessage } = useCanvasPersistence({
    revisionId,
    baselineSnapshot: snapshot,
    baselineSnapshotHash: snapshotHash,
    connectors,
    junctions,
    paths: pathsState,
    positions,
    saveCanvasAction,
    readOnly,
    initiallyDirty: initialDraft.recoveredDirty && !readOnly
  });
  const inlineLengthInputRef = useRef<HTMLInputElement | null>(null);
  const positionsRef = useRef(positions);
  const dragStartSnapshotRef = useRef<UndoSnapshot | null>(null);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

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
        pushCheckpoint(dragStartSnapshot);
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
  }, [connectors, connectorNodeHeight, dragState, junctionNodeSize, nodeWidth, pushCheckpoint]);

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
    const junction = junctions.find((entry) => entry.id === selectedEntity.id);
    return junction ? `junction ${junction.label ?? junction.id}` : "junction";
  }, [connectors, junctions, pathsState, selectedEntity]);
  const connectorOptions = useMemo(
    () => connectorCatalogState.filter((component) => isCanvasDefinablePart(component)),
    [connectorCatalogState]
  );
  const moduleCatalog = useMemo(
    () => connectorCatalogState.filter((component) => isCanvasConnectorPart(component)),
    [connectorCatalogState]
  );
  const selectedConnector = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== "connector") {
      return null;
    }
    return connectors.find((connector) => connector.id === selectedEntity.id) ?? null;
  }, [connectors, selectedEntity]);
  const selectedIsFrame = selectedConnector ? isFrameHousingConnector(selectedConnector) : false;
  const moduleDefined = Boolean(selectedConnector?.libraryComponentId);
  const allowedBackshellOptions = useMemo(() => {
    if (selectedIsFrame) {
      return [];
    }
    const moduleId = selectedConnector?.libraryComponentId;
    const statusByAccessoryId = new Map(
      moduleBackshellCompat
        .filter((row) => row.modulePartId === moduleId)
        .map((row) => [row.backshellPartId, row.status] as const)
    );
    return filterAllowedAccessoryOptionsForModule(backshellCatalogState, moduleId, statusByAccessoryId);
  }, [backshellCatalogState, moduleBackshellCompat, selectedConnector?.libraryComponentId, selectedIsFrame]);
  const allowedStrainReliefOptions = useMemo(() => {
    if (selectedIsFrame) {
      return [];
    }
    const moduleId = selectedConnector?.libraryComponentId;
    const statusByAccessoryId = new Map(
      moduleStrainReliefCompat
        .filter((row) => row.modulePartId === moduleId)
        .map((row) => [row.strainReliefPartId, row.status] as const)
    );
    return filterAllowedAccessoryOptionsForModule(strainReliefCatalogState, moduleId, statusByAccessoryId);
  }, [moduleStrainReliefCompat, selectedConnector?.libraryComponentId, selectedIsFrame, strainReliefCatalogState]);
  const selectedJunction = useMemo(() => {
    if (!selectedEntity || selectedEntity.type !== "junction") {
      return null;
    }
    return junctions.find((junction) => junction.id === selectedEntity.id) ?? null;
  }, [junctions, selectedEntity]);
  const modulePartFields = useMemo(() => getPartFieldsForCategory("module"), []);
  const connectorAddFormFields = useMemo(
    () => modulePartFields.filter((field) => field.showOnAddForm),
    [modulePartFields]
  );
  const connectorSearchColumns = useMemo(
    () => [
      { key: "partNumber", label: "Part number" },
      { key: "partType", label: "Type" },
      { key: "family", label: "Family" },
      { key: "description", label: "Description" }
    ],
    []
  );
  const selectedConnectorLibraryId = selectedConnector?.libraryComponentId;
  const searchPool = useMemo(() => {
    if (connectorSearchTarget === "housing") {
      return connectorOptions;
    }
    if (!selectedConnectorLibraryId) {
      return [];
    }
    const frameComponent = connectorCatalogState.find((component) => component.id === selectedConnectorLibraryId);
    return modulesAllowedForFrameSlot(
      selectedConnectorLibraryId,
      connectorSearchTarget.slotId,
      moduleAllowedRelationships,
      moduleCatalog
    ).filter((module) => moduleMatchesFrameSide(module, frameComponent, includeReverseCompat));
  }, [
    connectorCatalogState,
    connectorOptions,
    connectorSearchTarget,
    includeReverseCompat,
    moduleAllowedRelationships,
    moduleCatalog,
    selectedConnectorLibraryId
  ]);
  const filteredConnectorSearchResults = useMemo(() => {
    const query = connectorSearchQuery.trim().toLowerCase();
    if (!query) {
      return searchPool;
    }
    return searchPool.filter((component) => {
      const typeLabel = displayPartType(component.partType).toLowerCase();
      return (
        component.partNumber.toLowerCase().includes(query) ||
        (component.family ?? "").toLowerCase().includes(query) ||
        (component.description ?? "").toLowerCase().includes(query) ||
        typeLabel.includes(query) ||
        (component.partType ?? "").toLowerCase().includes(query)
      );
    });
  }, [connectorSearchQuery, searchPool]);

  const connectorNameKey = selectedConnector
    ? `${selectedConnector.id}:${selectedConnector.reference}`
    : "";
  if (connectorNameKey !== connectorNameSyncKey) {
    setConnectorNameSyncKey(connectorNameKey);
    setConnectorNameDraft(selectedConnector?.reference ?? "");
    setConnectorNameError(null);
  }
  const nextSlotNameSyncKey = selectedConnector
    ? `${selectedConnector.id}:${(selectedConnector.slots ?? [])
        .map((slot) => `${slot.slotId}:${slot.reference}`)
        .join("|")}`
    : "";
  if (nextSlotNameSyncKey !== slotNameSyncKey) {
    setSlotNameSyncKey(nextSlotNameSyncKey);
    const drafts: Record<string, string> = {};
    for (const slot of selectedConnector?.slots ?? []) {
      drafts[slot.slotId] = slot.reference;
    }
    setSlotNameDrafts(drafts);
    setSlotNameErrors({});
  }
  const junctionLabelKey = selectedJunction ? `${selectedJunction.id}:${selectedJunction.label ?? ""}` : "";
  if (junctionLabelKey !== junctionLabelSyncKey) {
    setJunctionLabelSyncKey(junctionLabelKey);
    setJunctionLabelDraft(selectedJunction?.label ?? "");
  }

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
    setJunctions((previous) => [...previous, { id: junctionId, location: { x: 0, y: 0 }, junctionType: "junction" }]);
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
        wireName: buildNextCableName(pathsState),
        fromConnectorId: fromId,
        toConnectorId: toId,
        pathType: "cable",
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
    pushCheckpoint(snapshot ?? createUndoSnapshot());
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
    const previous = undo(createUndoSnapshot());
    if (!previous) {
      return;
    }
    applySnapshot(previous);
  };

  const handleRedo = () => {
    if (readOnly) {
      return;
    }
    const next = redo(createUndoSnapshot());
    if (!next) {
      return;
    }
    applySnapshot(next);
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
    const takenByOthers = usedConnectorReferences(
      connectors.filter((connector) => connector.id !== activeConnector.id)
    );
    if (takenByOthers.has(normalized.toLowerCase())) {
      setConnectorNameError("That name is already used by another connector.");
      return;
    }
    const retargetedSlots = retargetSlotReferences(
      activeConnector.slots ?? [],
      activeConnector.reference,
      normalized
    );
    const slotNameClash = retargetedSlots.some((slot) => takenByOthers.has(slot.reference.toLowerCase()));
    if (slotNameClash) {
      setConnectorNameError("That name is already used by another connector.");
      return;
    }
    setConnectorNameError(null);
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) =>
        connector.id === activeConnector.id
          ? { ...connector, reference: normalized, slots: connector.slots ? retargetedSlots : connector.slots }
          : connector
      )
    );
  };

  const commitJunctionLabel = (rawValue: string) => {
    if (readOnly || !selectedJunction) {
      return;
    }
    const normalized = rawValue.trim();
    const currentLabel = selectedJunction.label ?? "";
    if (normalized === currentLabel) {
      return;
    }
    pushUndoCheckpoint();
    setJunctions((previous) =>
      previous.map((junction) =>
        junction.id === selectedJunction.id
          ? { ...junction, label: normalized || undefined }
          : junction
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
    if (isCanvasFramePart(component)) {
      const slotIds = slotIdsForFrame(frameAttributesFromComponent(component));
      const nextSlots = buildSlotsForFrame(activeConnector.reference, slotIds, activeConnector.slots);
      const nextPins = flattenFramePins(nextSlots);
      const unchanged =
        normalizedPartNumber === (activeConnector.partNumber ?? "") &&
        component.id === (activeConnector.libraryComponentId ?? "") &&
        JSON.stringify(nextSlots) === JSON.stringify(activeConnector.slots ?? []) &&
        JSON.stringify(nextPins) === JSON.stringify(activeConnector.pins);
      if (unchanged) {
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
                pins: nextPins,
                slots: nextSlots,
                backshellPartNumber: undefined,
                backshellLibraryComponentId: undefined,
                strainReliefPartNumber: undefined,
                strainReliefLibraryComponentId: undefined
              }
            : connector
        )
      );
      return;
    }

    const nextPins = buildConnectorPinsFromComponent(component);
    const allowedBackshellIds = new Set(
      moduleBackshellCompat
        .filter((row) => row.modulePartId === component.id && row.status === "allowed")
        .map((row) => row.backshellPartId)
    );
    const allowedStrainReliefIds = new Set(
      moduleStrainReliefCompat
        .filter((row) => row.modulePartId === component.id && row.status === "allowed")
        .map((row) => row.strainReliefPartId)
    );
    const keepBackshell =
      Boolean(activeConnector.backshellLibraryComponentId) &&
      allowedBackshellIds.has(activeConnector.backshellLibraryComponentId!);
    const keepStrainRelief =
      Boolean(activeConnector.strainReliefLibraryComponentId) &&
      allowedStrainReliefIds.has(activeConnector.strainReliefLibraryComponentId!);
    const nextBackshellId = keepBackshell ? activeConnector.backshellLibraryComponentId : undefined;
    const nextStrainReliefId = keepStrainRelief ? activeConnector.strainReliefLibraryComponentId : undefined;
    const partNumberUnchanged = normalizedPartNumber === (activeConnector.partNumber ?? "");
    const libraryIdUnchanged = component.id === (activeConnector.libraryComponentId ?? "");
    const pinsUnchanged =
      nextPins.length === activeConnector.pins.length &&
      nextPins.every((pin, index) => {
        const existing = activeConnector.pins[index];
        return existing?.id === pin.id && existing?.number === pin.number;
      });
    const accessoriesUnchanged =
      nextBackshellId === activeConnector.backshellLibraryComponentId &&
      nextStrainReliefId === activeConnector.strainReliefLibraryComponentId;
    if (partNumberUnchanged && libraryIdUnchanged && pinsUnchanged && accessoriesUnchanged && !activeConnector.slots) {
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
              pins: nextPins,
              slots: undefined,
              backshellPartNumber: keepBackshell ? connector.backshellPartNumber : undefined,
              backshellLibraryComponentId: nextBackshellId,
              strainReliefPartNumber: keepStrainRelief ? connector.strainReliefPartNumber : undefined,
              strainReliefLibraryComponentId: nextStrainReliefId
            }
          : connector
      )
    );
  };

  const applySlotModuleSelection = (slotId: string, component: LibraryComponentDto) => {
    if (readOnly || !selectedEntity || selectedEntity.type !== "connector") {
      return;
    }
    const activeConnector = connectors.find((connector) => connector.id === selectedEntity.id);
    if (!activeConnector?.slots) {
      return;
    }
    const nextPinsForSlot = buildConnectorPinsFromComponent(component);
    const allowedBackshellIds = new Set(
      moduleBackshellCompat
        .filter((row) => row.modulePartId === component.id && row.status === "allowed")
        .map((row) => row.backshellPartId)
    );
    const allowedStrainReliefIds = new Set(
      moduleStrainReliefCompat
        .filter((row) => row.modulePartId === component.id && row.status === "allowed")
        .map((row) => row.strainReliefPartId)
    );
    const nextSlots = activeConnector.slots.map((slot) => {
      if (slot.slotId !== slotId) {
        return slot;
      }
      const keepBackshell =
        Boolean(slot.backshellLibraryComponentId) && allowedBackshellIds.has(slot.backshellLibraryComponentId!);
      const keepStrainRelief =
        Boolean(slot.strainReliefLibraryComponentId) &&
        allowedStrainReliefIds.has(slot.strainReliefLibraryComponentId!);
      return {
        ...slot,
        partNumber: component.partNumber.trim() || undefined,
        libraryComponentId: component.id || undefined,
        pins: nextPinsForSlot,
        backshellPartNumber: keepBackshell ? slot.backshellPartNumber : undefined,
        backshellLibraryComponentId: keepBackshell ? slot.backshellLibraryComponentId : undefined,
        strainReliefPartNumber: keepStrainRelief ? slot.strainReliefPartNumber : undefined,
        strainReliefLibraryComponentId: keepStrainRelief ? slot.strainReliefLibraryComponentId : undefined
      };
    });
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) =>
        connector.id === activeConnector.id
          ? { ...connector, slots: nextSlots, pins: flattenFramePins(nextSlots) }
          : connector
      )
    );
  };

  const commitSlotName = (slotId: string, rawValue: string) => {
    if (readOnly || !selectedEntity || selectedEntity.type !== "connector") {
      return;
    }
    const activeConnector = connectors.find((connector) => connector.id === selectedEntity.id);
    const activeSlot = activeConnector?.slots?.find((slot) => slot.slotId === slotId);
    if (!activeConnector || !activeSlot) {
      return;
    }
    const normalized = rawValue.trim();
    if (!normalized) {
      setSlotNameErrors((previous) => ({ ...previous, [slotId]: "Module name is required." }));
      return;
    }
    if (normalized === activeSlot.reference) {
      setSlotNameErrors((previous) => ({ ...previous, [slotId]: "" }));
      return;
    }
    const taken = usedConnectorReferences(
      connectors.map((connector) =>
        connector.id === activeConnector.id
          ? {
              ...connector,
              slots: (connector.slots ?? []).filter((slot) => slot.slotId !== slotId)
            }
          : connector
      )
    ).has(normalized.toLowerCase());
    if (taken) {
      setSlotNameErrors((previous) => ({ ...previous, [slotId]: "That name is already used by another connector." }));
      return;
    }
    setSlotNameErrors((previous) => ({ ...previous, [slotId]: "" }));
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) =>
        connector.id === activeConnector.id
          ? {
              ...connector,
              slots: (connector.slots ?? []).map((slot) =>
                slot.slotId === slotId ? { ...slot, reference: normalized } : slot
              )
            }
          : connector
      )
    );
  };

  const applySlotAccessorySelection = (
    slotId: string,
    kind: "backshell" | "strainRelief",
    componentId: string
  ) => {
    if (readOnly || !selectedEntity || selectedEntity.type !== "connector") {
      return;
    }
    const activeConnector = connectors.find((connector) => connector.id === selectedEntity.id);
    if (!activeConnector?.slots) {
      return;
    }
    const catalog = kind === "backshell" ? backshellCatalogState : strainReliefCatalogState;
    const component = catalog.find((entry) => entry.id === componentId);
    const nextPartNumber = component?.partNumber.trim() || undefined;
    const nextLibraryId = component?.id || undefined;
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) => {
        if (connector.id !== activeConnector.id) {
          return connector;
        }
        return {
          ...connector,
          slots: (connector.slots ?? []).map((slot) => {
            if (slot.slotId !== slotId) {
              return slot;
            }
            if (kind === "backshell") {
              return {
                ...slot,
                backshellPartNumber: nextPartNumber,
                backshellLibraryComponentId: nextLibraryId
              };
            }
            return {
              ...slot,
              strainReliefPartNumber: nextPartNumber,
              strainReliefLibraryComponentId: nextLibraryId
            };
          })
        };
      })
    );
  };

  const applyConnectorAccessorySelection = (
    kind: "backshell" | "strainRelief",
    componentId: string
  ) => {
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
    const catalog = kind === "backshell" ? backshellCatalogState : strainReliefCatalogState;
    const component = catalog.find((entry) => entry.id === componentId);
    const nextPartNumber = component?.partNumber.trim() || undefined;
    const nextLibraryId = component?.id || undefined;
    const partKey = kind === "backshell" ? "backshellPartNumber" : "strainReliefPartNumber";
    const idKey = kind === "backshell" ? "backshellLibraryComponentId" : "strainReliefLibraryComponentId";
    if (activeConnector[partKey] === nextPartNumber && activeConnector[idKey] === nextLibraryId) {
      return;
    }
    pushUndoCheckpoint();
    setConnectors((previous) =>
      previous.map((connector) =>
        connector.id === activeConnector.id
          ? {
              ...connector,
              [partKey]: nextPartNumber,
              [idKey]: nextLibraryId
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

  useEffect(() => {
    if (readOnly) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if ((key === "delete" || key === "backspace") && selectedEntity) {
        event.preventDefault();
        removeSelectedEntity();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
          <button type="button" className={styles.undoButton} onClick={handleUndo} disabled={readOnly || !canUndo}>
            Undo
          </button>
          <button type="button" className={styles.undoButton} onClick={handleRedo} disabled={readOnly || !canRedo}>
            Redo
          </button>
          <span className={styles.selectionSummary}>Selected: {selectedEntityLabel}</span>
          <span
            className={dirty || conflict ? styles.saveStatusDirty : styles.saveStatus}
            data-testid="canvas-save-status"
            aria-live="polite"
          >
            {readOnly ? "View only" : saveMessage}
          </span>
          {conflict ? (
            <button
              type="button"
              className={styles.undoButton}
              data-testid="canvas-conflict-reload"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          ) : null}
        </div>
        <div className={styles.selectionDetailsShell}>
          {selectedEntity?.type === "path" ? (
            <div className={styles.detailPanel}>
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
              {moduleDefined ? (
                <button
                  type="button"
                  className={styles.changeConnectorButton}
                  onClick={() => {
                    setConnectorSearchTarget("housing");
                    setShowConnectorSearchDialog(true);
                  }}
                  disabled={readOnly}
                  aria-label="Change connector"
                >
                  {selectedConnector.partNumber
                    ? `Part number: ${selectedConnector.partNumber}`
                    : "Change connector"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setConnectorSearchTarget("housing");
                    setShowConnectorSearchDialog(true);
                  }}
                  disabled={readOnly}
                >
                  Define Connector
                </button>
              )}
              {selectedIsFrame ? (
                <div className={styles.slotBlocks}>
                  {(selectedConnector.slots ?? []).map((slot) => {
                    const slotModuleDefined = Boolean(slot.libraryComponentId);
                    const backshellStatus = new Map(
                      moduleBackshellCompat
                        .filter((row) => row.modulePartId === slot.libraryComponentId)
                        .map((row) => [row.backshellPartId, row.status] as const)
                    );
                    const strainStatus = new Map(
                      moduleStrainReliefCompat
                        .filter((row) => row.modulePartId === slot.libraryComponentId)
                        .map((row) => [row.strainReliefPartId, row.status] as const)
                    );
                    const slotBackshells = filterAllowedAccessoryOptionsForModule(
                      backshellCatalogState,
                      slot.libraryComponentId,
                      backshellStatus
                    );
                    const slotStrainReliefs = filterAllowedAccessoryOptionsForModule(
                      strainReliefCatalogState,
                      slot.libraryComponentId,
                      strainStatus
                    );
                    return (
                      <div key={slot.slotId} className={styles.slotBlock}>
                        <label>
                          Slot {slot.slotId} name
                          <input
                            className={styles.slotNameInput}
                            value={slotNameDrafts[slot.slotId] ?? slot.reference}
                            disabled={readOnly}
                            onChange={(event) =>
                              setSlotNameDrafts((previous) => ({
                                ...previous,
                                [slot.slotId]: event.target.value
                              }))
                            }
                            onBlur={(event) => commitSlotName(slot.slotId, event.target.value)}
                            placeholder={`e.g. ${selectedConnector.reference}${slot.slotId}`}
                            aria-label={`Slot ${slot.slotId} module name`}
                          />
                        </label>
                        {slotNameErrors[slot.slotId] ? (
                          <span className={styles.quickAddError}>{slotNameErrors[slot.slotId]}</span>
                        ) : null}
                        {slotModuleDefined ? (
                          <button
                            type="button"
                            className={styles.changeConnectorButton}
                            onClick={() => {
                              setConnectorSearchTarget({ slotId: slot.slotId });
                              setShowConnectorSearchDialog(true);
                            }}
                            disabled={readOnly}
                            aria-label={`Change slot ${slot.slotId} module`}
                          >
                            {slot.partNumber ? `Part number: ${slot.partNumber}` : "Change module"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConnectorSearchTarget({ slotId: slot.slotId });
                              setShowConnectorSearchDialog(true);
                            }}
                            disabled={readOnly}
                            aria-label={`Define slot ${slot.slotId} module`}
                          >
                            Select module
                          </button>
                        )}
                        <label>
                          Backshell
                          <select
                            value={slot.backshellLibraryComponentId ?? ""}
                            disabled={readOnly || !slotModuleDefined}
                            aria-label={`Slot ${slot.slotId} backshell`}
                            onChange={(event) =>
                              applySlotAccessorySelection(slot.slotId, "backshell", event.target.value)
                            }
                          >
                            <option value="">No backshell</option>
                            {slotBackshells.map((option) => (
                              <option key={option.component.id} value={option.component.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Strain relief
                          <select
                            value={slot.strainReliefLibraryComponentId ?? ""}
                            disabled={readOnly || !slotModuleDefined}
                            aria-label={`Slot ${slot.slotId} strain relief`}
                            onChange={(event) =>
                              applySlotAccessorySelection(slot.slotId, "strainRelief", event.target.value)
                            }
                          >
                            <option value="">No strain relief</option>
                            {slotStrainReliefs.map((option) => (
                              <option key={option.component.id} value={option.component.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <label>
                    Backshell
                    <select
                      value={selectedConnector.backshellLibraryComponentId ?? ""}
                      disabled={readOnly || !moduleDefined}
                      onChange={(event) => applyConnectorAccessorySelection("backshell", event.target.value)}
                    >
                      <option value="">No backshell</option>
                      {selectedConnector.backshellLibraryComponentId &&
                      !allowedBackshellOptions.some(
                        (option) => option.component.id === selectedConnector.backshellLibraryComponentId
                      ) ? (
                        <option value={selectedConnector.backshellLibraryComponentId} disabled>
                          {selectedConnector.backshellPartNumber ?? selectedConnector.backshellLibraryComponentId}{" "}
                          (incompatible — reselect)
                        </option>
                      ) : null}
                      {allowedBackshellOptions.map((option) => (
                        <option key={option.component.id} value={option.component.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Strain relief
                    <select
                      value={selectedConnector.strainReliefLibraryComponentId ?? ""}
                      disabled={readOnly || !moduleDefined}
                      onChange={(event) => applyConnectorAccessorySelection("strainRelief", event.target.value)}
                    >
                      <option value="">No strain relief</option>
                      {selectedConnector.strainReliefLibraryComponentId &&
                      !allowedStrainReliefOptions.some(
                        (option) => option.component.id === selectedConnector.strainReliefLibraryComponentId
                      ) ? (
                        <option value={selectedConnector.strainReliefLibraryComponentId} disabled>
                          {selectedConnector.strainReliefPartNumber ??
                            selectedConnector.strainReliefLibraryComponentId}{" "}
                          (incompatible — reselect)
                        </option>
                      ) : null}
                      {allowedStrainReliefOptions.map((option) => (
                        <option key={option.component.id} value={option.component.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!moduleDefined ? (
                    <span className={styles.connectorPartNumber}>Define connector first</span>
                  ) : allowedBackshellOptions.length === 0 || allowedStrainReliefOptions.length === 0 ? (
                    <span className={styles.connectorPartNumber}>
                      No compatible options — add rows in Compatibility Manager
                    </span>
                  ) : null}
                </>
              )}
              {connectorQuickAddNotice ? <span className={styles.quickAddNotice}>{connectorQuickAddNotice}</span> : null}
              {connectorQuickAddError ? <span className={styles.quickAddError}>{connectorQuickAddError}</span> : null}
            </div>
          ) : null}
          {selectedEntity?.type === "junction" && selectedJunction ? (
            <div className={styles.detailPanel}>
              <label>
                Junction label
                <input
                  value={junctionLabelDraft}
                  disabled={readOnly}
                  onChange={(event) => setJunctionLabelDraft(event.target.value)}
                  onBlur={(event) => commitJunctionLabel(event.target.value)}
                  placeholder="e.g. Splice-A"
                />
              </label>
              <span className={styles.connectorPartNumber}>Id: {selectedJunction.id}</span>
            </div>
          ) : null}
          {!selectedEntity ? <div className={styles.detailPanelEmpty} aria-hidden="true" /> : null}
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
              const inputName = field.isIdentity ? field.key : `attr:${field.key}`;
              return (
                <label key={field.key}>
                  {field.label}
                  <input
                    name={inputName}
                    placeholder={field.label}
                    required={field.required === true || field.key === "partNumber"}
                    type={field.inputType === "number" ? "number" : "text"}
                  />
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
        <div
          className={styles.quickAddOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={connectorSearchTarget === "housing" ? "Define Connector" : `Select slot ${connectorSearchTarget.slotId} module`}
        >
          <div className={styles.connectorSearchDialog}>
            <h3>
              {connectorSearchTarget === "housing"
                ? "Define Connector"
                : `Select slot ${connectorSearchTarget.slotId} module`}
            </h3>
            <div className={styles.connectorSearchControls}>
              <input
                className={styles.connectorSearchInput}
                value={connectorSearchQuery}
                onChange={(event) => setConnectorSearchQuery(event.target.value)}
                placeholder={connectorSearchTarget === "housing" ? "Search connectors..." : "Search modules..."}
                autoFocus
              />
              {connectorSearchTarget === "housing" ? (
                <button type="button" onClick={() => setShowAddConnectorDialog(true)} disabled={readOnly}>
                  Add new connector
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.reverseCompatToggle}
                  aria-pressed={includeReverseCompat}
                  onClick={() => setIncludeReverseCompat((value) => !value)}
                >
                  show reverse compatibility modules
                </button>
              )}
            </div>
            <div className={styles.connectorSearchTableWrap}>
              <table className={styles.connectorSearchTable}>
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    {connectorSearchColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredConnectorSearchResults.length === 0 ? (
                    <tr>
                      <td colSpan={connectorSearchColumns.length + 1}>
                        {connectorSearchTarget === "housing"
                          ? "No connectors found."
                          : includeReverseCompat
                            ? "No reverse-compatible modules for this slot."
                            : "No compatible modules for this slot."}
                      </td>
                    </tr>
                  ) : (
                    filteredConnectorSearchResults.map((component) => (
                      <tr key={component.id}>
                        <td>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              if (connectorSearchTarget === "housing") {
                                applyConnectorLibrarySelection(component);
                              } else {
                                applySlotModuleSelection(connectorSearchTarget.slotId, component);
                              }
                              setShowConnectorSearchDialog(false);
                              setConnectorSearchQuery("");
                              setIncludeReverseCompat(false);
                            }}
                          >
                            Select
                          </button>
                        </td>
                        {connectorSearchColumns.map((column) => (
                          <td key={column.key}>
                            {column.key === "partType"
                              ? displayPartType(component.partType) || "-"
                              : readComponentFieldValue(component, column.key)}
                          </td>
                        ))}
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
                  setIncludeReverseCompat(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
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
                      ` | ${getSleevingLabel(pathEntry?.sleeving ?? "none")}`}
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
            snapshot={snapshot}
            connectors={connectors}
            junctions={junctions}
            paths={pathsState}
            connectorCatalog={connectorCatalogState}
          />
        ) : null}
      </section>
    </section>
  );
}
