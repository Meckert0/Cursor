"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import styles from "./harness-reorder-list.module.css";

type HarnessListItem = {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
};

function applyStoredOrder(items: HarnessListItem[], orderedIds: string[]): HarnessListItem[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const ordered: HarnessListItem[] = [];

  for (const id of orderedIds) {
    const item = itemById.get(id);
    if (item) {
      ordered.push(item);
      itemById.delete(id);
    }
  }

  for (const item of items) {
    if (itemById.has(item.id)) {
      ordered.push(item);
    }
  }

  return ordered;
}

function moveItem(items: HarnessListItem[], sourceId: string, targetId: string): HarnessListItem[] {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items;
  }

  const next = items.slice();
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function HarnessReorderList({
  projectId,
  items,
  renameAction,
  deleteAction
}: {
  projectId: string;
  items: HarnessListItem[];
  renameAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const storageKey = useMemo(() => `cdt-harness-order:${projectId}`, [projectId]);
  const [orderIds, setOrderIds] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return items.map((item) => item.id);
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return items.map((item) => item.id);
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return items.map((item) => item.id);
      }
      const ordered = parsed.filter((value): value is string => typeof value === "string");
      return ordered.length > 0 ? ordered : items.map((item) => item.id);
    } catch {
      return items.map((item) => item.id);
    }
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const orderedItems = useMemo(() => applyStoredOrder(items, orderIds), [items, orderIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(orderedItems.map((item) => item.id)));
    } catch {
      // ignore storage failures
    }
  }, [orderedItems, storageKey]);

  const handleDragStart = (itemId: string) => (event: DragEvent<HTMLButtonElement>) => {
    setDraggingId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  };

  const handleDragOver = (targetId: string) => (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    const sourceId = draggingId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) {
      return;
    }
    setOrderIds((currentOrderIds) => moveItem(applyStoredOrder(items, currentOrderIds), sourceId, targetId).map((item) => item.id));
  };

  const handleDrop = () => {
    setDraggingId(null);
  };

  return (
    <ul className={styles.list}>
      {orderedItems.map((harness) => (
        <li
          key={harness.id}
          className={`${styles.listItem}${draggingId === harness.id ? ` ${styles.dragging}` : ""}`}
          onDragOver={handleDragOver(harness.id)}
          onDrop={handleDrop}
        >
          <div className={styles.harnessRow}>
            <button
              type="button"
              className={styles.dragHandle}
              draggable
              onDragStart={handleDragStart(harness.id)}
              onDragEnd={() => setDraggingId(null)}
              aria-label={`Drag to reorder ${harness.name}`}
              title="Drag to reorder"
            >
              &#9776;
            </button>
            <div className={styles.harnessMeta}>
              <div className={styles.harnessNameLine}>
                <strong className={styles.harnessName}>
                  <Link href={`/harnesses/${harness.id}/canvas`}>{harness.name}</Link>
                </strong>
                {harness.description?.trim() ? (
                  <span className={styles.harnessDescription} title={harness.description}>
                    {harness.description}
                  </span>
                ) : null}
              </div>
              <span className={styles.harnessUpdatedAt}>Updated {new Date(harness.updatedAt).toLocaleString()}</span>
            </div>
            <div className={styles.itemActions}>
              <details>
                <summary className={styles.renameSummary}>Rename harness</summary>
                <form action={renameAction} className={styles.renameForm}>
                  <input type="hidden" name="harnessId" value={harness.id} />
                  <input type="hidden" name="currentHarnessName" value={harness.name} />
                  <label>
                    New harness name
                    <input name="nextHarnessName" type="text" required defaultValue={harness.name} autoComplete="off" />
                  </label>
                  <button type="submit" className={styles.renameButton}>
                    Save name
                  </button>
                </form>
              </details>
              <details>
                <summary className={styles.deleteSummary}>Delete harness</summary>
                <form action={deleteAction} className={styles.deleteForm}>
                  <input type="hidden" name="harnessId" value={harness.id} />
                  <input type="hidden" name="harnessName" value={harness.name} />
                  <label>
                    Type <strong>{harness.name}</strong> to confirm
                    <input name="confirmHarnessName" type="text" required autoComplete="off" />
                  </label>
                  <button type="submit" className={styles.deleteButton}>
                    Confirm delete
                  </button>
                </form>
              </details>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
