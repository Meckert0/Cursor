import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore } from "../infra/store/memory-store.js";
import { isWirePart, type WireAttributes } from "./library.js";
import { buildWireDiameterCatalog, ensureWireDiameterCatalog } from "./wire-diameter-catalog.js";

function wireAttributes(item: { attributes: unknown }): WireAttributes {
  return item.attributes as WireAttributes;
}

test("wire diameter catalog keeps every supplied part number and TBD diameter", () => {
  const items = buildWireDiameterCatalog();
  const byPartNumber = new Map(items.map((item) => [item.partNumber, item]));

  assert.equal(items.length, 47);
  assert.equal(new Set(items.map((item) => item.partNumber.toLowerCase())).size, 47);

  const black22 = byPartNumber.get("038037");
  assert.ok(black22);
  assert.equal(black22.family, "Teflon");
  assert.equal(black22.description, "22 AWG Black (Teflon)");
  assert.equal(wireAttributes(black22).awg, "22");
  assert.equal(wireAttributes(black22).color, "Black");
  assert.equal(wireAttributes(black22).overallDia, 0.056);
  assert.equal(wireAttributes(black22).insulationMaterial, "Teflon");

  const white12 = byPartNumber.get("019910");
  assert.equal(white12?.partNumber, "019910");
  assert.equal(wireAttributes(white12!).overallDia, 0.159);
  assert.equal(wireAttributes(white12!).color, "White");

  const gauge8 = byPartNumber.get("270763");
  assert.equal(wireAttributes(gauge8!).overallDia, 0.26);
  assert.equal(wireAttributes(byPartNumber.get("270733")!).overallDia, 0.26);

  const coax = byPartNumber.get("TBD-RG-316");
  assert.equal(coax?.family, "Coax");
  assert.equal(coax?.description, "RG-316");
  assert.equal(wireAttributes(coax!).overallDia, 0.103);
  assert.match(coax?.notes ?? "", /TBD/);

  const twoAwg = byPartNumber.get("TBD-2-AWG");
  assert.equal(wireAttributes(twoAwg!).overallDia, 0.486);
  assert.equal(wireAttributes(twoAwg!).awg, "2");

  const twisted = byPartNumber.get("TBD-8-AWG-TP");
  assert.equal(twisted?.description, "8 AWG T/P");
  assert.equal(wireAttributes(twisted!).overallDia, 0.52);
  assert.equal(wireAttributes(twisted!).numberOfConductors, 2);

  const shielded = byPartNumber.get("TBD-26-AWG-STP");
  assert.equal(shielded?.description, "26 AWG ST/P");
  assert.equal(wireAttributes(shielded!).overallDia, 0.108);

  const tbd = items.filter((item) => item.partNumber.startsWith("TBD-"));
  assert.equal(tbd.length, 23);
  assert.ok(tbd.every((item) => item.notes?.includes("TBD")));
  assert.ok(
    items.every((item) => {
      const attributes = wireAttributes(item);
      return item.category === "wire" && attributes.awg.trim() && attributes.color.trim() && (attributes.overallDia ?? 0) > 0;
    })
  );
});

test("ensureWireDiameterCatalog inserts missing wires and does not clobber another diameter", async () => {
  const store = new MemoryStore();
  await store.ingestLibraryComponents({
    requestedByUserId: "editor",
    dryRun: false,
    items: [
      {
        id: "user-wire-22",
        category: "wire",
        family: "Shop",
        partNumber: "038037",
        description: "Existing 22 AWG",
        isActive: true,
        stockStatus: "in_stock",
        isReviewed: true,
        attributes: { awg: "22", color: "Black" }
      },
      {
        id: "user-wire-custom",
        category: "wire",
        family: "Shop",
        partNumber: "270763",
        description: "Existing 8 AWG with its own diameter",
        isActive: true,
        stockStatus: "in_stock",
        isReviewed: true,
        attributes: { awg: "8", color: "Black", overallDia: 0.3 }
      }
    ]
  });

  const first = await ensureWireDiameterCatalog(store);
  assert.equal(first.inserted, 45);
  assert.equal(first.updated, 1);
  assert.equal(first.skipped, 1);

  const wires = (await store.listLibraryComponents({
    requestingUserId: "editor",
    canViewAllUnreviewed: true,
    canViewInactive: true
  })).filter(isWirePart);
  const existing22 = wires.find((wire) => wire.id === "user-wire-22");
  const existing8 = wires.find((wire) => wire.id === "user-wire-custom");
  const coax = wires.find((wire) => wire.partNumber === "TBD-RG-178");
  assert.equal(existing22?.attributes.overallDia, 0.056);
  assert.equal(existing22?.description, "Existing 22 AWG");
  assert.equal(existing8?.attributes.overallDia, 0.3);
  assert.equal(coax?.attributes.overallDia, 0.075);
  assert.equal(wires.length, 47);

  const second = await ensureWireDiameterCatalog(store);
  assert.deepEqual(second, { inserted: 0, updated: 0, skipped: 47 });
});
