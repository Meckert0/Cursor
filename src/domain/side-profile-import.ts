import type { PartMedia, PartMediaInput, PartWithAttributes } from "./library.js";
import { isISeriesModule, ISERIES_SIDE_PROFILE_PART_NUMBER } from "./part-side-profiles.js";

export interface SideProfileAsset {
  partNumber: string;
  fileName: string;
  pixelWidth: number;
  pixelHeight: number;
  page: number;
  altText?: string;
  caption?: string;
  sha256?: string;
  orientation?: string;
  sharedWith?: "standalone_iseries_modules";
}

export interface SideProfileManifest {
  source: string;
  images: SideProfileAsset[];
  assetBasePath?: string;
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
  const basePath = manifest.assetBasePath ?? "/part-media/vpc-side-profiles";
  if (!/^\/part-media\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(basePath)) throw new Error("Invalid bundled asset directory.");
  const record = (asset: SideProfileAsset, part: PartWithAttributes, shared = false) => {
    const input: PartMediaInput = {
      id: `vpc-side-profile-${part.id}`,
      partId: part.id,
      url: `${origin}${basePath}/${asset.fileName}`,
      storageKey: `${basePath.slice(1)}/${asset.fileName}`,
      viewType: "side_profile",
      orientation: asset.orientation ?? "manufacturer_side_view",
      mimeType: "image/png",
      pixelWidth: asset.pixelWidth,
      pixelHeight: asset.pixelHeight,
      altText: shared ? `${part.partNumber} standalone iSeries module side profile` : asset.altText ?? `VPC ${asset.partNumber} side profile`,
      caption: shared ? `User-approved shared ${ISERIES_SIDE_PROFILE_PART_NUMBER} side profile for standalone iSeries module ${part.partNumber}. Installed modules use the frame image.` : asset.caption ?? `Manufacturer side profile extracted from ${manifest.source}, page ${asset.page}.`,
      sortOrder: 0,
      isPrimary: true,
      source: `${manifest.source}, page ${asset.page}${shared ? `; shared module ${ISERIES_SIDE_PROFILE_PART_NUMBER}` : ""}`,
      revision: asset.sha256
    };
    const previous = existing.find(row => row.id === input.id);
    if (previous && Object.entries(input).every(([key, value]) => previous[key as keyof PartMedia] === value)) plan.unchanged.push(part.partNumber);
    else plan.updates.push(input);
  };
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
    record(asset, part);
  }
  const shared = manifest.images.find(asset => asset.partNumber === ISERIES_SIDE_PROFILE_PART_NUMBER && asset.sharedWith === "standalone_iseries_modules");
  if (shared) for (const part of parts) {
    if (part.isArchived || seen.has(part.partNumber.trim()) || !isISeriesModule(part) || hasConflictingManufacturer(part)) continue;
    if (parts.filter(row => !row.isArchived && row.partNumber.trim() === part.partNumber.trim()).length !== 1) continue;
    // An explicitly catalogued exact view takes precedence over the generic shared side view.
    if (existing.some(row => row.partId === part.id && row.viewType === "side_profile" && row.isPrimary && row.id !== `vpc-side-profile-${part.id}`)) continue;
    record(shared, part, true);
  }
  return plan;
}
