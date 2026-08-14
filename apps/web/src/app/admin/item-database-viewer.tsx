"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type UIEvent, type WheelEvent } from "react";
import { useFormStatus } from "react-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  useReactTable
} from "@tanstack/react-table";
import {
  getLibraryTablePreferences,
  LIBRARY_ITEM_CATEGORIES,
  type LibraryItemCategory,
  updateLibraryTablePreferences,
  type LibraryComponentDto,
  type LibraryTablePreferencesDto
} from "@/lib/api";
import {
  emptyAttributesForCategory,
  formatPartFieldDisplayValue,
  getPartFieldsForCategory,
  readPartFieldRawValue,
  type PartFieldMeta
} from "@/lib/part-fields";
import {
  pickLatestTableLayout,
  readLocalTableLayoutSnapshot,
  writeLocalTableLayoutSnapshot
} from "./table-layout-persistence";
import styles from "./page.module.css";

type Category = LibraryItemCategory;

function normalizeRuntimeCategory(rawCategory: unknown): Category | null {
  const normalized = String(rawCategory ?? "").trim();
  if (LIBRARY_ITEM_CATEGORIES.includes(normalized as Category)) {
    return normalized as Category;
  }
  // Backward compatibility for legacy records stored before taxonomy rename.
  if (normalized === "connector") {
    return "contact";
  }
  return null;
}

interface ItemDatabaseViewerProps {
  items: LibraryComponentDto[];
  visibleCategories: readonly Category[];
  categoryLabel: Record<Category, string>;
  q?: string;
  category?: Category;
  family?: string;
  awg?: string;
  color?: string;
  createAction: (formData: FormData) => void | Promise<void>;
  editAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  currentUserId: string;
}

interface CategoryVirtualTableProps {
  category: Category;
  items: LibraryComponentDto[];
  editAction: ItemDatabaseViewerProps["editAction"];
  deleteAction: ItemDatabaseViewerProps["deleteAction"];
}

const ROW_HEIGHT = 34;
const OVERSCAN = 10;
const COLUMN_MIN_WIDTH = 56;
const COLUMN_MAX_WIDTH = 560;
const LOCKED_FIRST_COLUMN_ID = "partNumber";
const ACTIONS_COLUMN_ID = "actions";

const DATETIME_FIELD_KEYS = new Set(["createdAt", "reviewedAt", "lastEditedAt"]);
const META_COLUMN_KEYS = new Set([
  "createdByUserId",
  "createdAt",
  "reviewedByUserId",
  "reviewedAt",
  "lastEditedByUserId",
  "lastEditedAt"
]);

const STOCK_STATUS_OPTIONS = [
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" }
] as const;

const columnHelper = createColumnHelper<LibraryComponentDto>();

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function clampWidth(value: number): number {
  return Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, Math.round(value)));
}

function normalizeColumnSizing(input: Record<string, number> | undefined): ColumnSizingState {
  if (!input) {
    return {};
  }
  const entries = Object.entries(input)
    .filter(([, width]) => Number.isFinite(width))
    .map(([columnId, width]) => [columnId, clampWidth(width)] as const);
  return Object.fromEntries(entries);
}

function getScopeByCategory(category: Category): string {
  return `admin_item_database_${category}`;
}

function getEditFieldScopeByCategory(category: Category): string {
  return `admin_item_database_edit_fields_${category}`;
}

function normalizeColumnOrder(inputOrder: string[], defaultOrder: string[]): string[] {
  const withoutLocked = inputOrder.filter((columnId) => columnId !== LOCKED_FIRST_COLUMN_ID);
  const allowedNonLocked = defaultOrder.filter((columnId) => columnId !== LOCKED_FIRST_COLUMN_ID);
  const orderedKnown = withoutLocked.filter((columnId) => allowedNonLocked.includes(columnId));
  const missing = allowedNonLocked.filter((columnId) => !orderedKnown.includes(columnId));
  return [LOCKED_FIRST_COLUMN_ID, ...orderedKnown, ...missing];
}

export function reorderColumnOrder(inputOrder: string[], sourceId: string, targetId: string, defaultOrder: string[]): string[] {
  const normalizedOrder = normalizeColumnOrder(inputOrder, defaultOrder);
  if (sourceId === targetId || sourceId === LOCKED_FIRST_COLUMN_ID || targetId === LOCKED_FIRST_COLUMN_ID) {
    return normalizedOrder;
  }
  if (!normalizedOrder.includes(sourceId) || !normalizedOrder.includes(targetId)) {
    return normalizedOrder;
  }
  return normalizeColumnOrder(moveOrderedItem(normalizedOrder, sourceId, targetId), defaultOrder);
}

export function normalizeEditableFieldOrder(inputOrder: string[], defaultOrder: string[]): string[] {
  const orderedKnown = inputOrder.filter((fieldId) => defaultOrder.includes(fieldId));
  const missing = defaultOrder.filter((fieldId) => !orderedKnown.includes(fieldId));
  return [...orderedKnown, ...missing];
}

