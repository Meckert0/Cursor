import type { PartMedia, PartMediaInput, PartWithAttributes } from "./library.js";

export interface SideProfileAsset {
  partNumber: string;
  fileName: string;
  pixelWidth: number;
  pixelHeight: number;
  page: number;
  altText?: string;
  caption?: string;
  sha256?: string;
}

export interface SideProfileManifest {
  source: string;
  images: SideProfileAsset[];
}

export interface SideProfileImportPlan {
  updates: PartMediaInput[];
  unchanged: string[];
  skipped: Array<{ partNumber: string; reason: string }>;
}

function hasConflictingManufacturer(part: PartWithAttributes): boolean {
  const metadata = { ...part.extraAttributes, ...part.attributes } as Record<string, unknown>;
  const names = [metadata.manufacturer, metadata.manufacturerName, metadata.brand]
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  return names.some(name => !/^(?:VPC|Virginia Panel(?: Corporation)?)(?:\s*\(.*\))?$/i.test(name.trim()));
}

/** Exact part-number matches only: family illustrations do not establish a variant. */
export function planSideProfileImport(
  manifest: SideProfileManifest,
  parts: readonly PartWithAttributes[],
  existing: readonly PartMedia[],
  options: { baseUrl?: string } = {}
): SideProfileImportPlan {
  let origin = "";
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error("Media base URL must be an HTTP(S) origin without credentials or a path.");
    origin = parsed.origin;
  }
  const plan: SideProfileImportPlan = { updates: [], unchanged: [], skipped: [] };
  const seen = new Set<string>();
  for (const asset of manifest.images) {
    if (!/^\d{9}$/.test(asset.partNumber) || asset.fileName !== `${asset.partNumber}.png`) throw new Error(`Invalid exact part asset: ${asset.partNumber}`);
    if (seen.has(asset.partNumber)) throw new Error(`Duplicate asset part number: ${asset.partNumber}`);
    seen.add(asset.partNumber);
    const matches = parts.filter(part => !part.isArchived && part.partNumber.trim() === asset.partNumber);
    const skip = (reason: string) => plan.skipped.push({ partNumber: asset.partNumber, reason });
    if (!matches.length) { skip("Part number is absent from this database."); continue; }
    if (matches.length !== 1) { skip("Part number is ambiguous in this database."); continue; }
    const part = matches[0];
    if (part.category !== "frame" && part.category !== "module") { skip("Part is not a connector frame or module."); continue; }
    if (hasConflictingManufacturer(part)) { skip("Manufacturer metadata does not identify VPC."); continue; }
    const input: PartMediaInput = {
      id: `vpc-side-profile-${part.id}`,
      partId: part.id,
      url: `${origin}/part-media/vpc-side-profiles/${asset.fileName}`,
      storageKey: `part-media/vpc-side-profiles/${asset.fileName}`,
      viewType: "side_profile",
      orientation: "manufacturer_side_view",
      mimeType: "image/png",
      pixelWidth: asset.pixelWidth,
      pixelHeight: asset.pixelHeight,
      altText: asset.altText ?? `VPC ${asset.partNumber} side profile`,
      caption: asset.caption ?? `Manufacturer side profile extracted from ${manifest.source}, page ${asset.page}.`,
      sortOrder: 0,
      isPrimary: true,
      source: `${manifest.source}, page ${asset.page}`,
      revision: asset.sha256
    };
    const previous = existing.find(row => row.id === input.id);
    if (previous && Object.entries(input).every(([key, value]) => previous[key as keyof PartMedia] === value)) {
      plan.unchanged.push(asset.partNumber);
    } else plan.updates.push(input);
  }
  return plan;
}
