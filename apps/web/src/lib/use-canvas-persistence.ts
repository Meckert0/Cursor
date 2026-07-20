"use client";

import { useEffect, useRef, useState } from "react";
import type { RevisionDto } from "./api";
import { isSnapshotConflictError } from "./api";
import {
  buildSnapshotFromCanvas,
  canvasDraftStorageKey,
  writeCanvasLocalDraft,
  type CanvasLocalDraft
} from "./cable-canvas-utils";

const SAVE_DEBOUNCE_MS = 800;
const RETRY_DELAY_MS = 2000;

export type CanvasSaveResult = {
  ok: boolean;
  snapshot?: RevisionDto["snapshot"];
  snapshotHash?: string;
  conflict?: boolean;
  error?: string;
};

type SaveCanvasAction = (input: {
  snapshot: RevisionDto["snapshot"];
  expectedSnapshotHash: string;
}) => Promise<CanvasSaveResult>;

type UseCanvasPersistenceInput = {
  revisionId: string;
  baselineSnapshot: RevisionDto["snapshot"];
  baselineSnapshotHash: string;
  connectors: RevisionDto["snapshot"]["connectors"];
  junctions: NonNullable<RevisionDto["snapshot"]["junctions"]>;
  paths: RevisionDto["snapshot"]["paths"];
  positions: CanvasLocalDraft["positions"];
  saveCanvasAction?: SaveCanvasAction;
  readOnly?: boolean;
  initiallyDirty?: boolean;
};

export function useCanvasPersistence({
  revisionId,
  baselineSnapshot,
  baselineSnapshotHash,
  connectors,
  junctions,
  paths,
  positions,
  saveCanvasAction,
  readOnly = false,
  initiallyDirty = false
}: UseCanvasPersistenceInput) {
  const [baseline, setBaseline] = useState(baselineSnapshot);
  const [baselineHash, setBaselineHash] = useState(baselineSnapshotHash);
  const [dirty, setDirty] = useState(initiallyDirty);
  const [conflict, setConflict] = useState(false);
  const [saveMessage, setSaveMessage] = useState(
    initiallyDirty ? "Unsaved changes." : "All changes saved."
  );
  const [retryTick, setRetryTick] = useState(0);
  const skipDirtyTrackingRef = useRef(true);
  const retryTimeoutRef = useRef<number | null>(null);
  const saveCanvasActionRef = useRef<SaveCanvasAction | undefined>(saveCanvasAction);
  const layoutStorageKey = `cable-canvas-layout:${revisionId}`;

  useEffect(() => {
    saveCanvasActionRef.current = saveCanvasAction;
  }, [saveCanvasAction]);

  useEffect(() => {
    setBaseline(baselineSnapshot);
    setBaselineHash(baselineSnapshotHash);
  }, [baselineSnapshot, baselineSnapshotHash]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      writeCanvasLocalDraft(revisionId, {
        connectors,
        junctions,
        paths,
        positions,
        dirty,
        updatedAt: new Date().toISOString()
      });
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(positions));
    } catch {
      // ignore storage failures
    }
  }, [connectors, dirty, junctions, layoutStorageKey, paths, positions, revisionId]);

  useEffect(() => {
    if (skipDirtyTrackingRef.current) {
      skipDirtyTrackingRef.current = false;
      return;
    }
    if (readOnly || !saveCanvasActionRef.current || conflict) {
      return;
    }
    setDirty(true);
    setSaveMessage("Unsaved changes.");
    // Intentionally omit saveCanvasAction: Next.js revalidation can replace the
    // server-action reference without any canvas content change.
  }, [connectors, conflict, junctions, paths, positions, readOnly]);

  useEffect(() => {
    const saveAction = saveCanvasActionRef.current;
    if (!dirty || readOnly || !saveAction || conflict) {
      return;
    }
    const timeoutId = window.setTimeout(async () => {
      setSaveMessage("Saving...");
      try {
        if (retryTimeoutRef.current !== null) {
          window.clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        const nextSnapshot = buildSnapshotFromCanvas(baseline, {
          connectors,
          junctions,
          paths,
          positions
        });
        const result = await saveAction({
          snapshot: nextSnapshot,
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
        setBaseline(result.snapshot);
        if (result.snapshotHash) {
          setBaselineHash(result.snapshotHash);
        }
        setDirty(false);
        setSaveMessage(`Saved at ${new Date().toLocaleTimeString()}.`);
        writeCanvasLocalDraft(revisionId, {
          connectors,
          junctions,
          paths,
          positions,
          dirty: false,
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        if (isSnapshotConflictError(error)) {
          setConflict(true);
          setSaveMessage(error.message);
          return;
        }
        const errorMessage = error instanceof Error ? error.message : "Save failed.";
        setSaveMessage(`Save failed (${errorMessage}). Retrying...`);
        retryTimeoutRef.current = window.setTimeout(() => setRetryTick((previous) => previous + 1), RETRY_DELAY_MS);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    baseline,
    baselineHash,
    conflict,
    connectors,
    dirty,
    junctions,
    paths,
    positions,
    readOnly,
    retryTick,
    revisionId
  ]);

  return {
    dirty,
    conflict,
    saveMessage,
    draftStorageKey: canvasDraftStorageKey(revisionId)
  };
}
