import type { LibraryComponentDto, PartMediaDto } from "@/lib/api";
import { isISeriesModule, ISERIES_SIDE_PROFILE_PART_NUMBER, SIDE_PROFILE_EXITS } from "../../../../src/domain/part-side-profiles";

export { isISeriesModule };

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

/** Frames never inherit a slot module's image; this fallback is for top-level modules only. */
export function standaloneSideProfile(
  part: LibraryComponentDto | undefined,
  profiles: ReadonlyMap<string, PartMediaDto>,
  catalog: readonly LibraryComponentDto[],
  isFrame: boolean
): PartMediaDto | undefined {
  if (!part) return undefined;
  const own = profiles.get(part.id);
  if (own || isFrame || !isISeriesModule(part)) return own;
  const sources = catalog.filter(row => row.category === "module" && row.partNumber.trim() === ISERIES_SIDE_PROFILE_PART_NUMBER);
  return sources.length === 1 ? profiles.get(sources[0].id) : undefined;
}

type Point = { x: number; y: number };
type Path = { id: string; fromConnectorId: string; toConnectorId: string };

/** The first attached nonvertical section defines the exit side, independent of array order. */
export function cableExitFacesLeft(nodeId: string, centers: ReadonlyMap<string, Point>, paths: readonly Path[]): boolean {
  const center = centers.get(nodeId);
  if (!center) return false;
  const attached = paths.filter(path => path.fromConnectorId === nodeId || path.toConnectorId === nodeId)
    .slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const path of attached) {
    const other = centers.get(path.fromConnectorId === nodeId ? path.toConnectorId : path.fromConnectorId);
    if (other && Math.abs(other.x - center.x) > 0.5) return other.x < center.x;
  }
  return false;
}

export function sideProfileExitPoint(media: PartMediaDto, width: number, height: number, flipped: boolean): Point {
  if (media.orientation !== "cable_exit_right") return { x: width / 2, y: height / 2 };
  const sourcePart = media.url.match(/\/(\d{9})\.png(?:[?#]|$)/)?.[1];
  const exit = sourcePart ? SIDE_PROFILE_EXITS[sourcePart] : undefined;
  const imageWidth = media.pixelWidth ?? width;
  const imageHeight = media.pixelHeight ?? height;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawnWidth = imageWidth * scale;
  const drawnHeight = imageHeight * scale;
  const point = exit ?? { x: 0.92, y: 0.5 };
  return {
    x: (width - drawnWidth) / 2 + drawnWidth * (flipped ? 1 - point.x : point.x),
    y: (height - drawnHeight) / 2 + drawnHeight * point.y
  };
}
