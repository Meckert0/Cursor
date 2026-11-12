export const DEFAULT_ADMIN_SECTION_TITLES = {
  userAccess: "Users, Projects, and Canvas Access",
  database: "Database",
  items: "Item Database Viewer",
  compatibility: "Compatibility & Aliases",
  media: "Images and Files"
} as const;

export type AdminSectionKey = keyof typeof DEFAULT_ADMIN_SECTION_TITLES;
export type AdminSectionTitles = Record<AdminSectionKey, string>;
export const ADMIN_SECTION_KEYS = Object.keys(DEFAULT_ADMIN_SECTION_TITLES) as AdminSectionKey[];

export const DEFAULT_PAGE_HEADERS = {
  projects: { title: "Cable Design Tool Frontend (MVP)", description: "Projects are collections of cable designs. They can be used to keep cable designs separate." },
  project: { title: "Project workspace", description: "Projects are collections of cable designs. They can be used to keep cable designs separate." },
  canvas: { title: "Harness Canvas", description: "Drag connectors to define a visual harness shape. Connector positions are carried forward in Details. Use node handles to drag-connect paths directly on canvas, including connector-to-junction topology." },
  wirelist: { title: "Wirelist", description: "Harness {harnessName}. Spreadsheet edits autosave into revision snapshot data used by Details." },
  details: { title: "Details", description: "Harness {harnessName}" },
  revision: { title: "Revision Workspace", description: "Revision {revisionNumber} ({revisionId}) for {harnessName}" },
  library: { title: "Library catalog", description: "Search and filter all item categories." },
  libraryItem: { title: "{partNumber}", description: "{partDescription}" },
  admin: { title: "Admin console", description: "Full visibility across users, projects, harness canvases, and library inventory." },
  datastores: { title: "Datastore Admin Console (Phase 7)", description: "Review queue for unreviewed library entries. Reviewed entries become globally visible." },
  login: { title: "Sign in", description: "Sign in to load your projects and harness data." },
  register: { title: "Create account", description: "Register a user account to keep your project data between sessions." }
} as const;

export type PageKey = keyof typeof DEFAULT_PAGE_HEADERS;
export interface PageHeaderCopy { title: string; description: string }
export type PageHeaders = Record<PageKey, PageHeaderCopy>;
export type PageHeaderUpdates = Partial<Record<PageKey, Partial<PageHeaderCopy>>>;
export const PAGE_KEYS = Object.keys(DEFAULT_PAGE_HEADERS) as PageKey[];
export const PUBLIC_PAGE_KEYS: readonly PageKey[] = ["login", "register"];

export function formatPageHeaderText(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : token);
}

/** Keep the old global descriptions readable while each page gets its own copy. */
export function pageHeaderUpdates(input: UiCopySettingsUpdate): PageHeaderUpdates {
  const updates: PageHeaderUpdates = {};
  if (input.projectsHeaderDescription?.trim()) {
    for (const key of ["projects", "project"] as const) updates[key] = { description: input.projectsHeaderDescription.trim() };
  }
  if (input.harnessHeaderDescription?.trim()) updates.canvas = { description: input.harnessHeaderDescription.trim() };
  for (const key of PAGE_KEYS) {
    for (const field of ["title", "description"] as const) {
      const value = input.pageHeaders?.[key]?.[field];
      if (value !== undefined) updates[key] = { ...updates[key], [field]: value };
    }
  }
  return updates;
}

export interface UiCopySettings {
  projectsHeaderDescription: string;
  harnessHeaderDescription: string;
  adminSectionTitles: AdminSectionTitles;
  pageHeaders: PageHeaders;
}

export interface UiCopySettingsUpdate {
  projectsHeaderDescription?: string;
  harnessHeaderDescription?: string;
  adminSectionTitles?: Partial<AdminSectionTitles>;
  pageHeaders?: PageHeaderUpdates;
}

export function resolveUiCopySettings(input: UiCopySettingsUpdate = {}): UiCopySettings {
  const updates = pageHeaderUpdates(input);
  const pageHeaders = Object.fromEntries(PAGE_KEYS.map(key => [key, {
    title: updates[key]?.title?.trim() || DEFAULT_PAGE_HEADERS[key].title,
    description: updates[key]?.description?.trim() ?? DEFAULT_PAGE_HEADERS[key].description
  }])) as PageHeaders;
  return {
    projectsHeaderDescription: pageHeaders.projects.description,
    harnessHeaderDescription: pageHeaders.canvas.description,
    pageHeaders,
    adminSectionTitles: Object.fromEntries(ADMIN_SECTION_KEYS.map(key => [
      key, input.adminSectionTitles?.[key]?.trim() || DEFAULT_ADMIN_SECTION_TITLES[key]
    ])) as AdminSectionTitles
  };
}

export function mergeUiCopySettings(current: UiCopySettings, input: UiCopySettingsUpdate): UiCopySettings {
  const updates = pageHeaderUpdates(input);
  return resolveUiCopySettings({
    adminSectionTitles: { ...current.adminSectionTitles, ...input.adminSectionTitles },
    pageHeaders: Object.fromEntries(PAGE_KEYS.map(key => [key, { ...current.pageHeaders[key], ...updates[key] }]))
  });
}
