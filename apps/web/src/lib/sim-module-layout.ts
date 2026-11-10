import type { LibraryComponentDto } from "./api";
import { simModuleProfile, simSlotSections } from "./sim-modules";

export function simModuleLayout(host: LibraryComponentDto | undefined) {
  const sections = simSlotSections(host);
  const candidate = simModuleProfile(host);
  const profile = candidate && sections.length === candidate.bankSizes.length && sections.every((section, bank) => section.length === candidate.bankSizes[bank]) ? candidate : undefined;
  const i2mx = profile?.layout === "i2mx";
  const columns = Math.max(1, ...sections.map(section => section.length));
  const rows = i2mx ? 2 : Math.max(1, sections.length);
  const width = profile?.lengthMm ?? (i2mx ? 50 : columns * 6.2 + 16);
  const height = profile?.widthMm ?? (i2mx ? 16 : rows * 5.5 + 3);
  const end = profile ? 4 : 3;
  const left = end + 3;
  const top = 1.5;
  const rowGap = 1.2, columnGap = .5;
  const terminalWidth = i2mx ? 5 : 0;
  const terminalGap = i2mx ? 2 : 0;
  const slotWidth = (width - left * 2 - terminalWidth - terminalGap - columnGap * (columns - 1)) / columns;
  const slotHeight = (height - top * 2 - rowGap * (rows - 1)) / rows;
  const slots = sections.map((section, bank) => section.map((slotId, column) => ({
    slotId, bank, column,
    x: i2mx && bank === 2 ? width - left - terminalWidth : left + column * (slotWidth + columnGap),
    y: i2mx && bank === 2 ? (height - slotWidth) / 2 : top + bank * (slotHeight + rowGap),
    width: i2mx && bank === 2 ? terminalWidth : slotWidth,
    height: i2mx && bank === 2 ? slotWidth : slotHeight
  })));
  const minimumHeight = Math.min(slotHeight, ...slots.flat().map(slot => slot.height));
  return { sections, profile, width, height, end, slots, displayWidth: Math.max(440, width * 32 / minimumHeight) };
}
