"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { pickerColumn, type PickerColumnId, type PickerMode } from "./connector-picker";
import { clampPickerWidth, defaultPickerLayout, movePickerColumn, pickerLayoutWidth, readPickerLayout, savePickerLayout } from "./connector-picker-layout";

type Drop = { id: PickerColumnId; after: boolean };
type Interaction = { id: PickerColumnId; kind: "move" | "resize"; startX: number; startWidth: number; x: number; y: number; drop: Drop | null };

export function usePickerColumns(mode: PickerMode, tableRef: RefObject<HTMLTableElement | null>, scrollRef: RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState(() => readPickerLayout(mode));
  const [active, setActive] = useState<{ id: PickerColumnId; kind: "move" | "resize" } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const interaction = useRef<Interaction | null>(null);
  const scrollFrame = useRef<number | null>(null);
  useEffect(() => { savePickerLayout(mode, layout); }, [mode, layout]);
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); }, []);
  const columns = layout.order.filter(id => layout.visible.includes(id)).map(pickerColumn);
  const width = (id: PickerColumnId) => pickerLayoutWidth(layout, id);
  const focusGrip = (id: PickerColumnId) => requestAnimationFrame(() => tableRef.current?.querySelector<HTMLButtonElement>(`[data-picker-column="${id}"] [data-column-grip]`)?.focus({ preventScroll: true }));
  const move = (source: PickerColumnId, target: PickerColumnId, after: boolean) => {
    setLayout(previous => ({ ...previous, order: movePickerColumn(previous.order, source, target, after) }));
    setAnnouncement(`${pickerColumn(source).label} moved ${after ? "after" : "before"} ${pickerColumn(target).label}.`);
    focusGrip(source);
  };
  const resize = (id: PickerColumnId, nextWidth: number) => setLayout(previous => ({ ...previous, widths: { ...previous.widths, [id]: clampPickerWidth(nextWidth) } }));
  const updateDrop = () => {
    const current = interaction.current;
    if (!current || current.kind !== "move") return;
    const header = document.elementFromPoint(current.x, current.y)?.closest<HTMLElement>("th[data-picker-column]");
    const id = header?.dataset.pickerColumn as PickerColumnId | undefined;
    const next = id && id !== current.id && header?.closest("table") === tableRef.current
      ? { id, after: current.x > header.getBoundingClientRect().left + header.getBoundingClientRect().width / 2 } : null;
    current.drop = next;
    setDrop(previous => previous?.id === next?.id && previous?.after === next?.after ? previous : next);
  };
  const autoScroll = () => {
    const current = interaction.current, scroll = scrollRef.current;
    if (!current || current.kind !== "move" || !scroll) return;
    const bounds = scroll.getBoundingClientRect();
    if (current.y >= bounds.top && current.y <= bounds.bottom) {
      const delta = current.x < bounds.left + 28 ? -14 : current.x > bounds.right - 28 ? 14 : 0;
      if (delta) { scroll.scrollLeft += delta; updateDrop(); }
    }
    scrollFrame.current = requestAnimationFrame(autoScroll);
  };
  const start = (event: PointerEvent<HTMLElement>, id: PickerColumnId, kind: "move" | "resize") => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    interaction.current = { id, kind, startX: event.clientX, startWidth: width(id), x: event.clientX, y: event.clientY, drop: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setActive({ id, kind }); setDrop(null);
    if (kind === "move") scrollFrame.current = requestAnimationFrame(autoScroll);
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = interaction.current;
    if (!current) return;
    current.x = event.clientX; current.y = event.clientY;
    if (current.kind === "resize") resize(current.id, current.startWidth + event.clientX - current.startX);
    else updateDrop();
  };
  const finish = (cancel = false) => {
    const current = interaction.current;
    if (!current) return;
    if (cancel && current.kind === "resize") resize(current.id, current.startWidth);
    if (!cancel && current.kind === "move" && current.drop) move(current.id, current.drop.id, current.drop.after);
    interaction.current = null;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null; setActive(null); setDrop(null);
  };
  const gripKeyDown = (event: KeyboardEvent<HTMLElement>, id: PickerColumnId) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); event.stopPropagation();
    const target = columns[columns.findIndex(column => column.id === id) + (event.key === "ArrowLeft" ? -1 : 1)];
    if (target) move(id, target.id, event.key === "ArrowRight");
  };
  const resizeKeyDown = (event: KeyboardEvent<HTMLElement>, id: PickerColumnId) => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    resize(id, event.key === "Home" ? pickerColumn(id).width : width(id) + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 50 : 10));
  };
  return { layout, columns, width, active, drop, announcement, start, pointerMove, finish, gripKeyDown, resizeKeyDown,
    resize, setVisible: (visible: PickerColumnId[]) => setLayout(previous => ({ ...previous, visible })),
    reset: () => setLayout(defaultPickerLayout(mode)),
    cancelInteraction: () => { if (!interaction.current) return false; finish(true); return true; }
  };
}
