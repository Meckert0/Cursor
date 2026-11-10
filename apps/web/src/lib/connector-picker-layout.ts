import { CONNECTOR_PICKER_COLUMNS, pickerColumn, pickerDefaultColumns, type PickerColumnId, type PickerMode } from "./connector-picker";

export const MIN_PICKER_COLUMN_WIDTH = 96;
export const MAX_PICKER_COLUMN_WIDTH = 900;
export interface PickerLayout {
  order: PickerColumnId[];
  visible: PickerColumnId[];
  widths: Partial<Record<PickerColumnId, number>>;
}
const ids = CONNECTOR_PICKER_COLUMNS.map(column => column.id);
const key = (mode: PickerMode) => `connector-picker.layout.v1.${mode}`;
const knownId = (value: unknown): value is PickerColumnId => typeof value === "string" && ids.includes(value as PickerColumnId);
const cleanIds = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(knownId))] : [];
export const clampPickerWidth = (value: number) => Math.round(Math.max(MIN_PICKER_COLUMN_WIDTH, Math.min(MAX_PICKER_COLUMN_WIDTH, value)));
export const pickerLayoutWidth = (layout: PickerLayout, id: PickerColumnId) => layout.widths[id] ?? pickerColumn(id).width;
export const defaultPickerLayout = (mode: PickerMode): PickerLayout => ({ order: [...ids], visible: pickerDefaultColumns(mode), widths: {} });

export function normalizePickerLayout(value: unknown, mode: PickerMode): PickerLayout {
  const fallback = defaultPickerLayout(mode);
  if (!value || typeof value !== "object") return fallback;
  const data = value as Partial<Record<keyof PickerLayout, unknown>>;
  const order = cleanIds(data.order);
  const visible = Array.isArray(data.visible) ? cleanIds(data.visible) : fallback.visible;
  const widths = Object.fromEntries(Object.entries(data.widths && typeof data.widths === "object" ? data.widths : {})
    .filter(([id, width]) => knownId(id) && typeof width === "number" && Number.isFinite(width))
    .map(([id, width]) => [id, clampPickerWidth(width as number)]));
  return { order: [...order, ...ids.filter(id => !order.includes(id))], visible: [...new Set<PickerColumnId>(["partNumber", ...visible])], widths };
}

export function readPickerLayout(mode: PickerMode): PickerLayout {
  try { return normalizePickerLayout(JSON.parse(window.localStorage.getItem(key(mode)) ?? "null"), mode); }
  catch { return defaultPickerLayout(mode); }
}
export function savePickerLayout(mode: PickerMode, layout: PickerLayout) {
  try { window.localStorage.setItem(key(mode), JSON.stringify(layout)); } catch { /* View controls remain usable when storage is unavailable. */ }
}

export function movePickerColumn(order: PickerColumnId[], source: PickerColumnId, target: PickerColumnId, after = false): PickerColumnId[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter(id => id !== source);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
  return next;
}
