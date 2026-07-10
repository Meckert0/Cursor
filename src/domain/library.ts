export const LIBRARY_CATEGORIES = [
  "contact",
  "wire",
  "sleeve-tube-braid",
  "label",
  "backshell",
  "strain-relief",
  "module",
  "splice"
] as const;

export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];
export type LibraryStockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type LibraryFieldValueType = "text";

export interface LibraryFieldDefinitionRecord {
  id: string;
  category: LibraryCategory;
  key: string;
  label: string;
  valueType: LibraryFieldValueType;
  isSystem: boolean;
  isVisibleInViewer: boolean;
  showOnAddForm: boolean;
  showInSearch: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryComponentRecord {
  id: string;
  category: LibraryCategory;
  family: string;
  partNumber: string;
  description: string;
  awg?: string;
  color?: string;
  isActive: boolean;
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  stockStatus: LibraryStockStatus;
  compatibilityHints: string[];
  createdByUserId: string;
  createdAt: string;
  lastEditedByUserId: string;
  lastEditedAt: string;
  updatedAt: string;
  customFieldValues: Record<string, string>;
}

export interface LibraryReviewQueueRecord extends LibraryComponentRecord {
  enteredByUserId: string;
  enteredAt: string;
}

export interface LibraryComponentIngestItem {
  id?: string;
  category: LibraryCategory;
  family: string;
  partNumber: string;
  description: string;
  awg?: string;
  color?: string;
  isActive: boolean;
  stockStatus: LibraryStockStatus;
  compatibilityHints: string[];
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  customFieldValues?: Record<string, string>;
}

export interface LibraryIngestResultRow {
  rowNumber: number;
  status: "accepted" | "committed" | "rejected";
  componentId?: string;
  message?: string;
}

export interface LibraryIngestResult {
  jobId: string;
  dryRun: boolean;
  summary: {
    received: number;
    accepted: number;
    rejected: number;
    committed: number;
  };
  results: LibraryIngestResultRow[];
}

export const DEFAULT_LIBRARY_COMPONENTS: LibraryComponentRecord[] = [
  {
    id: "cmp-backshell-001",
    category: "backshell",
    family: "EMI",
    partNumber: "BS-EMI-09",
    description: "EMI backshell for 9-pin Micro-D",
    isActive: false,
    isReviewed: true,
    reviewedByUserId: "seed",
    reviewedAt: "2026-02-15T00:00:00.000Z",
    stockStatus: "out_of_stock",
    compatibilityHints: ["Deprecated for new designs; use BS-EMI-10 replacement"],
    createdByUserId: "seed",
    createdAt: "2026-02-15T00:00:00.000Z",
    lastEditedByUserId: "seed",
    lastEditedAt: "2026-02-15T00:00:00.000Z",
    updatedAt: "2026-02-15T00:00:00.000Z",
    customFieldValues: {}
  }
];
