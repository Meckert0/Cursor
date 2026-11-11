export const DEFAULT_ADMIN_SECTION_TITLES = {
  pageDescriptions: "Global Page Descriptions",
  userAccess: "Users, Projects, and Canvas Access",
  database: "Database",
  items: "Item Database Viewer",
  compatibility: "Compatibility & Aliases",
  media: "Images and Files"
} as const;

export type AdminSectionKey = keyof typeof DEFAULT_ADMIN_SECTION_TITLES;
export type AdminSectionTitles = Record<AdminSectionKey, string>;
export const ADMIN_SECTION_KEYS = Object.keys(DEFAULT_ADMIN_SECTION_TITLES) as AdminSectionKey[];

export interface UiCopySettings {
  projectsHeaderDescription: string;
  harnessHeaderDescription: string;
  adminSectionTitles: AdminSectionTitles;
}

export interface UiCopySettingsUpdate {
  projectsHeaderDescription?: string;
  harnessHeaderDescription?: string;
  adminSectionTitles?: Partial<AdminSectionTitles>;
}

export function resolveUiCopySettings(input: UiCopySettingsUpdate = {}): UiCopySettings {
  return {
    projectsHeaderDescription: input.projectsHeaderDescription?.trim() ||
      "Projects are collections of cable designs. They can be used to keep cable designs separate.",
    harnessHeaderDescription: input.harnessHeaderDescription?.trim() ||
      "Drag connectors to define a visual harness shape. Connector positions are carried forward in Details. Use node handles to drag-connect paths directly on canvas, including connector-to-junction topology.",
    adminSectionTitles: Object.fromEntries(ADMIN_SECTION_KEYS.map(key => [
      key, input.adminSectionTitles?.[key]?.trim() || DEFAULT_ADMIN_SECTION_TITLES[key]
    ])) as AdminSectionTitles
  };
}
