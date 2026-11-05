import { afterEach, describe, expect, it } from "vitest";
import type { RevisionDto } from "./api";
import { buildNextSectionName } from "./cable-canvas-ids";
import {
  buildSnapshotFromCanvas,
  buildUniqueWireSections,
  canvasDraftStorageKey,
  loadInitialCanvasDraft,
  normalizePathsWithWireDefaults,
  writeCanvasLocalDraft
} from "./cable-canvas-utils";

type Path = RevisionDto["snapshot"]["paths"][number];

function section(id: string, wireName?: string): Path {
  return { id, pathType: "cable", fromConnectorId: "c1", toConnectorId: "c2", wireName };
}

function snapshot(paths: Path[]): RevisionDto["snapshot"] {
  return {
    connectors: [],
    junctions: [],
    paths,
    pinMappings: [],
    bundles: [],
    annotations: []
  };
}

const revisionId = "section-name-migration";

afterEach(() => {
  window.localStorage.removeItem(canvasDraftStorageKey(revisionId));
});

describe("canvas section designations", () => {
  it("allocates new section names after both legacy and current designations", () => {
    expect(buildNextSectionName([])).toBe("section1");
    expect(
      buildNextSectionName([
        section("old", "cable4"),
        section("current", "section2"),
        section("custom", "cable99 power")
      ])
    ).toBe("section5");
    expect(buildNextSectionName([section("current", "section9"), section("old", "cable3")])).toBe("section10");
  });

  it("renames saved generated section names without changing custom names or wire runs", () => {
    const wire: Path = {
      ...section("wire", "cable9"),
      pathType: "wire",
      wirelistManaged: true,
      fromLocation: "J1 - 1",
      toLocation: "J2 - 1"
    };
    const paths = [
      section("old", "cable1"),
      section("current", "section4"),
      section("custom", "cable2 power"),
      section("custom-case", "Cable3"),
      wire
    ];

    const normalized = normalizePathsWithWireDefaults(paths);

    expect(normalized.map((path) => path.wireName)).toEqual([
      "section1", "section4", "cable2 power", "Cable3", "cable9"
    ]);
    expect(normalized.map((path) => path.id)).toEqual(paths.map((path) => path.id));
    expect(normalized.map((path) => path.pathType)).toEqual(["cable", "cable", "cable", "cable", "wire"]);
    expect(paths[0]?.wireName).toBe("cable1");
    expect(normalized.at(-1)).toMatchObject(wire);
    expect(normalizePathsWithWireDefaults(normalized)).toEqual(normalized);
  });

  it("assigns unnamed sections defaults without colliding with renamed or current sections", () => {
    const normalized = normalizePathsWithWireDefaults([
      section("old", "cable2"),
      section("unnamed"),
      section("current", "section3")
    ]);

    expect(normalized.map((path) => path.wireName)).toEqual(["section2", "section4", "section3"]);
    expect(buildUniqueWireSections([
      section("old", "cable2"),
      section("unnamed"),
      section("current", "section3")
    ]).map((path) => path.wireName)).toEqual(["section2", "section3", "section4"]);
  });

  it("disambiguates legacy names while preserving existing section and custom names", () => {
    const paths = [
      section("legacy", "cable1"),
      section("current", "section1"),
      section("other-legacy", "cable3"),
      section("custom", "cable1 power")
    ];
    const normalized = normalizePathsWithWireDefaults(paths);

    expect(normalized.map((path) => path.wireName)).toEqual(["section2", "section1", "section3", "cable1 power"]);
    expect(normalized.map((path) => path.id)).toEqual(paths.map((path) => path.id));
    expect(normalizePathsWithWireDefaults(normalized)).toEqual(normalized);

    const saved = buildSnapshotFromCanvas(snapshot(paths), {
      connectors: [], junctions: [], paths, positions: {}
    });
    expect(saved.paths.map((path) => path.wireName)).toEqual(normalized.map((path) => path.wireName));
  });

  it("uses section designations for server snapshots, recovered drafts, and Details summaries", () => {
    const baseline = snapshot([section("persisted-id", "cable7")]);
    const loaded = loadInitialCanvasDraft(revisionId, baseline);

    expect(loaded.paths[0]).toMatchObject({ id: "persisted-id", wireName: "section7" });
    expect(buildUniqueWireSections(baseline.paths)[0]).toMatchObject({
      pathId: "persisted-id",
      wireName: "section7"
    });

    writeCanvasLocalDraft(revisionId, {
      connectors: [],
      junctions: [],
      paths: [section("draft-id", "cable8")],
      positions: {},
      dirty: true
    });

    const recovered = loadInitialCanvasDraft(revisionId, baseline);
    expect(recovered.recoveredDirty).toBe(true);
    expect(recovered.paths[0]).toMatchObject({ id: "draft-id", wireName: "section8" });
  });

  it("persists renamed sections while preserving wirelist names, data, and path associations", () => {
    const cable = section("persisted-section-id", "cable5");
    const wire: Path = {
      ...section("wirelist-id", "cable12"),
      pathType: "wire",
      wirelistManaged: true,
      fromLocation: "J1 - A1",
      toLocation: "J2 - B1",
      notes: "Keep cable12 as entered"
    };
    const baseline = snapshot([cable, wire]);
    baseline.pinMappings = [{
      id: "mapping",
      pathId: wire.id,
      fromConnectorId: "c1",
      fromPinId: "A1",
      toConnectorId: "c2",
      toPinId: "B1",
      mappingType: "one_to_one"
    }];
    baseline.bundles = [{ id: "bundle", name: "Main", pathIds: [cable.id, wire.id] }];

    const saved = buildSnapshotFromCanvas(baseline, {
      connectors: [],
      junctions: [],
      paths: [cable],
      positions: {}
    });

    expect(saved.paths.find((path) => path.id === cable.id)).toMatchObject({
      id: cable.id,
      pathType: "cable",
      wireName: "section5"
    });
    expect(saved.paths.find((path) => path.id === wire.id)).toEqual(wire);
    expect(saved.pinMappings).toEqual(baseline.pinMappings);
    expect(saved.bundles).toEqual(baseline.bundles);
  });
});
