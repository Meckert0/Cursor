export const DATABASE_TABS = ["items", "compatibility", "media"] as const;
export type DatabaseTab = typeof DATABASE_TABS[number];
export interface DatabaseLocation {
  q: string;
  family: string;
  tab: DatabaseTab;
}

const CHANGE_EVENT = "database-location-change";

export function parseDatabaseLocation(search: string): DatabaseLocation {
  const params = new URLSearchParams(search);
  return {
    q: params.get("q") ?? "",
    family: (params.get("family") ?? "").trim().toLowerCase(),
    tab: DATABASE_TABS.find(tab => tab === params.get("databaseTab")) ?? "items"
  };
}

export function readDatabaseLocation(): string {
  return window.location.search;
}

export function subscribeDatabaseLocation(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("popstate", listener);
  };
}

export function updateDatabaseLocation(location: DatabaseLocation): void {
  const url = new URL(window.location.href);
  for (const [key, value] of [["q", location.q], ["family", location.family], ["databaseTab", location.tab]]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
