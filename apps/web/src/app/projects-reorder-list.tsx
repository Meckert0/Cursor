"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import styles from "./page.module.css";

type ProjectListItem = {
  id: string;
  name: string;
  description?: string;
  harnessCount: number;
};

function applyStoredOrder(items: ProjectListItem[], orderedIds: string[]): ProjectListItem[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const ordered: ProjectListItem[] = [];

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

function moveItem(items: ProjectListItem[], sourceId: string, targetId: string): ProjectListItem[] {
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

export function ProjectsReorderList({
  items,
  renameAction,
  deleteAction
}: {
  items: ProjectListItem[];
  renameAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const storageKey = "cdt-project-order";
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
  }, [orderedItems]);

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
    <ul className={styles.projectList} data-testid="project-list">
      {orderedItems.map((project) => (
        <li
          key={project.id}
          className={draggingId === project.id ? styles.projectDragging : undefined}
          onDragOver={handleDragOver(project.id)}
          onDrop={handleDrop}
        >
          <div className={styles.projectRow}>
            <button
              type="button"
              className={styles.dragHandle}
              draggable
              onDragStart={handleDragStart(project.id)}
              onDragEnd={() => setDraggingId(null)}
              aria-label={`Drag to reorder ${project.name}`}
              title="Drag to reorder"
            >
              &#9776;
            </button>
            <div className={styles.projectTitleGroup}>
              <div className={styles.projectNameLine}>
                <strong className={styles.projectName}>
                  <Link className={styles.projectLink} href={`/projects/${project.id}`}>
                    {project.name}
                  </Link>
                </strong>
                {project.description ? <span className={styles.projectDescription} title={project.description}>{project.description}</span> : null}
              </div>
              <span className={styles.projectHarnessCount}>
                {project.harnessCount} {project.harnessCount === 1 ? "Harness" : "Harnesses"}
              </span>
            </div>
            <div className={styles.projectRowActions}>
              <details>
                <summary className={styles.renameSummary}>Rename project</summary>
                <form action={renameAction} className={styles.renameForm} data-testid={`rename-project-form-${project.id}`}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="currentProjectName" value={project.name} />
                  <label>
                    New project name
                    <input
                      name="nextProjectName"
                      type="text"
                      required
                      defaultValue={project.name}
                      aria-label={`Rename ${project.name}`}
                      autoComplete="off"
                    />
                  </label>
                  <button type="submit" className={styles.renameButton}>
                    Save name
                  </button>
                </form>
              </details>
              <form action={deleteAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <ConfirmSubmitButton
                  type="submit"
                  className={styles.deleteButton}
                  confirmMessage={`Delete project "${project.name}"?`}
                  data-testid={`delete-project-${project.id}`}
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
