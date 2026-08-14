import type { LibraryCategory } from "../library.js";

/**
 * Deterministic part id: prt-<category>-<pn-slug>. Re-running the import
 * always produces the same ids, so ingest upserts instead of duplicating.
 */
export function makePartId(category: LibraryCategory, normalizedPartNumber: string): string {
  const slug = normalizedPartNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    throw new Error(`Cannot build a part id for empty part number (category=${category})`);
  }
  return `prt-${category}-${slug}`;
}
