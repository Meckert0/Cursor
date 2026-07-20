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
/** draft = unreviewed; reviewed_active = reviewed+active; inactive = reviewed but deactivated; archived = soft-deleted. */
export type LibraryLifecycleStatus = "draft" | "reviewed_active" | "inactive" | "archived";

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
  /** Structured pin count for modules/connectors (rules + authoring). */
  pinCount?: number;
  /** Allowed pin ids/numbers from the manufacturer definition. */
  pinIds?: string[];
  /** Inclusive minimum accepted wire AWG for contacts/modules. */
  acceptedAwgMin?: number;
  /** Inclusive maximum accepted wire AWG for contacts/modules. */
  acceptedAwgMax?: number;
  /** Wire families accepted by this contact/module. */
  acceptedFamilies?: string[];
  isArchived?: boolean;
  archivedAt?: string;
  archivedByUserId?: string;
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
  pinCount?: number;
  pinIds?: string[];
  acceptedAwgMin?: number;
  acceptedAwgMax?: number;
  acceptedFamilies?: string[];
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

export function resolveLibraryLifecycleStatus(component: {
  isReviewed: boolean;
  isActive: boolean;
  isArchived?: boolean;
}): LibraryLifecycleStatus {
  if (component.isArchived) {
    return "archived";
  }
  if (!component.isReviewed) {
    return "draft";
  }
  if (!component.isActive) {
    return "inactive";
  }
  return "reviewed_active";
}

const SEED_AT = "2026-07-10T00:00:00.000Z";

