import { LIBRARY_ITEM_CATEGORIES, type LibraryFieldDefinitionDto, type LibraryItemCategory } from "@/lib/api";

type BuiltinLibraryField = {
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

const BUILTIN_FIELDS_BY_CATEGORY: Record<LibraryItemCategory, BuiltinLibraryField[]> = {
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

function builtinFieldDefinitionId(category: LibraryItemCategory, key: string): string {
  return `fld-${category}-${key.toLowerCase()}`;
}

export function mergeFieldDefinitionsWithBuiltinDefaults(
  category: LibraryItemCategory,
  definitions: LibraryFieldDefinitionDto[]
): LibraryFieldDefinitionDto[] {
  if (!LIBRARY_ITEM_CATEGORIES.includes(category)) {
    return definitions;
  }

  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const now = new Date().toISOString();

  for (const builtin of BUILTIN_FIELDS_BY_CATEGORY[category]) {
    if (byKey.has(builtin.key)) {
      continue;
    }
    byKey.set(builtin.key, {
      id: builtinFieldDefinitionId(category, builtin.key),
      category,
      key: builtin.key,
      label: builtin.label,
      valueType: "text",
      isSystem: true,
      isVisibleInViewer: builtin.isVisibleInViewer,
      showOnAddForm: builtin.showOnAddForm ?? false,
      showInSearch: builtin.showInSearch ?? false,
      createdByUserId: "system-user",
      createdAt: now,
      updatedAt: now
    });
  }

  return Array.from(byKey.values());
}
