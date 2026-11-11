import type { PartMediaDto } from "@/lib/api";

/** Choose a usable side profile for each part without mixing in mating-face views. */
export function sideProfilesByPart(media: PartMediaDto[], failedUrls: ReadonlySet<string>): Map<string, PartMediaDto> {
  const profiles = media.filter(row => row.viewType === "side_profile" && !failedUrls.has(row.url) && (
    row.mimeType ? row.mimeType.startsWith("image/") : /\.(png|jpe?g|webp|avif|gif|svg)(?:[?#]|$)/i.test(row.url)
  ));
  profiles.sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const byPart = new Map<string, PartMediaDto>();
  for (const profile of profiles) if (!byPart.has(profile.partId)) byPart.set(profile.partId, profile);
  return byPart;
}
