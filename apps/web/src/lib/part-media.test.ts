import { describe, expect, it } from "vitest";
import type { LibraryComponentDto, PartMediaDto } from "./api";
import { cableExitFacesLeft, isISeriesModule, sideProfileExitPoint, sideProfilesByPart, standaloneSideProfile } from "./part-media";
import { sideProfileScale } from "../../../../src/domain/part-side-profiles";

const part = (id: string, family: string, extra: Partial<LibraryComponentDto> = {}) => ({ id, partNumber: id, category: "module", partType: "MODULE", family, ...extra }) as LibraryComponentDto;
const image: PartMediaDto = { id: "source", partId: "source", url: "/part-media/vpc-side-profiles/v2/510161101.png", viewType: "side_profile", orientation: "cable_exit_right", mimeType: "image/png", pixelWidth: 100, pixelHeight: 200, sortOrder: 0, isPrimary: true };

describe("standalone module side profiles", () => {
  it("keeps iCon size while slightly shrinking i1, standalone modules, and their compatible strain reliefs", () => {
    const icon = part("icon", "iCon", { category: "frame" });
    const i1 = part("i1", "i1 EMI", { category: "frame" });
    const standaloneModule = part("module", "iCon/i1");
    const relief = part("relief", "iSeries", { category: "strain-relief" });
    for (const family of ["iCon", "iCon EMI", "iCon Reverse", "iCon XL"]) expect(sideProfileScale({ ...icon, family })).toBe(1);
    for (const family of ["i1", "i1 EMI", "i1 XL"]) expect(sideProfileScale({ ...i1, family })).toBe(0.729);
    expect(sideProfileScale(standaloneModule)).toBe(0.729);
    expect(sideProfileScale(relief, i1)).toBe(0.729);
    expect(sideProfileScale(relief, standaloneModule)).toBe(0.729);
    expect(sideProfileScale(relief, icon)).toBe(1);
    expect(sideProfileScale(relief)).toBe(1);
    expect(sideProfileScale(part("other", "90 Series"))).toBe(1);
  });
  it("shares 510161101 for iSeries modules while preserving frame and exact views", () => {
    const source = part("source", "iCon/i1", { partNumber: "510161101" });
    const target = part("target", "iSeries");
    const frame = part("frame", "iCon", { category: "frame" });
    const profiles = sideProfilesByPart([image], new Set());
    expect(standaloneSideProfile(target, profiles, [source, target], false)).toEqual(image);
    expect(standaloneSideProfile(target, profiles, [source, target], true)).toBeUndefined();
    expect(standaloneSideProfile(frame, profiles, [source, frame], true)).toBeUndefined();
    const exact = { ...image, id: "exact", partId: target.id };
    const withExact = sideProfilesByPart([image, exact], new Set());
    expect(standaloneSideProfile(target, withExact, [source, target], false)).toEqual(exact);
    expect(standaloneSideProfile(target, profiles, [source, { ...source, id: "duplicate" }], false)).toBeUndefined();
  });

  it("excludes other series and SIM inserts from the shared housing", () => {
    for (const family of ["iSeries", "iCon/i1", "i1 XL", "i2 MX", "i2 Micro iCon"]) expect(isISeriesModule(part("p", family))).toBe(true);
    for (const family of ["90 Series", "SIM", "D38999", "Series 90"]) expect(isISeriesModule(part("p", family))).toBe(false);
    expect(isISeriesModule(part("p", "iCon", { partType: "SIM_INSERT" }))).toBe(false);
    expect(isISeriesModule(part("p", "iCon", { category: "frame" }))).toBe(false);
  });
});

describe("horizontal cable exit geometry", () => {
  const centers = new Map([["part", { x: 100, y: 100 }], ["left", { x: 0, y: 0 }], ["right", { x: 200, y: 250 }], ["below", { x: 100, y: 300 }]]);
  it("mirrors only left/right, including steep cables and vertical/no-cable defaults", () => {
    const path = (to: string) => [{ id: "section", fromConnectorId: "part", toConnectorId: to }];
    expect(cableExitFacesLeft("part", centers, path("left"))).toBe(true);
    expect(cableExitFacesLeft("part", centers, path("right"))).toBe(false);
    expect(cableExitFacesLeft("part", centers, path("below"))).toBe(false);
    expect(cableExitFacesLeft("part", centers, [])).toBe(false);
    expect(cableExitFacesLeft("part", centers, [{ id: "b", fromConnectorId: "part", toConnectorId: "right" }, { id: "a", fromConnectorId: "left", toConnectorId: "part" }])).toBe(true);
  });
  it("mirrors the exit point inside the actual contained image, without moving its height", () => {
    expect(sideProfileExitPoint(image, 120, 120, false)).toEqual({ x: 86.4, y: 60 });
    const left = sideProfileExitPoint(image, 120, 120, true);
    expect(left.x).toBeCloseTo(33.6);
    expect(left.y).toBe(60);
    expect(sideProfileExitPoint({ ...image, orientation: undefined }, 120, 120, false)).toEqual({ x: 60, y: 60 });
    const horizontal = { ...image, url: "/part-media/vpc-side-profiles/v2/410123101.png", pixelWidth: 200, pixelHeight: 100 };
    const rightExit = sideProfileExitPoint(horizontal, 120, 120, false);
    expect(rightExit.x).toBeCloseTo(115.2);
    expect(rightExit.y).toBeCloseTo(44.4);
  });
});