function moveOrderedItem(items: string[], sourceId: string, targetId: string): string[] {
  const sourceIndex = items.indexOf(sourceId);
  const targetIndex = items.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

const CREATE_HIDDEN_FIELD_IDS = new Set([
  "createdByUserId",
  "createdAt",
  "isReviewed",
  "reviewedByUserId",
  "reviewedAt",
  "lastEditedByUserId",
  "lastEditedAt"
]);

export function getDefaultEditableFieldOrder(category: Category): string[] {
  return getPartFieldsForCategory(category).map((field) => field.key);
}

export function getCreateEditableFieldOrder(category: Category): string[] {
  return getPartFieldsForCategory(category)
    .filter((field) => field.showOnAddForm === true && !CREATE_HIDDEN_FIELD_IDS.has(field.key))
    .map((field) => field.key);
}

function getVisibleViewerFields(category: Category): PartFieldMeta[] {
  const fields = getPartFieldsForCategory(category).filter(
    (field) => field.isVisibleInViewer || field.key === LOCKED_FIRST_COLUMN_ID
  );
  const partNumber = fields.find((field) => field.key === LOCKED_FIRST_COLUMN_ID);
  const rest = fields.filter((field) => field.key !== LOCKED_FIRST_COLUMN_ID);
  return partNumber ? [partNumber, ...rest] : fields;
}

function getDefaultColumnSize(field: PartFieldMeta): number {
  switch (field.key) {
    case "partNumber":
      return 180;
    case "family":
      return 150;
    case "description":
      return 220;
    case "awg":
      return 100;
    case "color":
      return 120;
    case "isActive":
      return 90;
    case "isReviewed":
      return 92;
    case "createdByUserId":
      return 160;
    case "reviewedByUserId":
      return 165;
    case "lastEditedByUserId":
      return 170;
    case "createdAt":
    case "reviewedAt":
      return 170;
    case "lastEditedAt":
      return 180;
    default:
      return field.inputType === "boolean" ? 90 : field.inputType === "number" ? 110 : 150;
  }
}

function toLayoutPayload(
  scope: string,
  columnOrder: ColumnOrderState,
  columnSizing: ColumnSizingState,
  defaultColumnOrder: string[]
): LibraryTablePreferencesDto {
  return {
    scope,
    columnOrder: normalizeColumnOrder(columnOrder, defaultColumnOrder),
    columnWidths: Object.fromEntries(
      Object.entries(columnSizing)
        .filter(([, width]) => Number.isFinite(width))
        .map(([columnId, width]) => [columnId, clampWidth(width)])
    )
  };
}

function formatViewerCellValue(item: LibraryComponentDto, field: PartFieldMeta): string {
  const raw = readPartFieldRawValue(item, field);
  if (DATETIME_FIELD_KEYS.has(field.key) && typeof raw === "string") {
    return formatDateTime(raw);
  }
  return formatPartFieldDisplayValue(raw);
}

function getColumnDefs(
  category: Category,
  setEditingItem: (item: LibraryComponentDto) => void
): Array<ColumnDef<LibraryComponentDto>> {
  const fieldColumns = getVisibleViewerFields(category).map((field) => {
    const size = getDefaultColumnSize(field);
    if (field.key === LOCKED_FIRST_COLUMN_ID) {
      return columnHelper.accessor("partNumber", {
        id: LOCKED_FIRST_COLUMN_ID,
        header: field.label,
        size,
        minSize: 90,
        cell: ({ row, getValue }) => <Link href={`/library/${row.original.id}`}>{getValue()}</Link>
      });
    }
    return columnHelper.accessor((row) => formatViewerCellValue(row, field), {
      id: field.key,
      header: field.label,
      size,
      minSize: COLUMN_MIN_WIDTH,
      cell: ({ getValue }) => {
        const value = getValue();
        if (META_COLUMN_KEYS.has(field.key)) {
          return <span className={styles.metaCol}>{value}</span>;
        }
        return value;
      }
    });
  }) as Array<ColumnDef<LibraryComponentDto>>;

  const actionsColumn = columnHelper.display({
    id: ACTIONS_COLUMN_ID,
    header: "Actions",
    size: 100,
    minSize: 72,
    cell: ({ row }) => (
      <button type="button" className={styles.smallActionButton} onClick={() => setEditingItem(row.original)}>
        Edit
      </button>
    )
  });

  return [...fieldColumns, actionsColumn];
}

function toLocalDateTimeInputValue(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

type EditFieldType = "text" | "number" | "datetime-local" | "select";

interface EditableFieldConfig {
  id: string;
  name: string;
  label: string;
  type: EditFieldType;
  required?: boolean;
  defaultValue: string;
  options?: Array<{ value: string; label: string }>;
}

function resolvePartField(category: Category, fieldId: string): PartFieldMeta | undefined {
  return getPartFieldsForCategory(category).find((field) => field.key === fieldId);
}

function formatEditableDefaultValue(field: PartFieldMeta, raw: unknown): string {
  if (DATETIME_FIELD_KEYS.has(field.key)) {
    return toLocalDateTimeInputValue(typeof raw === "string" ? raw : undefined);
  }
  if (field.inputType === "boolean") {
    if (typeof raw === "boolean") {
      return String(raw);
    }
    if (raw === "true" || raw === "false") {
      return String(raw);
    }
    return "";
  }
  if (field.inputType === "string-list") {
    if (Array.isArray(raw)) {
      return raw.map(String).join(", ");
    }
    return raw == null ? "" : String(raw);
  }
  if (field.inputType === "number") {
    if (raw === undefined || raw === null || raw === "") {
      return "";
    }
    return String(raw);
  }
  if (raw === undefined || raw === null) {
    return "";
  }
  return String(raw);
}

function buildEditableFieldConfig(item: LibraryComponentDto, fieldId: string): EditableFieldConfig | null {
  const field = resolvePartField(item.category, fieldId);
  if (!field) {
    return null;
  }
  const name = field.isIdentity ? field.key : `attr:${field.key}`;
  const raw = readPartFieldRawValue(item, field);
  const defaultValue = formatEditableDefaultValue(field, raw);

  if (field.key === "stockStatus") {
    return {
      id: field.key,
      name,
      label: field.label,
      type: "select",
      required: field.required,
      defaultValue: defaultValue || "in_stock",
      options: STOCK_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
    };
  }

  if (field.inputType === "boolean") {
    const options =
      field.key === "isActive"
        ? [
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" }
          ]
        : field.key === "isReviewed"
          ? [
              { value: "true", label: "Yes" },
              { value: "false", label: "No" }
            ]
          : [
              { value: "true", label: "True" },
              { value: "false", label: "False" }
            ];
    return {
      id: field.key,
      name,
      label: field.label,
      type: "select",
      required: field.required,
      defaultValue: defaultValue === "" ? "false" : defaultValue,
      options
    };
  }

  if (DATETIME_FIELD_KEYS.has(field.key)) {
    return {
      id: field.key,
      name,
      label: field.label,
      type: "datetime-local",
      required: field.required,
      defaultValue
    };
  }

  if (field.inputType === "number") {
    return {
      id: field.key,
      name,
      label: field.label,
      type: "number",
      required: field.required,
      defaultValue
    };
  }

  return {
    id: field.key,
    name,
    label: field.label,
    type: "text",
    required: field.required,
    defaultValue
  };
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.smallActionButton} disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </button>
  );
}

function CreateItemButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.smallActionButton} disabled={pending}>
      {pending ? "Creating..." : "Create item"}
    </button>
  );
}

function CreateItemModal({
  category,
  createAction,
  currentUserId,
  onClose
}: {
  category: Category;
  createAction: ItemDatabaseViewerProps["createAction"];
  currentUserId: string;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createdAtValue = useMemo(() => toLocalDateTimeInputValue(new Date().toISOString()), []);
  const blankItem = useMemo<LibraryComponentDto>(
    () => ({
      id: "new-item",
      category,
      family: "",
      partNumber: "",
      description: "",
      isActive: true,
      isReviewed: false,
      reviewedByUserId: "",
      reviewedAt: "",
      stockStatus: "in_stock",
      createdByUserId: currentUserId,
      createdAt: new Date().toISOString(),
      lastEditedByUserId: currentUserId,
      lastEditedAt: new Date().toISOString(),
      updatedAt: "",
      attributes: emptyAttributesForCategory(category)
    }),
    [category, currentUserId]
  );
  const createFieldIds = useMemo(() => getCreateEditableFieldOrder(category), [category]);
  const createFields = useMemo(
    () =>
      createFieldIds
        .map((fieldId) => buildEditableFieldConfig(blankItem, fieldId))
        .filter((field): field is EditableFieldConfig => field !== null),
    [blankItem, createFieldIds]
  );

  const closeWithConfirm = useCallback(() => {
    if (!isDirty || window.confirm("Discard unsaved changes?")) {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleCreate = useCallback(
    async (formData: FormData) => {
      setErrorMessage(null);
      try {
        await createAction(formData);
        setIsDirty(false);
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to create item.");
      }
    },
    [createAction, onClose]
  );

  useEffect(() => {
    const firstInput = modalRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    firstInput?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWithConfirm();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          "a[href], button, textarea, input, select, details, [tabindex]:not([tabindex='-1'])"
        )
      ).filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeWithConfirm]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={closeWithConfirm}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Create ${category} item`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h4>Add {category} item</h4>
          <button type="button" className={styles.smallActionButton} onClick={closeWithConfirm}>
            Close
          </button>
        </div>
        <form
          action={handleCreate}
          className={styles.modalForm}
          onChange={() => setIsDirty(true)}
          onSubmit={() => setErrorMessage(null)}
        >
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="createdByUserId" value={currentUserId} />
          <input type="hidden" name="createdAt" value={createdAtValue} />
          <input type="hidden" name="lastEditedByUserId" value={currentUserId} />
          <input type="hidden" name="lastEditedAt" value={createdAtValue} />
          <div className={styles.modalFieldList}>
            {createFields.map((field) => (
              <label key={field.id}>
                {field.label}
                {field.type === "select" ? (
                  <select name={field.name} defaultValue="" required={field.required}>
                    <option value="">(blank)</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name={field.name} type={field.type} defaultValue="" required={field.required} />
                )}
              </label>
            ))}
          </div>
          <div className={styles.modalActions}>
            {errorMessage ? <p className={styles.formError}>{errorMessage}</p> : null}
            <CreateItemButton />
          </div>
        </form>
      </div>
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  editAction,
  deleteAction
}: {
  item: LibraryComponentDto;
  onClose: () => void;
  editAction: ItemDatabaseViewerProps["editAction"];
  deleteAction: ItemDatabaseViewerProps["deleteAction"];
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const scope = useMemo(() => getEditFieldScopeByCategory(item.category), [item.category]);
  const defaultFieldOrder = useMemo(() => getDefaultEditableFieldOrder(item.category), [item.category]);
  const [isDirty, setIsDirty] = useState(false);
  const [isOrderHydrated, setIsOrderHydrated] = useState(false);
  const [orderedFieldIds, setOrderedFieldIds] = useState<string[]>(defaultFieldOrder);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeRef = useRef(scope);
  const orderRef = useRef<string[]>(defaultFieldOrder);
  const defaultOrderRef = useRef<string[]>(defaultFieldOrder);
  const isOrderHydratedRef = useRef(false);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    orderRef.current = orderedFieldIds;
  }, [orderedFieldIds]);

  useEffect(() => {
    defaultOrderRef.current = defaultFieldOrder;
  }, [defaultFieldOrder]);

  useEffect(() => {
    isOrderHydratedRef.current = isOrderHydrated;
  }, [isOrderHydrated]);

  const flushFieldOrder = useCallback((keepalive: boolean) => {
    if (!isOrderHydratedRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const normalizedOrder = normalizeEditableFieldOrder(orderRef.current, defaultOrderRef.current);
    writeLocalTableLayoutSnapshot(scopeRef.current, {
      columnOrder: normalizedOrder,
      columnWidths: {},
      savedAt: Date.now()
    });
    void updateLibraryTablePreferences({
      scope: scopeRef.current,
      columnOrder: normalizedOrder,
      columnWidths: {},
      keepalive
    })
      .then((saved) => {
        writeLocalTableLayoutSnapshot(scopeRef.current, {
          columnOrder: normalizeEditableFieldOrder(saved.columnOrder, defaultOrderRef.current),
          columnWidths: {},
          savedAt: Date.parse(saved.updatedAt ?? "") || Date.now()
        });
      })
      .catch(() => {
        // Keep local state responsive even if save fails.
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const localSnapshot = readLocalTableLayoutSnapshot(scope);
    const localOrder = localSnapshot
      ? normalizeEditableFieldOrder(localSnapshot.columnOrder, defaultFieldOrder)
      : defaultFieldOrder;
    queueMicrotask(() => {
      if (!isMounted) {
        return;
      }
      setIsOrderHydrated(false);
      setOrderedFieldIds(localOrder);
      void getLibraryTablePreferences(scope)
        .then((prefs) => {
          if (!isMounted) {
            return;
          }
          const latest = pickLatestTableLayout(localSnapshot, prefs);
          if (!latest) {
            setOrderedFieldIds(defaultFieldOrder);
            return;
          }
          const normalized = normalizeEditableFieldOrder(latest.columnOrder, defaultFieldOrder);
          setOrderedFieldIds(normalized);
          writeLocalTableLayoutSnapshot(scope, {
            columnOrder: normalized,
            columnWidths: {},
            savedAt: Date.now()
          });
        })
        .catch(() => {
          if (isMounted && !localSnapshot) {
            setOrderedFieldIds(defaultFieldOrder);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsOrderHydrated(true);
          }
        });
    });
    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [defaultFieldOrder, scope]);

  useEffect(() => {
    if (!isOrderHydrated) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const normalized = normalizeEditableFieldOrder(orderedFieldIds, defaultFieldOrder);
    writeLocalTableLayoutSnapshot(scope, {
      columnOrder: normalized,
      columnWidths: {},
      savedAt: Date.now()
    });
    saveTimeoutRef.current = setTimeout(() => {
      const currentOrder = normalizeEditableFieldOrder(orderedFieldIds, defaultFieldOrder);
      void updateLibraryTablePreferences({
        scope,
        columnOrder: currentOrder,
        columnWidths: {}
      })
        .then((saved) => {
          writeLocalTableLayoutSnapshot(scope, {
            columnOrder: normalizeEditableFieldOrder(saved.columnOrder, defaultFieldOrder),
            columnWidths: {},
            savedAt: Date.parse(saved.updatedAt ?? "") || Date.now()
          });
        })
        .catch(() => {
          // Keep local state responsive even if save fails.
        });
    }, 450);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [defaultFieldOrder, isOrderHydrated, orderedFieldIds, scope]);

  useEffect(() => {
    function handlePageHide() {
      flushFieldOrder(true);
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushFieldOrder(true);
      }
    }
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushFieldOrder]);

  useEffect(() => {
    const firstInput = modalRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    firstInput?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isDirty || window.confirm("Discard unsaved changes?")) {
          onClose();
        }
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          "a[href], button, textarea, input, select, details, [tabindex]:not([tabindex='-1'])"
        )
      ).filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isDirty, onClose]);

  const closeWithConfirm = useCallback(() => {
    if (!isDirty || window.confirm("Discard unsaved changes?")) {
      flushFieldOrder(true);
      onClose();
    }
  }, [flushFieldOrder, isDirty, onClose]);

  const handleDelete = useCallback(
    async (formData: FormData) => {
      await deleteAction(formData);
      setIsDirty(false);
      flushFieldOrder(true);
      onClose();
    },
    [deleteAction, flushFieldOrder, onClose]
  );

  const handleEdit = useCallback(
    async (formData: FormData) => {
      await editAction(formData);
      setIsDirty(false);
      flushFieldOrder(true);
      onClose();
    },
    [editAction, flushFieldOrder, onClose]
  );

  const editableFields = useMemo(
    () =>
      normalizeEditableFieldOrder(orderedFieldIds, defaultFieldOrder)
        .map((fieldId) => buildEditableFieldConfig(item, fieldId))
        .filter((field): field is EditableFieldConfig => field !== null),
    [defaultFieldOrder, item, orderedFieldIds]
  );

  const shownNames = new Set(editableFields.map((field) => field.name));

  const handleDragStart = useCallback(
    (fieldId: string) => (event: DragEvent<HTMLButtonElement>) => {
      setDraggingFieldId(fieldId);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", fieldId);
    },
    []
  );

  const handleDragOver = useCallback(
    (targetId: string) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const sourceId = draggingFieldId ?? event.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === targetId) {
        return;
      }
      setOrderedFieldIds((current) => moveOrderedItem(normalizeEditableFieldOrder(current, defaultFieldOrder), sourceId, targetId));
    },
    [defaultFieldOrder, draggingFieldId]
  );

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={closeWithConfirm}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${item.partNumber}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h4>Edit item: {item.partNumber}</h4>
          <button type="button" className={styles.smallActionButton} onClick={closeWithConfirm}>
            Close
          </button>
        </div>
        <form action={handleEdit} className={styles.modalForm} onChange={() => setIsDirty(true)}>
          <input type="hidden" name="componentId" value={item.id} />
          <input type="hidden" name="category" value={item.category} />
          {!shownNames.has("description") ? <input type="hidden" name="description" value={item.description} /> : null}
          {!shownNames.has("stockStatus") ? <input type="hidden" name="stockStatus" value={item.stockStatus} /> : null}
          {!shownNames.has("partNumber") ? <input type="hidden" name="partNumber" value={item.partNumber} /> : null}
          {!shownNames.has("family") ? <input type="hidden" name="family" value={item.family} /> : null}
          {!shownNames.has("isActive") ? <input type="hidden" name="isActive" value={String(item.isActive)} /> : null}
          {!shownNames.has("createdByUserId") ? <input type="hidden" name="createdByUserId" value={item.createdByUserId} /> : null}
          {!shownNames.has("createdAt") ? (
            <input type="hidden" name="createdAt" value={toLocalDateTimeInputValue(item.createdAt)} />
          ) : null}
          {!shownNames.has("isReviewed") ? <input type="hidden" name="isReviewed" value={String(item.isReviewed)} /> : null}
          {!shownNames.has("reviewedByUserId") ? (
            <input type="hidden" name="reviewedByUserId" value={item.reviewedByUserId ?? ""} />
          ) : null}
          {!shownNames.has("reviewedAt") ? (
            <input type="hidden" name="reviewedAt" value={toLocalDateTimeInputValue(item.reviewedAt)} />
          ) : null}
          {!shownNames.has("lastEditedByUserId") ? (
            <input type="hidden" name="lastEditedByUserId" value={item.lastEditedByUserId} />
          ) : null}
          {!shownNames.has("lastEditedAt") ? (
            <input type="hidden" name="lastEditedAt" value={toLocalDateTimeInputValue(item.lastEditedAt)} />
          ) : null}
          <div className={styles.modalFieldList}>
            {editableFields.map((field) => {
              const inputId = `edit-field-${field.id}`;
              return (
                <div
                  key={field.id}
                  className={`${styles.modalFieldRow}${draggingFieldId === field.id ? ` ${styles.modalFieldRowDragging}` : ""}`}
                  onDragOver={handleDragOver(field.id)}
                  onDrop={() => setDraggingFieldId(null)}
                >
                  <button
                    type="button"
                    className={styles.modalDragHandle}
                    draggable
                    onDragStart={handleDragStart(field.id)}
                    onDragEnd={() => setDraggingFieldId(null)}
                    aria-label={`Drag to reorder ${field.label}`}
                    title="Drag to reorder"
                  >
                    &#9776;
                  </button>
                  <label htmlFor={inputId} className={styles.modalFieldLabel}>
                    {field.label}
                  </label>
                  {field.type === "select" ? (
                    <select id={inputId} name={field.name} defaultValue={field.defaultValue} required={field.required}>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={inputId}
                      name={field.name}
                      type={field.type}
                      defaultValue={field.defaultValue}
                      required={field.required}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className={styles.modalActions}>
            <button
              type="submit"
              formAction={handleDelete}
              className={`${styles.dangerActionButton} ${styles.modalDeleteActionButton}`}
              onClick={(event) => {
                if (!window.confirm("Remove this item permanently from the database?")) {
                  event.preventDefault();
                }
              }}
            >
              Permanently Delete Item
            </button>
            <SaveButton />
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryVirtualTable({ category, items, editAction, deleteAction }: CategoryVirtualTableProps) {
  const scope = getScopeByCategory(category);
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomScrollbarRef = useRef<HTMLDivElement>(null);
  const scrollSyncLockRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);
  const [editingItem, setEditingItem] = useState<LibraryComponentDto | null>(null);
  const [isPreferencesHydrated, setIsPreferencesHydrated] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeRef = useRef(scope);
  const columnOrderRef = useRef<ColumnOrderState>([]);
  const columnSizingRef = useRef<ColumnSizingState>({});
  const defaultColumnOrderRef = useRef<string[]>([]);
  const isPreferencesHydratedRef = useRef(false);

  const columns = useMemo(() => getColumnDefs(category, setEditingItem), [category]);
  const defaultColumnOrder = useMemo(() => columns.map((column) => column.id as string), [columns]);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    columnOrderRef.current = columnOrder;
  }, [columnOrder]);

  useEffect(() => {
    columnSizingRef.current = columnSizing;
  }, [columnSizing]);

  useEffect(() => {
    defaultColumnOrderRef.current = defaultColumnOrder;
  }, [defaultColumnOrder]);

  useEffect(() => {
    isPreferencesHydratedRef.current = isPreferencesHydrated;
  }, [isPreferencesHydrated]);

  const flushPreferences = useCallback((keepalive: boolean) => {
    if (!isPreferencesHydratedRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const payload = toLayoutPayload(
      scopeRef.current,
      columnOrderRef.current,
      columnSizingRef.current,
      defaultColumnOrderRef.current
    );
    writeLocalTableLayoutSnapshot(payload.scope, {
      columnOrder: payload.columnOrder,
      columnWidths: payload.columnWidths,
      savedAt: Date.now()
    });
    void updateLibraryTablePreferences({ ...payload, keepalive })
      .then((saved) => {
        writeLocalTableLayoutSnapshot(payload.scope, {
          columnOrder: saved.columnOrder,
          columnWidths: normalizeColumnSizing(saved.columnWidths),
          savedAt: Date.parse(saved.updatedAt ?? "") || Date.now()
        });
      })
      .catch(() => {
        // Keep local state responsive even if save fails.
      });
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    state: {
      columnOrder,
      columnSizing
    },
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true
  });

  useEffect(() => {
    let isMounted = true;
    setIsPreferencesHydrated(false);
    setColumnOrder(defaultColumnOrder);
    setColumnSizing({});
    const localSnapshot = readLocalTableLayoutSnapshot(scope);
    if (localSnapshot) {
      setColumnOrder(normalizeColumnOrder(localSnapshot.columnOrder, defaultColumnOrder));
      setColumnSizing(normalizeColumnSizing(localSnapshot.columnWidths));
    }
    void getLibraryTablePreferences(scope)
      .then((prefs) => {
        if (!isMounted) {
          return;
        }
        const latest = pickLatestTableLayout(localSnapshot, prefs);
        if (!latest) {
          setColumnOrder(defaultColumnOrder);
          setColumnSizing({});
          return;
        }
        const requestedOrder =
          latest.columnOrder.length > 0
            ? defaultColumnOrder.filter((columnId) => latest.columnOrder.includes(columnId))
            : defaultColumnOrder;
        const appended = defaultColumnOrder.filter((columnId) => !requestedOrder.includes(columnId));
        const normalizedOrder = normalizeColumnOrder([...requestedOrder, ...appended], defaultColumnOrder);
        const normalizedSizing = normalizeColumnSizing(latest.columnWidths);
        setColumnOrder(normalizedOrder);
        setColumnSizing(normalizedSizing);
        writeLocalTableLayoutSnapshot(scope, {
          columnOrder: normalizedOrder,
          columnWidths: normalizedSizing,
          savedAt: Date.now()
        });
      })
      .catch(() => {
        if (isMounted) {
          if (!localSnapshot) {
            setColumnOrder(defaultColumnOrder);
            setColumnSizing({});
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsPreferencesHydrated(true);
        }
      });
    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [defaultColumnOrder, scope]);

  useEffect(() => {
    if (!isPreferencesHydrated) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const pendingPayload = toLayoutPayload(scope, columnOrder, columnSizing, defaultColumnOrder);
    writeLocalTableLayoutSnapshot(scope, {
      columnOrder: pendingPayload.columnOrder,
      columnWidths: pendingPayload.columnWidths,
      savedAt: Date.now()
    });
    saveTimeoutRef.current = setTimeout(() => {
      const payload = toLayoutPayload(scope, columnOrder, columnSizing, defaultColumnOrder);
      void updateLibraryTablePreferences(payload)
        .then((saved) => {
          writeLocalTableLayoutSnapshot(scope, {
            columnOrder: saved.columnOrder,
            columnWidths: normalizeColumnSizing(saved.columnWidths),
            savedAt: Date.parse(saved.updatedAt ?? "") || Date.now()
          });
        })
        .catch(() => {
          // Keep local state responsive even if save fails.
        });
    }, 450);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [columnOrder, columnSizing, defaultColumnOrder, isPreferencesHydrated, scope]);

  useEffect(() => {
    function handlePageHide() {
      flushPreferences(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushPreferences(true);
      }
    }

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushPreferences]);

  useEffect(() => {
    if (!viewportRef.current) {
      return;
    }
    const node = viewportRef.current;
    const observer = new ResizeObserver(() => {
      setViewportHeight(node.clientHeight);
    });
    observer.observe(node);
    setViewportHeight(node.clientHeight);
    return () => observer.disconnect();
  }, []);

  const totalRows = items.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(totalRows, startIndex + visibleCount);
  const tableRows = table.getRowModel().rows;
  const visibleRows = useMemo(() => tableRows.slice(startIndex, endIndex), [endIndex, startIndex, tableRows]);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = (totalRows - endIndex) * ROW_HEIGHT;
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const columnCount = visibleLeafColumns.length;
  const tableWidth = Math.max(table.getTotalSize(), 720);

  const handleViewportScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    setScrollTop(nextScrollTop);
    if (scrollSyncLockRef.current || !bottomScrollbarRef.current) {
      return;
    }
    scrollSyncLockRef.current = true;
    bottomScrollbarRef.current.scrollLeft = event.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      scrollSyncLockRef.current = false;
    });
  }, []);

  const handleBottomScrollbarScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (scrollSyncLockRef.current || !viewportRef.current) {
      return;
    }
    scrollSyncLockRef.current = true;
    viewportRef.current.scrollLeft = event.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      scrollSyncLockRef.current = false;
    });
  }, []);

  const handleViewportWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const horizontalDelta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (horizontalDelta === 0) {
      return;
    }
    event.currentTarget.scrollLeft += horizontalDelta;
    event.preventDefault();
  }, []);

  const handleBottomScrollbarWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const horizontalDelta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (horizontalDelta === 0) {
      return;
    }
    event.currentTarget.scrollLeft += horizontalDelta;
    event.preventDefault();
  }, []);

  const handleHeaderDragStart = useCallback(
    (columnId: string, isLockedColumn: boolean, event: DragEvent<HTMLElement>) => {
      if (isLockedColumn) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", columnId);
      setDraggingColumnId(columnId);
    },
    []
  );

  const handleHeaderDragOver = useCallback(
    (targetColumnId: string, isLockedColumn: boolean, isResizing: boolean, event: DragEvent<HTMLTableHeaderCellElement>) => {
      if (isLockedColumn || isResizing || !draggingColumnId || draggingColumnId === targetColumnId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [draggingColumnId]
  );

  const handleHeaderDrop = useCallback(
    (targetColumnId: string, isLockedColumn: boolean, isResizing: boolean, event: DragEvent<HTMLTableHeaderCellElement>) => {
      event.preventDefault();
      if (isLockedColumn || isResizing || !draggingColumnId || draggingColumnId === targetColumnId) {
        return;
      }
      setColumnOrder((current) => reorderColumnOrder(current, draggingColumnId, targetColumnId, defaultColumnOrder));
      setDraggingColumnId(null);
    },
    [defaultColumnOrder, draggingColumnId]
  );

  const handleHeaderDragEnd = useCallback(() => {
    setDraggingColumnId(null);
  }, []);

  useEffect(() => {
    if (!viewportRef.current || !bottomScrollbarRef.current) {
      return;
    }
    bottomScrollbarRef.current.scrollLeft = viewportRef.current.scrollLeft;
  }, [tableWidth]);

  return (
    <>
      <div
        ref={viewportRef}
        className={styles.virtualViewport}
        onScroll={handleViewportScroll}
        onWheel={handleViewportWheel}
      >
        <table className={`${styles.table} ${styles.compactTable}`} style={{ width: `${tableWidth}px` }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const columnId = String(header.column.id);
                  const isLockedPartNumber = columnId === LOCKED_FIRST_COLUMN_ID;
                  const isResizing = header.column.getIsResizing();
                  const canDragLabel = !header.isPlaceholder && !isLockedPartNumber && !isResizing;
                  const isDraggingLabel = draggingColumnId === columnId;
                  return (
                    <th
                      key={header.id}
                      style={{ width: `${header.getSize()}px`, position: "relative" }}
                      onDragOver={(event) => handleHeaderDragOver(columnId, isLockedPartNumber, isResizing, event)}
                      onDrop={(event) => handleHeaderDrop(columnId, isLockedPartNumber, isResizing, event)}
                    >
                      <div className={styles.headerCell}>
                        <span
                          draggable={canDragLabel}
                          className={`${styles.headerLabelDragZone} ${canDragLabel ? styles.headerLabelDraggable : ""} ${isDraggingLabel ? styles.headerLabelDragging : ""}`}
                          onDragStart={(event) => handleHeaderDragStart(columnId, isLockedPartNumber, event)}
                          onDragEnd={handleHeaderDragEnd}
                          aria-grabbed={canDragLabel ? isDraggingLabel : undefined}
                        >
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      </div>
                      {header.column.getCanResize() ? (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${String(header.column.columnDef.header)} column`}
                          className={`${styles.resizeHandle} ${header.column.getIsResizing() ? styles.resizeHandleActive : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            header.getResizeHandler()(event);
                          }}
                          onTouchStart={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            header.getResizeHandler()(event);
                          }}
                        />
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {topSpacerHeight > 0 ? (
              <tr>
                <td colSpan={columnCount} style={{ height: `${topSpacerHeight}px`, padding: 0, border: 0 }} />
              </tr>
            ) : null}
            {visibleRows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ width: `${cell.column.getSize()}px` }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {bottomSpacerHeight > 0 ? (
              <tr>
                <td colSpan={columnCount} style={{ height: `${bottomSpacerHeight}px`, padding: 0, border: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div
        ref={bottomScrollbarRef}
        className={styles.bottomScrollbar}
        aria-label="Table horizontal scrollbar"
        onScroll={handleBottomScrollbarScroll}
        onWheel={handleBottomScrollbarWheel}
      >
        <div className={styles.bottomScrollbarInner} style={{ width: `${tableWidth}px` }} />
      </div>
      {editingItem ? (
        <EditItemModal
          item={editingItem}
          editAction={editAction}
          deleteAction={deleteAction}
          onClose={() => setEditingItem(null)}
        />
      ) : null}
    </>
  );
}

export function ItemDatabaseViewer({
  items,
  visibleCategories,
  categoryLabel,
  q,
  category,
  family,
  awg,
  color,
  createAction,
  editAction,
  deleteAction,
  currentUserId
}: ItemDatabaseViewerProps) {
  const [creatingCategory, setCreatingCategory] = useState<Category | null>(null);

  const itemsByCategory = useMemo(() => {
    const grouped = Object.fromEntries(LIBRARY_ITEM_CATEGORIES.map((itemCategory) => [itemCategory, [] as LibraryComponentDto[]])) as Record<
      Category,
      LibraryComponentDto[]
    >;
    for (const item of items) {
      const normalizedCategory = normalizeRuntimeCategory((item as { category?: unknown }).category);
      if (!normalizedCategory) {
        continue;
      }
      grouped[normalizedCategory].push(normalizedCategory === item.category ? item : { ...item, category: normalizedCategory });
    }
    return grouped;
  }, [items]);

  return (
    <div className={styles.sectionContent}>
      <form className={styles.filters} method="GET">
        <label>
          Search
          <input name="q" type="text" defaultValue={q ?? ""} placeholder="part number, family, description" />
        </label>
        <label>
          Category
          <select name="category" defaultValue={category ?? ""}>
            <option value="">All</option>
            {LIBRARY_ITEM_CATEGORIES.map((optionCategory) => (
              <option key={optionCategory} value={optionCategory}>
                {categoryLabel[optionCategory]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Family
          <input name="family" type="text" defaultValue={family ?? ""} placeholder="e.g. Micro-D" />
        </label>
        <label>
          AWG
          <input name="awg" type="text" defaultValue={awg ?? ""} placeholder="e.g. 22" />
        </label>
        <label>
          Color
          <input name="color" type="text" defaultValue={color ?? ""} placeholder="e.g. white" />
        </label>
        <button type="submit">Apply filters</button>
      </form>

      {items.length === 0 ? <p>No items found for current filters.</p> : null}
      <div className={styles.categorySections}>
        {visibleCategories.map((currentCategory) => {
          const categoryItems = itemsByCategory[currentCategory];
          return (
            <section key={currentCategory} className={styles.categorySection}>
              <div className={styles.categoryHeader}>
                <h3>{categoryLabel[currentCategory]} items</h3>
                <div className={styles.categoryHeaderActions}>
                  <button
                    type="button"
                    className={styles.smallActionButton}
                    onClick={() => setCreatingCategory(currentCategory)}
                  >
                    Add Item
                  </button>
                </div>
              </div>
              {categoryItems.length === 0 ? <p>No {categoryLabel[currentCategory]} entries for current filters.</p> : null}
              {categoryItems.length > 0 ? (
                <div className={styles.tableWrap}>
                  <CategoryVirtualTable
                    category={currentCategory}
                    items={categoryItems}
                    editAction={editAction}
                    deleteAction={deleteAction}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      {creatingCategory ? (
        <CreateItemModal
          category={creatingCategory}
          createAction={createAction}
          currentUserId={currentUserId}
          onClose={() => setCreatingCategory(null)}
        />
      ) : null}
    </div>
  );
}
