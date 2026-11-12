import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { makePart } from "./part-test-helpers.js";
import { planSideProfileImport, type SideProfileManifest } from "./side-profile-import.js";
import { inspectTransparentPng } from "./transparent-png.js";

const manifest: SideProfileManifest = { source: "Book1.pdf", images: [{ partNumber: "510161101", fileName: "510161101.png", pixelWidth: 251, pixelHeight: 493, page: 10 }] };
const part = makePart({ id: "module", category: "module", family: "iSeries", partNumber: "510161101", description: "QuadraPaddle" });

test("side-profile import matches exact catalog identities and is idempotent", () => {
  const plan = planSideProfileImport(manifest, [part], []);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].partId, "module");
  assert.equal(plan.updates[0].isPrimary, true);
  assert.equal(plan.updates[0].url, "/part-media/vpc-side-profiles/510161101.png");
  const existing = { ...plan.updates[0], id: plan.updates[0].id!, sortOrder: 0, isPrimary: true };
  assert.deepEqual(planSideProfileImport(manifest, [part], [existing]).unchanged, ["510161101"]);
  assert.equal(planSideProfileImport(manifest, [{ ...part, id: "new-id" }], []).updates[0].partId, "new-id", "Stable catalog ID is resolved anew for the target database");
  assert.equal(planSideProfileImport(manifest, [part], [], { baseUrl: "https://app.example.com" }).updates[0].url, "https://app.example.com/part-media/vpc-side-profiles/510161101.png");
  assert.throws(() => planSideProfileImport(manifest, [part], [], { baseUrl: "https://app.example.com/other/" }), /base URL/);
});

test("side-profile import skips absent, ambiguous and conflicting catalog parts", () => {
  for (const parts of [[], [{ ...part, partNumber: "510161102" }], [part, { ...part, id: "duplicate" }], [{ ...part, extraAttributes: { manufacturer: "Other Supplier" } }], [makePart({ ...part, category: "contact", attributes: { acceptedFamilies: [] } })]]) {
    const plan = planSideProfileImport(manifest, parts, []);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.skipped.length, 1);
  }
  assert.throws(() => planSideProfileImport({ ...manifest, images: [manifest.images[0], manifest.images[0]] }, [part], []), /Duplicate/);
});

test("v2 opaque profiles share the approved module view without assigning it to frames or inserts", () => {
  const v2: SideProfileManifest = { ...manifest, assetBasePath: "/part-media/vpc-side-profiles/v2", images: [{ ...manifest.images[0], orientation: "cable_exit_right", sharedWith: "standalone_iseries_modules" }] };
  const other = makePart({ id: "other", partNumber: "510161108", category: "module", family: "iCon/i1", description: "Other module" });
  const frame = makePart({ id: "frame", partNumber: "410123101", category: "frame", family: "iCon", description: "Frame" });
  const insert = makePart({ id: "insert", partNumber: "510181101", category: "module", family: "iCon", partType: "SIM_INSERT", description: "SIM insert" });
  const plan = planSideProfileImport(v2, [part, other, frame, insert], []);
  assert.deepEqual(plan.updates.map(row => row.partId), ["module", "other"]);
  assert.equal(plan.updates[1].url, "/part-media/vpc-side-profiles/v2/510161101.png");
  assert.equal(plan.updates[1].orientation, "cable_exit_right");
  assert.match(plan.updates[1].caption!, /shared 510161101.*standalone/i);
  const saved = plan.updates.map(row => ({ ...row, id: row.id!, isPrimary: true, sortOrder: 0 }));
  assert.equal(planSideProfileImport(v2, [part, other], saved).updates.length, 0);
});

function png(alpha: number[]) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(alpha.length, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const pixels = Buffer.from([0, ...alpha.flatMap(value => [12, 34, 56, value])]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

test("PNG preflight requires real transparency and visible part pixels", () => {
  assert.deepEqual(inspectTransparentPng(png([0, 128, 255])), { pixelWidth: 3, pixelHeight: 1 });
  assert.throws(() => inspectTransparentPng(png([255, 255])), /transparent background/);
  assert.throws(() => inspectTransparentPng(png([0, 0])), /visible part/);
  assert.throws(() => inspectTransparentPng(Buffer.from("not an image")), /not a PNG/);
  assert.throws(() => inspectTransparentPng(png([0, 128, 255]), { opaqueBodyPoint: { x: 0.5, y: 0.5 } }), /fully opaque/);
  assert.deepEqual(inspectTransparentPng(png([0, 255, 0]), { opaqueBodyPoint: { x: 0.5, y: 0.5 } }), { pixelWidth: 3, pixelHeight: 1 });
});
