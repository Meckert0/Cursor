import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasWirelistDetail,
  isCableSectionPath,
  isWireRunPath,
  partitionSnapshotPaths
} from "./path-roles.js";

describe("path-roles", () => {
  it("treats canvas cable sections separately from wirelist wire runs", () => {
    const cable = {
      id: "p-cable",
      pathType: "cable",
      fromConnectorId: "c1",
      toConnectorId: "j1"
    };
    const wire = {
      id: "p-wire",
      pathType: "wire",
      wirePartNumber: "PN-22",
      fromConnectorId: "c1",
      toConnectorId: "c2"
    };
    const legacyCanvas = {
      id: "p-legacy",
      pathType: "wire",
      fromConnectorId: "c1",
      toConnectorId: "c2"
    };

    assert.equal(isCableSectionPath(cable), true);
    assert.equal(isWireRunPath(wire), true);
    assert.equal(isCableSectionPath(legacyCanvas), true);
    assert.equal(hasWirelistDetail(wire), true);
  });

  it("treats stored Conn-Pin text as wirelist detail", () => {
    const locationOnly = {
      id: "p-loc",
      pathType: "wire",
      fromLocation: "J1 - ",
      toLocation: "J2 - 1"
    };
    assert.equal(hasWirelistDetail(locationOnly), true);
    assert.equal(isWireRunPath(locationOnly), true);
  });

  it("keeps wirelist-managed rows even when every cell is blank", () => {
    const emptyWirelistRow = {
      id: "p-empty",
      pathType: "wire",
      wirelistManaged: true
    };
    assert.equal(hasWirelistDetail(emptyWirelistRow), false);
    assert.equal(isWireRunPath(emptyWirelistRow), true);
  });

  it("partitions snapshot paths for canvas and wirelist consumers", () => {
    const paths = [
      { id: "p1", pathType: "cable" },
      { id: "p2", pathType: "wire", wireAwg: "22" },
      { id: "p3", pathType: "wire" }
    ];
    const partitioned = partitionSnapshotPaths(paths);
    assert.equal(partitioned.cablePaths.length, 2);
    assert.equal(partitioned.wireRunPaths.length, 1);
    assert.equal(partitioned.wireRunPaths[0]?.id, "p2");
  });
});
