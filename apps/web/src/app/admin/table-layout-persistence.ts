export interface LocalTableLayoutSnapshot {
  columnOrder: string[];
  columnWidths: Record<string, number>;
  savedAt: number;
}

export interface RemoteTableLayoutSnapshot {
  columnOrder: string[];
  columnWidths: Record<string, number>;
  updatedAt?: string;
}

const STORAGE_KEY_PREFIX = "cdt-admin-table-layout";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toEpochMs(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTableLayoutStorageKey(scope: string): string {
  return `${STORAGE_KEY_PREFIX}:${scope}`;
}

export function readLocalTableLayoutSnapshot(scope: string): LocalTableLayoutSnapshot | null {
  if (!canUseStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getTableLayoutStorageKey(scope));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LocalTableLayoutSnapshot>;
    if (!Array.isArray(parsed.columnOrder) || typeof parsed.columnWidths !== "object" || !parsed.columnWidths) {
      return null;
    }
    const savedAt = toEpochMs(parsed.savedAt);
    if (savedAt === null) {
      return null;
    }
    return {
      columnOrder: parsed.columnOrder.filter((columnId): columnId is string => typeof columnId === "string" && columnId.length > 0),
      columnWidths: Object.fromEntries(
        Object.entries(parsed.columnWidths).filter(
          ([columnId, width]) => typeof columnId === "string" && columnId.length > 0 && typeof width === "number"
        )
      ),
      savedAt
    };
  } catch {
    return null;
  }
}

export function writeLocalTableLayoutSnapshot(scope: string, snapshot: LocalTableLayoutSnapshot): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(getTableLayoutStorageKey(scope), JSON.stringify(snapshot));
  } catch {
    // Best-effort local persistence; ignore quota/storage errors.
  }
}

export function pickLatestTableLayout(
  localSnapshot: LocalTableLayoutSnapshot | null,
  remoteSnapshot: RemoteTableLayoutSnapshot | null
): { columnOrder: string[]; columnWidths: Record<string, number> } | null {
  if (!localSnapshot && !remoteSnapshot) {
    return null;
  }
  if (!remoteSnapshot) {
    return localSnapshot
      ? {
          columnOrder: localSnapshot.columnOrder,
          columnWidths: localSnapshot.columnWidths
        }
      : null;
  }
  if (!localSnapshot) {
    return {
      columnOrder: remoteSnapshot.columnOrder,
      columnWidths: remoteSnapshot.columnWidths
    };
  }
  const remoteUpdatedAt = toEpochMs(remoteSnapshot.updatedAt);
  if (remoteUpdatedAt === null || localSnapshot.savedAt >= remoteUpdatedAt) {
    return {
      columnOrder: localSnapshot.columnOrder,
      columnWidths: localSnapshot.columnWidths
    };
  }
  return {
    columnOrder: remoteSnapshot.columnOrder,
    columnWidths: remoteSnapshot.columnWidths
  };
}
