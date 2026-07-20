import type { RevisionDto } from "./api";

export function buildNextWireName(paths: RevisionDto["snapshot"]["paths"]): string {
  const numericSuffixes = paths
    .map((path) => /^wire(\d+)$/.exec(path.wireName ?? "")?.[1])
    .map((value) => (value ? Number.parseInt(value, 10) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  const next = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : paths.length + 1;
  return `wire${next}`;
}

export function buildNextCanvasId(existingIds: string[], prefix: "c_canvas_" | "j_canvas_" | "p_canvas_"): string {
  const used = new Set(existingIds);
  let next = used.size + 1;
  while (used.has(`${prefix}${next}`)) {
    next += 1;
  }
  return `${prefix}${next}`;
}

export function buildNextConnectorReference(connectors: RevisionDto["snapshot"]["connectors"]): string {
  const used = new Set(connectors.map((connector) => connector.reference.toLowerCase()));
  let next = connectors.length + 1;
  while (used.has(`j${next}`)) {
    next += 1;
  }
  return `J${next}`;
}
