import { describe, expect, it } from "vitest";
import type { LibraryComponentDto } from "./api";
import { simModuleLayout } from "./sim-module-layout";

const host = { category: "module", partType: "MODULE", electricalMode: "INSERT_HOST", partNumber: "510161130", attributes: { simSlotCount: 16 } } as LibraryComponentDto;

describe("SIM face geometry", () => {
  it.each(["510160130", "510161130", "510143001", "510144001"])("keeps every slot inside the %s face with consistent bank alignment", partNumber => {
    const layout = simModuleLayout({ ...host, partNumber, attributes: {} });
    expect(layout.profile).toBeDefined();
    const slots = layout.slots.flat();
    const icon = partNumber.startsWith("51016");
    expect(slots).toHaveLength(icon ? 16 : 11);
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThan(0);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.x + slot.width).toBeLessThan(layout.width);
      expect(slot.y + slot.height).toBeLessThan(layout.height);
      expect(slot.height / layout.width * layout.displayWidth).toBeGreaterThanOrEqual(31.99);
    }
    if (partNumber === "510161130") expect(layout.width / layout.height).toBeCloseTo(30.22 / 56.13);
    else expect(layout.width / layout.height).toBeGreaterThan(icon ? 4 : 3);
    expect(layout.slots[0][0].x).toBe(layout.slots[1][0].x);
    expect(layout.slots[0][0].y).toBeLessThan(layout.slots[1][0].y);
    if (!icon) {
      expect(layout.slots.map(bank => bank.length)).toEqual([5, 5, 1]);
      expect(layout.slots[2][0].x).toBeGreaterThan(layout.slots[0][4].x + layout.slots[0][4].width);
    }
  });

  it("matches the supplied 510161130 mating face with A over B and positions 8…1 across each opening", () => {
    const layout = simModuleLayout(host);
    expect(layout.portrait).toBe(true);
    expect(layout.slots.flat().map(slot => slot.slotId)).toEqual(Array.from({ length: 16 }, (_, index) => String(index + 1)));
    expect(layout.slots[0][0].label).toBe("A1");
    expect(layout.slots[1][0].label).toBe("B1");
    for (const bank of layout.slots) {
      expect(bank[0].x).toBeGreaterThan(bank[7].x);
      expect(bank[0].y).toBe(bank[7].y);
    }
    expect(layout.slots[0][0].y).toBeLessThan(layout.slots[1][0].y);
  });

  it("places named A/B positions correctly when catalog sections arrive in reverse order", () => {
    const sections = ["B", "A"].map(bank => Array.from({ length: 8 }, (_, index) => `${bank}${8 - index}`));
    const layout = simModuleLayout({ ...host, attributes: { simSlotCount: 16, simSlotSections: sections } });
    const slots = layout.slots.flat();
    const a1 = slots.find(slot => slot.slotId === "A1")!;
    const a8 = slots.find(slot => slot.slotId === "A8")!;
    const b1 = slots.find(slot => slot.slotId === "B1")!;
    expect(a1.x).toBeGreaterThan(a8.x);
    expect(a1.y).toBeLessThan(b1.y);
    expect(slots.map(slot => slot.slotId)).toEqual(sections.flat());
  });

  it("retains custom and incomplete catalog slots instead of inventing or renaming positions", () => {
    const attributes = { simSlotCount: 16, simSlotSections: [["A1", "A2"], ["B1"]] };
    const layout = simModuleLayout({ ...host, attributes });
    expect(layout.profile).toBeUndefined();
    expect(layout.slots.flat().map(slot => slot.slotId)).toEqual(["A1", "A2", "B1"]);
    expect(simModuleLayout(undefined).slots).toEqual([]);
  });
});
