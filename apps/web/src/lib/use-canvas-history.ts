"use client";

import { useCallback, useState } from "react";
import type { RevisionDto } from "./api";

export type CanvasNodePosition = {
  x: number;
  y: number;
};

export type CanvasSelection =
  | { type: "connector"; id: string }
  | { type: "junction"; id: string }
  | { type: "path"; id: string };

export type CanvasUndoSnapshot = {
  connectors: RevisionDto["snapshot"]["connectors"];
  junctions: NonNullable<RevisionDto["snapshot"]["junctions"]>;
  paths: RevisionDto["snapshot"]["paths"];
  positions: Record<string, CanvasNodePosition>;
  selectedEntity: CanvasSelection | null;
  selectedPathId: string;
};

const DEFAULT_HISTORY_LIMIT = 25;

function truncateHistory<T>(entries: T[], limit: number): T[] {
  return entries.length > limit ? entries.slice(entries.length - limit) : entries;
}

export function useCanvasHistory(limit = DEFAULT_HISTORY_LIMIT) {
  const [undoStack, setUndoStack] = useState<CanvasUndoSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasUndoSnapshot[]>([]);

  const pushCheckpoint = useCallback(
    (snapshot: CanvasUndoSnapshot) => {
      setUndoStack((previous) => truncateHistory([...previous, snapshot], limit));
      setRedoStack([]);
    },
    [limit]
  );

  const undo = useCallback((current: CanvasUndoSnapshot): CanvasUndoSnapshot | null => {
    const previous = undoStack.at(-1);
    if (!previous) {
      return null;
    }
    setRedoStack((stack) => truncateHistory([...stack, current], limit));
    setUndoStack((stack) => stack.slice(0, -1));
    return previous;
  }, [limit, undoStack]);

  const redo = useCallback((current: CanvasUndoSnapshot): CanvasUndoSnapshot | null => {
    const next = redoStack.at(-1);
    if (!next) {
      return null;
    }
    setUndoStack((stack) => truncateHistory([...stack, current], limit));
    setRedoStack((stack) => stack.slice(0, -1));
    return next;
  }, [limit, redoStack]);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pushCheckpoint,
    undo,
    redo,
    clear
  };
}
