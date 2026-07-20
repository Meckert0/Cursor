import type { LibraryCategory } from "./library.js";

export type BuiltinLibraryField = {
  key: string;
  label: string;
  isVisibleInViewer: boolean;
  showOnAddForm?: boolean;
  showInSearch?: boolean;
};

const AUDIT_AND_REVIEW_FIELDS: BuiltinLibraryField[] = [
  { key: "createdByUserId", label: "Created by", isVisibleInViewer: true },
  { key: "createdAt", label: "Created at", isVisibleInViewer: true },
  { key: "isReviewed", label: "Reviewed", isVisibleInViewer: true },
  { key: "reviewedByUserId", label: "Reviewed by", isVisibleInViewer: true },
  { key: "reviewedAt", label: "Reviewed at", isVisibleInViewer: true },
  { key: "lastEditedByUserId", label: "Last editor", isVisibleInViewer: true },
  { key: "lastEditedAt", label: "Last edited at", isVisibleInViewer: true }
];

const COMPATIBILITY_FIELDS: BuiltinLibraryField[] = [
  { key: "pinCount", label: "Pin count", isVisibleInViewer: true, showOnAddForm: true },
  { key: "pinIds", label: "Pin IDs", isVisibleInViewer: false, showOnAddForm: true },
  { key: "acceptedAwgMin", label: "Accepted AWG min", isVisibleInViewer: true, showOnAddForm: true },
  { key: "acceptedAwgMax", label: "Accepted AWG max", isVisibleInViewer: true, showOnAddForm: true },
  { key: "acceptedFamilies", label: "Accepted wire families", isVisibleInViewer: true, showOnAddForm: true }
];

const COMMON_ITEM_FIELDS: BuiltinLibraryField[] = [
  { key: "partNumber", label: "Part number", isVisibleInViewer: true, showOnAddForm: true, showInSearch: true },
  { key: "family", label: "Family", isVisibleInViewer: true, showOnAddForm: true, showInSearch: true },
  { key: "description", label: "Description", isVisibleInViewer: true, showInSearch: true },
  { key: "isActive", label: "Active", isVisibleInViewer: true },
  { key: "stockStatus", label: "Stock status", isVisibleInViewer: false },
  { key: "compatibilityHints", label: "Compatibility hints", isVisibleInViewer: false },
  ...AUDIT_AND_REVIEW_FIELDS
];

const MODULE_AND_CONTACT_FIELDS: BuiltinLibraryField[] = [
  { key: "partNumber", label: "Part number", isVisibleInViewer: true, showOnAddForm: true, showInSearch: true },
  { key: "family", label: "Family", isVisibleInViewer: true, showOnAddForm: true, showInSearch: true },
  { key: "description", label: "Description", isVisibleInViewer: true, showInSearch: true },
  ...COMPATIBILITY_FIELDS,
  { key: "isActive", label: "Active", isVisibleInViewer: true },
  { key: "stockStatus", label: "Stock status", isVisibleInViewer: false },
  { key: "compatibilityHints", label: "Compatibility hints", isVisibleInViewer: false },
  ...AUDIT_AND_REVIEW_FIELDS
];

export const BUILTIN_FIELDS_BY_CATEGORY: Record<LibraryCategory, BuiltinLibraryField[]> = {
  contact: MODULE_AND_CONTACT_FIELDS,
  wire: [
    { key: "partNumber", label: "Part number", isVisibleInViewer: true, showOnAddForm: true, showInSearch: true },
    { key: "family", label: "Family", isVisibleInViewer: true, showOnAddForm: true, showInSearch: true },
    { key: "description", label: "Description", isVisibleInViewer: false, showInSearch: true },
    { key: "awg", label: "AWG", isVisibleInViewer: true },
    { key: "color", label: "Color", isVisibleInViewer: true },
    { key: "isActive", label: "Active", isVisibleInViewer: true },
    { key: "stockStatus", label: "Stock status", isVisibleInViewer: false },
    { key: "compatibilityHints", label: "Compatibility hints", isVisibleInViewer: false },
    ...AUDIT_AND_REVIEW_FIELDS
  ],
  "sleeve-tube-braid": COMMON_ITEM_FIELDS,
  label: COMMON_ITEM_FIELDS,
  backshell: COMMON_ITEM_FIELDS,
  "strain-relief": COMMON_ITEM_FIELDS,
  module: MODULE_AND_CONTACT_FIELDS,
  splice: COMMON_ITEM_FIELDS
};

export function getBuiltinFieldsForCategory(category: LibraryCategory): BuiltinLibraryField[] {
  return BUILTIN_FIELDS_BY_CATEGORY[category];
}

export function builtinFieldDefinitionId(category: LibraryCategory, key: string): string {
  return `fld-${category}-${key.toLowerCase()}`;
}
