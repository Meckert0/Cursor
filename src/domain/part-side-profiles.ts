/** The user-approved shared side view is only for standalone iSeries modules. */
export const ISERIES_SIDE_PROFILE_PART_NUMBER = "510161101";

export function isISeriesModule(part: { category: string; family: string; partType?: string }): boolean {
  return part.category === "module" && part.partType?.trim().toUpperCase() !== "SIM_INSERT" &&
    /(?:^|[^a-z0-9])(?:iseries|icon|i1|i2)(?:$|[^a-z0-9])/i.test(part.family);
}

type ProfilePart = { category: string; family: string; partType?: string };

/** Relative canvas size; a compatible strain relief follows its parent assembly. */
export function sideProfileScale(part: ProfilePart | undefined, compatibleParent?: ProfilePart): number {
  const host = part?.category === "strain-relief" ? compatibleParent : part;
  if (!host) return 1;
  if (isISeriesModule(host) || (host.category === "frame" && /^i1(?:\b|XL\b)/i.test(host.family.trim()))) return 0.6561;
  return 1;
}

/** Coordinates refer to the normalized, upright image with its cable exit on the right. */
export const SIDE_PROFILE_EXITS: Readonly<Record<string, { x: number; y: number }>> = {
  "310123101": { x: 0.85, y: 0.5 },
  "310123102": { x: 0.92, y: 0.5 },
  "310123103": { x: 0.85, y: 0.5 },
  "310128101": { x: 0.93, y: 0.5 },
  "410123101": { x: 0.96, y: 0.24 },
  "410123102": { x: 0.97, y: 0.23 },
  "410123232": { x: 0.86, y: 0.24 },
  "410128101": { x: 0.85, y: 0.27 },
  "410128102": { x: 0.89, y: 0.27 },
  "410128106": { x: 0.85, y: 0.27 },
  "510161101": { x: 0.94, y: 0.5 }
};