function pinSequence(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

function seedComponent(
  input: Omit<
    LibraryComponentRecord,
    | "createdByUserId"
    | "createdAt"
    | "lastEditedByUserId"
    | "lastEditedAt"
    | "updatedAt"
    | "isReviewed"
    | "reviewedByUserId"
    | "reviewedAt"
    | "customFieldValues"
  > & {
    isReviewed?: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
    customFieldValues?: Record<string, string>;
  }
): LibraryComponentRecord {
  const isReviewed = input.isReviewed ?? true;
  return {
    ...input,
    isReviewed,
    reviewedByUserId: isReviewed ? (input.reviewedByUserId ?? "seed") : undefined,
    reviewedAt: isReviewed ? (input.reviewedAt ?? SEED_AT) : undefined,
    createdByUserId: "seed",
    createdAt: SEED_AT,
    lastEditedByUserId: "seed",
    lastEditedAt: SEED_AT,
    updatedAt: SEED_AT,
    customFieldValues: input.customFieldValues ?? {}
  };
}

function seedModule(input: {
  id: string;
  partNumber: string;
  description: string;
  family?: string;
  pinCount: number;
  acceptedAwgMin?: number;
  acceptedAwgMax?: number;
  acceptedFamilies?: string[];
}): LibraryComponentRecord {
  const pinIds = pinSequence(input.pinCount);
  return seedComponent({
    id: input.id,
    category: "module",
    family: input.family ?? "Micro-D",
    partNumber: input.partNumber,
    description: input.description,
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: [],
    pinCount: input.pinCount,
    pinIds,
    acceptedAwgMin: input.acceptedAwgMin ?? 20,
    acceptedAwgMax: input.acceptedAwgMax ?? 26,
    acceptedFamilies: input.acceptedFamilies ?? ["MIL-W-22759"],
    customFieldValues: { pins: pinIds.join(",") }
  });
}

/**
 * Starter catalog for a fresh install. Covers every category needed to author one
 * complete cable from active, reviewed library entries. Seeded identically by
 * memory, sqlite, and postgres backends.
 */
export const DEFAULT_LIBRARY_COMPONENTS: LibraryComponentRecord[] = [
  seedModule({
    id: "cmp-module-9p",
    partNumber: "MDM-9P",
    description: "9-pin Micro-D connector module",
    pinCount: 9
  }),
  seedModule({
    id: "cmp-module-001",
    partNumber: "MDM-15P",
    description: "15-pin Micro-D connector module",
    pinCount: 15
  }),
  seedModule({
    id: "cmp-module-25p",
    partNumber: "DSUB-25P",
    description: "25-pin D-Sub connector module",
    family: "D-Sub",
    pinCount: 25,
    acceptedAwgMin: 18,
    acceptedAwgMax: 24
  }),
  seedComponent({
    id: "cmp-contact-001",
    category: "contact",
    family: "Micro-D",
    partNumber: "CNT-22",
    description: "Size 22 Micro-D socket contact",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Pairs with MDM-9P / MDM-15P"],
    acceptedAwgMin: 20,
    acceptedAwgMax: 26,
    acceptedFamilies: ["MIL-W-22759"]
  }),
  seedComponent({
    id: "cmp-contact-20",
    category: "contact",
    family: "Micro-D",
    partNumber: "CNT-20",
    description: "Size 20 Micro-D socket contact",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: [],
    acceptedAwgMin: 18,
    acceptedAwgMax: 22,
    acceptedFamilies: ["MIL-W-22759"]
  }),
  seedComponent({
    id: "cmp-wire-001",
    category: "wire",
    family: "MIL-W-22759",
    partNumber: "M22759/16-22",
    description: "22 AWG PTFE wire, white",
    awg: "22",
    color: "white",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: []
  }),
  seedComponent({
    id: "cmp-wire-22-blk",
    category: "wire",
    family: "MIL-W-22759",
    partNumber: "M22759/16-22-BLK",
    description: "22 AWG PTFE wire, black",
    awg: "22",
    color: "black",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: []
  }),
  seedComponent({
    id: "cmp-wire-20-wht",
    category: "wire",
    family: "MIL-W-22759",
    partNumber: "M22759/16-20",
    description: "20 AWG PTFE wire, white",
    awg: "20",
    color: "white",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: []
  }),
  seedComponent({
    id: "cmp-label-001",
    category: "label",
    family: "Heatshrink",
    partNumber: "LBL-22",
    description: "Heatshrink wire marker, 22 AWG",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: []
  }),
  seedComponent({
    id: "cmp-label-hs",
    category: "label",
    family: "Heatshrink",
    partNumber: "LBL-HS-025",
    description: "Heatshrink cable label, 0.25 in",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: []
  }),
  seedComponent({
    id: "cmp-sleeve-exp",
    category: "sleeve-tube-braid",
    family: "Expandable",
    partNumber: "SLV-EXP-025",
    description: "Expandable PET sleeving, 0.25 in",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Maps to expandable_sleeving"]
  }),
  seedComponent({
    id: "cmp-sleeve-braid",
    category: "sleeve-tube-braid",
    family: "Braided",
    partNumber: "SLV-BRAID-025",
    description: "Tinned copper braid under expandable sleeving, 0.25 in",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Maps to wire_braid_under_expandable_sleeving"]
  }),
  seedComponent({
    id: "cmp-backshell-001",
    category: "backshell",
    family: "EMI",
    partNumber: "BS-EMI-09",
    description: "EMI backshell for 9-pin Micro-D (deprecated)",
    isActive: false,
    stockStatus: "out_of_stock",
    compatibilityHints: ["Deprecated for new designs; use BS-EMI-09A replacement"]
  }),
  seedComponent({
    id: "cmp-backshell-09a",
    category: "backshell",
    family: "EMI",
    partNumber: "BS-EMI-09A",
    description: "EMI backshell for 9-pin Micro-D",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Fits MDM-9P"]
  }),
  seedComponent({
    id: "cmp-backshell-15",
    category: "backshell",
    family: "EMI",
    partNumber: "BS-EMI-15",
    description: "EMI backshell for 15-pin Micro-D",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Fits MDM-15P"]
  }),
  seedComponent({
    id: "cmp-sr-09",
    category: "strain-relief",
    family: "Clamp",
    partNumber: "SR-CLAMP-09",
    description: "Strain-relief clamp for 9-pin Micro-D",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Fits MDM-9P / BS-EMI-09A"]
  }),
  seedComponent({
    id: "cmp-sr-15",
    category: "strain-relief",
    family: "Clamp",
    partNumber: "SR-CLAMP-15",
    description: "Strain-relief clamp for 15-pin Micro-D",
    isActive: true,
    stockStatus: "in_stock",
    compatibilityHints: ["Fits MDM-15P / BS-EMI-15"]
  })
];

/** Categories that must have at least one active, reviewed starter part. */
export const STARTER_LIBRARY_ACTIVE_CATEGORIES = [
  "module",
  "contact",
  "wire",
  "label",
  "sleeve-tube-braid",
  "backshell",
  "strain-relief"
] as const satisfies readonly LibraryCategory[];

export function listActiveReviewedStarterComponents(): LibraryComponentRecord[] {
  return DEFAULT_LIBRARY_COMPONENTS.filter(
    (component) => component.isActive && component.isReviewed && !component.isArchived
  );
}