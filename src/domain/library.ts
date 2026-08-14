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
export type LibraryStockStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";
/** draft = unreviewed; reviewed_active = reviewed+active; inactive = reviewed but deactivated; archived = soft-deleted. */
export type LibraryLifecycleStatus = "draft" | "reviewed_active" | "inactive" | "archived";

export type CompatStatus = "allowed" | "forbidden" | "review";

export type PartAliasCodeSystem =
  | "contact_3digit"
  | "wire_3digit"
  | "pc_designer_contact"
  | "pc_designer_wire"
  | "vendor_pn"
  | string;

export interface ModuleContactPosition {
  contactSize: string;
  contactFamily?: string;
  pinCount: number;
}

export interface SleeveSizeRange {
  minDia: number;
  maxDia: number;
  relatedPartId?: string;
}

export interface BackshellFitment {
  familyType: string;
  gender?: string;
  backshellSize?: string;
  emi?: boolean;
}

/** Shared identity + lifecycle for every catalog part (design doc §5.1). */
export interface PartRecord {
  id: string;
  category: LibraryCategory;
  family: string;
  partNumber: string;
  description: string;
  isActive: boolean;
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  stockStatus: LibraryStockStatus;
  isArchived?: boolean;
  archivedAt?: string;
  archivedByUserId?: string;
  createdByUserId: string;
  createdAt: string;
  lastEditedByUserId: string;
  lastEditedAt: string;
  updatedAt: string;
  importBatchId?: string;
}

export interface ModuleAttributes {
  genre?: string;
  gender?: string;
  contactFamily1?: string;
  pinCount?: number;
  contactFamily2?: string;
  pinCount2?: number;
  emi?: boolean;
  crimpGauge?: string;
  contactSize?: string;
  ampRating?: string;
  operatingVoltage?: string;
  operatingTemp?: string;
  defaultProtectiveCoverPartId?: string;
  insertArrangement?: string;
  pinIds: string[];
  contactPositions?: ModuleContactPosition[];
}

export interface ContactAttributes {
  genre?: string;
  gender?: string;
  awg?: string;
  plating?: string;
  termType?: string;
  ssCompatible?: boolean;
  lengthAdded?: number;
  acceptedAwgMin?: number;
  acceptedAwgMax?: number;
  acceptedFamilies: string[];
  contactSize?: string;
  studSize?: string;
  tih?: boolean;
}

export interface WireAttributes {
  milSpec?: string;
  awg: string;
  color: string;
  cma?: number;
  wireType?: string;
  insulationMaterial?: string;
  overallDia?: number;
  conductorDia?: number;
  numberOfConductors?: number;
  tempMax?: number;
  overallWireBraid?: boolean;
  overallWireFoil?: boolean;
  internalPairFoil?: boolean;
  weightPerFt?: number;
  k1?: number;
  k2?: number;
  lossCoefficient?: number;
  maxFreq?: number;
  impedance?: number;
  maxVoltage?: number;
}

export interface LabelAttributes {
  series?: string;
  awgMin?: number;
  awgMax?: number;
  lengthIn?: number;
  diaIn?: number;
}

export interface SleeveTubeBraidAttributes {
  sizeRanges?: SleeveSizeRange[];
}

export interface BackshellAttributes {
  keyingPartId?: string;
  lengthAdded?: number;
  bundleAllowance?: number;
  fitments?: BackshellFitment[];
}

export interface StrainReliefAttributes {
  gender?: string;
  requiresBackshell?: boolean;
  relatedModuleHintPartId?: string;
}

export interface SpliceAttributes {
  conductorCount?: number;
  awg?: string;
  manufacturerPn?: string;
  variant?: string;
  cmaMin?: number;
  cmaMax?: number;
}

export type CategoryAttributesMap = {
  module: ModuleAttributes;
  contact: ContactAttributes;
  wire: WireAttributes;
  label: LabelAttributes;
  "sleeve-tube-braid": SleeveTubeBraidAttributes;
  backshell: BackshellAttributes;
  "strain-relief": StrainReliefAttributes;
  splice: SpliceAttributes;
};

export type PartWithAttributes = {
  [K in LibraryCategory]: PartRecord & { category: K; attributes: CategoryAttributesMap[K] };
}[LibraryCategory];

export interface PartAlias {
  partId: string;
  codeSystem: PartAliasCodeSystem;
  code: string;
}

export interface ContactWireCompat {
  contactPartId: string;
  wirePartId: string;
  status: CompatStatus;
  notes?: string;
  crimpClass?: string;
}

export interface ModuleContactCompat {
  modulePartId: string;
  contactPartId: string;
  status: CompatStatus;
  notes?: string;
  source?: string;
}

export interface ModuleBackshellCompat {
  modulePartId: string;
  backshellPartId: string;
  status: CompatStatus;
  notes?: string;
  source?: string;
}

export interface ModuleStrainReliefCompat {
  modulePartId: string;
  strainReliefPartId: string;
  status: CompatStatus;
  notes?: string;
  source?: string;
}

export interface PartImportProvenance {
  partId: string;
  sourceSheet: string;
  sourceRow?: number;
  note?: string;
}

export interface PartComponent {
  parentPartId: string;
  childPartId: string;
  quantity: number;
  unit?: string;
}

export interface AwgCmaReference {
  awg: string;
  cma: number;
}

export type CompatPair =
  | ({ kind: "contact-wire" } & ContactWireCompat)
  | ({ kind: "module-contact" } & ModuleContactCompat)
  | ({ kind: "module-backshell" } & ModuleBackshellCompat)
  | ({ kind: "module-strain-relief" } & ModuleStrainReliefCompat);

export interface PartIngestItem {
  id?: string;
  category: LibraryCategory;
  family: string;
  partNumber: string;
  description: string;
  isActive: boolean;
  stockStatus: LibraryStockStatus;
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  attributes: CategoryAttributesMap[LibraryCategory];
  aliases?: Array<{ codeSystem: string; code: string }>;
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

export type LibraryReviewQueueRecord = PartWithAttributes & {
  enteredByUserId: string;
  enteredAt: string;
};

/** @deprecated Use PartWithAttributes. Kept as alias during migration of call sites. */
export type LibraryComponentRecord = PartWithAttributes;

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

export function emptyAttributesForCategory(category: LibraryCategory): CategoryAttributesMap[LibraryCategory] {
  switch (category) {
    case "module":
      return { pinIds: [], contactPositions: [] };
    case "contact":
      return { acceptedFamilies: [] };
    case "wire":
      return { awg: "", color: "" };
    case "label":
      return {};
    case "sleeve-tube-braid":
      return { sizeRanges: [] };
    case "backshell":
      return { fitments: [] };
    case "strain-relief":
      return {};
    case "splice":
      return {};
  }
}

export function isWirePart(
  part: PartWithAttributes
): part is PartRecord & { category: "wire"; attributes: WireAttributes } {
  return part.category === "wire";
}

export function isModulePart(
  part: PartWithAttributes
): part is PartRecord & { category: "module"; attributes: ModuleAttributes } {
  return part.category === "module";
}

export function isContactPart(
  part: PartWithAttributes
): part is PartRecord & { category: "contact"; attributes: ContactAttributes } {
  return part.category === "contact";
}

export function isSleeveTubeBraidPart(
  part: PartWithAttributes
): part is PartRecord & { category: "sleeve-tube-braid"; attributes: SleeveTubeBraidAttributes } {
  return part.category === "sleeve-tube-braid";
}
