import type { LibraryCategory } from "./library.js";

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

export const PART_FIELDS_BY_CATEGORY: Record<LibraryCategory, PartFieldMeta[]> = {
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
  "sleeve-tube-braid": [
    ...IDENTITY_CORE,
    ...AUDIT_AND_REVIEW_FIELDS
  ],
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

export function getPartFieldsForCategory(category: LibraryCategory): PartFieldMeta[] {
  return PART_FIELDS_BY_CATEGORY[category];
}
