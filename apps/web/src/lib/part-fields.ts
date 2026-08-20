import type { LibraryItemCategory } from "./api";

export type PartFieldInputType = "text" | "number" | "boolean" | "string-list";

export type PartFieldMeta = {
  key: string;
  label: string;
  inputType: PartFieldInputType;
  /** When true, field lives on PartRecord; otherwise on attributes. */
  isIdentity?: boolean;
  isVisibleInViewer: boolean;
  showOnAddForm?: boolean;
  showInSearch?: boolean;
  required?: boolean;
};

const AUDIT_AND_REVIEW_FIELDS: PartFieldMeta[] = [
  { key: "createdByUserId", label: "Created by", inputType: "text", isIdentity: true, isVisibleInViewer: true },
  { key: "createdAt", label: "Created at", inputType: "text", isIdentity: true, isVisibleInViewer: true },
  { key: "isReviewed", label: "Reviewed", inputType: "boolean", isIdentity: true, isVisibleInViewer: true },
  { key: "reviewedByUserId", label: "Reviewed by", inputType: "text", isIdentity: true, isVisibleInViewer: true },
  { key: "reviewedAt", label: "Reviewed at", inputType: "text", isIdentity: true, isVisibleInViewer: true },
  { key: "lastEditedByUserId", label: "Last editor", inputType: "text", isIdentity: true, isVisibleInViewer: true },
  { key: "lastEditedAt", label: "Last edited at", inputType: "text", isIdentity: true, isVisibleInViewer: true }
];

const IDENTITY_CORE: PartFieldMeta[] = [
  {
    key: "partNumber",
    label: "Part number",
    inputType: "text",
    isIdentity: true,
    isVisibleInViewer: true,
    showOnAddForm: true,
    showInSearch: true,
    required: true
  },
  {
    key: "family",
    label: "Family",
    inputType: "text",
    isIdentity: true,
    isVisibleInViewer: true,
    showOnAddForm: true,
    showInSearch: true,
    required: true
  },
  {
    key: "description",
    label: "Description",
    inputType: "text",
    isIdentity: true,
    isVisibleInViewer: true,
    showOnAddForm: true,
    showInSearch: true,
    required: true
  },
  { key: "isActive", label: "Active", inputType: "boolean", isIdentity: true, isVisibleInViewer: true, showOnAddForm: true },
  { key: "stockStatus", label: "Stock status", inputType: "text", isIdentity: true, isVisibleInViewer: false, showOnAddForm: true },
  {
    key: "partType",
    label: "Part type",
    inputType: "text",
    isIdentity: true,
    isVisibleInViewer: true,
    showOnAddForm: true,
    showInSearch: true
  },
  {
    key: "side",
    label: "Side",
    inputType: "text",
    isIdentity: true,
    isVisibleInViewer: true,
    showOnAddForm: true,
    showInSearch: true
  },
  { key: "electricalMode", label: "Electrical mode", inputType: "text", isIdentity: true, isVisibleInViewer: true, showOnAddForm: true },
  { key: "notes", label: "Notes", inputType: "text", isIdentity: true, isVisibleInViewer: true, showOnAddForm: true }
];

function attr(
  key: string,
  label: string,
  inputType: PartFieldInputType,
  opts: Partial<Pick<PartFieldMeta, "isVisibleInViewer" | "showOnAddForm" | "showInSearch" | "required">> = {}
): PartFieldMeta {
  return {
    key,
    label,
    inputType,
    isVisibleInViewer: opts.isVisibleInViewer ?? true,
    showOnAddForm: opts.showOnAddForm ?? true,
    showInSearch: opts.showInSearch,
    required: opts.required
  };
}

