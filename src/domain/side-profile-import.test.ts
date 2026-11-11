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
});