export const PART_FIELDS_BY_CATEGORY: Record<LibraryItemCategory, PartFieldMeta[]> = {
  module: [
    ...IDENTITY_CORE,
    attr("genre", "Genre", "text"),
    attr("gender", "Gender", "text"),
    attr("contactFamily1", "Contact family 1", "text"),
    attr("pinCount", "Pin count", "number", { required: false }),
    attr("contactFamily2", "Contact family 2", "text", { isVisibleInViewer: false }),
    attr("pinCount2", "Pin count 2", "number", { isVisibleInViewer: false }),
    attr("emi", "EMI", "boolean"),
    attr("crimpGauge", "Crimp gauge", "text", { isVisibleInViewer: false }),
    attr("contactSize", "Contact size", "text", { isVisibleInViewer: false }),
    attr("ampRating", "Amp rating", "text", { isVisibleInViewer: false }),
    attr("operatingVoltage", "Operating voltage", "text", { isVisibleInViewer: false }),
    attr("operatingTemp", "Operating temp", "text", { isVisibleInViewer: false }),
    attr("insertArrangement", "Insert arrangement", "text", { isVisibleInViewer: false }),
    attr("defaultProtectiveCoverPartId", "Default protective cover part id", "text", {
      isVisibleInViewer: false,
      showOnAddForm: false
    }),
    attr("pinIds", "Pin IDs", "string-list", { isVisibleInViewer: false }),
    attr("positionCount", "Position count", "number"),
    attr("simSlotCount", "SIM slot count", "number", { isVisibleInViewer: false }),
    attr("slotOccupancy", "Slot occupancy", "number", { isVisibleInViewer: false }),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  contact: [
    ...IDENTITY_CORE,
    attr("genre", "Genre", "text"),
    attr("gender", "Gender", "text"),
    attr("awg", "AWG", "text"),
    attr("plating", "Plating", "text"),
    attr("termType", "Term type", "text"),
    attr("ssCompatible", "SS compatible", "boolean"),
    attr("contactSize", "Contact size", "text", { isVisibleInViewer: false }),
    attr("studSize", "Stud size", "text"),
    attr("tih", "TIH", "boolean", { isVisibleInViewer: false }),
    attr("lengthAdded", "Length added", "number", { isVisibleInViewer: false }),
    attr("acceptedAwgMin", "Accepted AWG min", "number"),
    attr("acceptedAwgMax", "Accepted AWG max", "number"),
    attr("acceptedFamilies", "Accepted wire families", "string-list"),
    attr("acceptedGauges", "Accepted gauges", "string-list"),
    attr("wireInterface", "Wire interface", "text"),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  wire: [
    IDENTITY_CORE[0],
    IDENTITY_CORE[1],
    { ...IDENTITY_CORE[2], isVisibleInViewer: false },
    attr("milSpec", "Mil spec", "text"),
    attr("awg", "AWG", "text", { required: true, showInSearch: true }),
    attr("color", "Color", "text", { required: true, showInSearch: true }),
    attr("cma", "CMA", "number", { isVisibleInViewer: false }),
    attr("wireType", "Wire type", "text", { isVisibleInViewer: false }),
    attr("insulationMaterial", "Insulation material", "text", { isVisibleInViewer: false }),
    attr("overallDia", "Overall dia", "number", { isVisibleInViewer: false }),
    attr("conductorDia", "Conductor dia", "number", { isVisibleInViewer: false }),
    attr("numberOfConductors", "Number of conductors", "number", { isVisibleInViewer: false }),
    attr("tempMax", "Temp max", "number", { isVisibleInViewer: false }),
    attr("overallWireBraid", "Overall wire braid", "boolean", { isVisibleInViewer: false }),
    attr("overallWireFoil", "Overall wire foil", "boolean", { isVisibleInViewer: false }),
    attr("internalPairFoil", "Internal pair foil", "boolean", { isVisibleInViewer: false }),
    attr("weightPerFt", "Weight per ft", "number", { isVisibleInViewer: false }),
    attr("k1", "K1", "number", { isVisibleInViewer: false }),
    attr("k2", "K2", "number", { isVisibleInViewer: false }),
    attr("lossCoefficient", "Loss coefficient", "number", { isVisibleInViewer: false }),
    attr("maxFreq", "Max freq", "number", { isVisibleInViewer: false }),
    attr("impedance", "Impedance", "number", { isVisibleInViewer: false }),
    attr("maxVoltage", "Max voltage", "number", { isVisibleInViewer: false }),
    IDENTITY_CORE[3],
    IDENTITY_CORE[4],
    ...IDENTITY_CORE.slice(5),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  label: [
    ...IDENTITY_CORE,
    attr("series", "Series", "text"),
    attr("awgMin", "AWG min", "number"),
    attr("awgMax", "AWG max", "number"),
    attr("lengthIn", "Length (in)", "number", { isVisibleInViewer: false }),
    attr("diaIn", "Diameter (in)", "number", { isVisibleInViewer: false }),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  "sleeve-tube-braid": [...IDENTITY_CORE, ...AUDIT_AND_REVIEW_FIELDS],
  backshell: [
    ...IDENTITY_CORE,
    attr("keyingPartId", "Keying part id", "text", { isVisibleInViewer: false, showOnAddForm: false }),
    attr("lengthAdded", "Length added", "number", { isVisibleInViewer: false }),
    attr("bundleAllowance", "Bundle allowance", "number", { isVisibleInViewer: false }),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  "strain-relief": [
    ...IDENTITY_CORE,
    attr("gender", "Gender", "text"),
    attr("requiresBackshell", "Requires backshell", "boolean"),
    attr("relatedModuleHintPartId", "Related module hint part id", "text", {
      isVisibleInViewer: false,
      showOnAddForm: false
    }),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  splice: [
    ...IDENTITY_CORE,
    attr("variant", "Variant", "text"),
    attr("conductorCount", "Conductor count", "number"),
    attr("awg", "AWG", "text"),
    attr("cmaMin", "CMA min", "number", { isVisibleInViewer: false }),
    attr("cmaMax", "CMA max", "number", { isVisibleInViewer: false }),
    attr("manufacturerPn", "Manufacturer PN", "text"),
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  frame: [
    ...IDENTITY_CORE,
    attr("moduleCapacity", "Module capacity", "number"),
    attr("slotIds", "Slot IDs", "string-list"),
    ...AUDIT_AND_REVIEW_FIELDS
  ]
};

export function getPartFieldsForCategory(category: LibraryItemCategory): PartFieldMeta[] {
  return PART_FIELDS_BY_CATEGORY[category];
}

export function readPartFieldRawValue(
  part: object & { attributes?: Record<string, unknown> | null },
  field: PartFieldMeta
): unknown {
  if (field.isIdentity) {
    return (part as Record<string, unknown>)[field.key];
  }
  return part.attributes?.[field.key];
}

export function formatPartFieldDisplayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "-" : value.map(String).join(", ");
  }
  return String(value);
}

export function parseAttributeFormValue(inputType: PartFieldInputType, raw: string): unknown | undefined {
  const str = raw.trim();
  if (inputType === "boolean") {
    if (str === "") {
      return undefined;
    }
    return str === "true";
  }
  if (inputType === "number") {
    if (str === "") {
      return undefined;
    }
    const parsed = Number(str);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (inputType === "string-list") {
    return str
      .split(/[,;\s]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return str === "" ? undefined : str;
}

export function collectAttributesFromFormData(
  formData: FormData,
  category: LibraryItemCategory
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const field of getPartFieldsForCategory(category)) {
    if (field.isIdentity) {
      continue;
    }
    const raw = formData.get(`attr:${field.key}`) ?? formData.get(field.key);
    if (raw === null || raw === undefined) {
      continue;
    }
    const parsed = parseAttributeFormValue(field.inputType, String(raw));
    if (parsed === undefined) {
      continue;
    }
    attributes[field.key] = parsed;
  }
  if (category === "module" && attributes.pinIds === undefined) {
    attributes.pinIds = [];
  }
  if (category === "module" && attributes.contactPositions === undefined) {
    attributes.contactPositions = [];
  }
  if (category === "contact" && attributes.acceptedFamilies === undefined) {
    attributes.acceptedFamilies = [];
  }
  if (category === "contact" && attributes.acceptedGauges === undefined) {
    attributes.acceptedGauges = [];
  }
  if (category === "sleeve-tube-braid" && attributes.sizeRanges === undefined) {
    attributes.sizeRanges = [];
  }
  if (category === "backshell" && attributes.fitments === undefined) {
    attributes.fitments = [];
  }
  if (category === "frame" && attributes.slotIds === undefined) {
    attributes.slotIds = [];
  }
  return attributes;
}

export function emptyAttributesForCategory(category: LibraryItemCategory): Record<string, unknown> {
  if (category === "module") {
    return { pinIds: [], contactPositions: [], simSlotSections: [] };
  }
  if (category === "contact") {
    return { acceptedFamilies: [], acceptedGauges: [] };
  }
  if (category === "wire") {
    return { awg: "", color: "" };
  }
  if (category === "sleeve-tube-braid") {
    return { sizeRanges: [] };
  }
  if (category === "backshell") {
    return { fitments: [] };
  }
  if (category === "frame") {
    return { slotIds: [] };
  }
  return {};
}

/** Canvas slot modules: mount in a frame, not SIM inserts or frames. */
export function isCanvasConnectorPart(part: { category: string; partType?: string }): boolean {
  if (part.category !== "module") {
    return false;
  }
  const partType = (part.partType ?? "MODULE").trim().toUpperCase();
  return partType === "MODULE" || partType === "";
}

/** ITA / Receiver housings selectable as a canvas connector node. */
export function isCanvasFramePart(part: { category: string; partType?: string }): boolean {
  if (part.category !== "frame") {
    return false;
  }
  const partType = (part.partType ?? "").trim().toUpperCase();
  return partType === "ITA" || partType === "RECEIVER" || partType === "RCV" || partType === "";
}

/** Parts that can be chosen in Define Connector (standalone modules or frames). */
export function isCanvasDefinablePart(part: { category: string; partType?: string }): boolean {
  return isCanvasConnectorPart(part) || isCanvasFramePart(part);
}

/** UI label for catalog partType; Receiver frames are shown as RCV. */
export function displayPartType(partType?: string): string {
  const normalized = (partType ?? "").trim().toUpperCase();
  if (normalized === "RECEIVER") {
    return "RCV";
  }
  return normalized;
}
