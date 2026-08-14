import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalog } from "./catalog.js";
import { buildModuleBackshellCompat, buildModuleStrainReliefCompat } from "./compat.js";
import type { CellValue } from "./normalize.js";
import { createContext, type CpqWorkbook, type SheetData } from "./types.js";

function makeSheet(name: string, rows: Array<Record<string, CellValue>>): SheetData {
  return { name, rows: rows.map((cells, index) => ({ row: index + 3, cells })) };
}

function makeWorkbook(sheets: Record<string, Array<Record<string, CellValue>>>): CpqWorkbook {
  const workbook: CpqWorkbook = new Map();
  for (const [name, rows] of Object.entries(sheets)) {
    workbook.set(name, makeSheet(name, rows));
  }
  return workbook;
}

function baseWorkbook(): CpqWorkbook {
  return makeWorkbook({
    Mx_WireReturnV2: [
      { A: 22, B: "RED", C: "TEFLON", D: "Single", E: "310", F: "269111", G: 1 },
      // Same PN with PP suffix: must merge, not duplicate.
      { A: 22, B: "RED", C: "TEFLON", D: "Single", E: "310", F: "269111PP", G: 1 },
      { A: 24, B: "BLU/WHT", C: "TEFLON", D: "Twisted Pair", E: "410", F: "269222", G: 2 },
      // Placeholder row.
      { A: 0, B: 0, C: 0, D: 0, E: "195", F: 0, G: 0 }
    ],
    "Mx.WireAttributes": [
      { A: "269111", B: 0.062, C: 0.051, D: 200, E: 1, F: "M16878/4", G: 6.7999999999999996e-3 },
      { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }
    ],
    "Mx.SmartPNWRE": [{ A: "310", B: 22, C: "RED", D: "TEFLON", E: "Single", F: 0.062, G: "269111", H: 1 }],
    Mx_WireTypes: [
      { A: "310", B: "Single" },
      { A: "410", B: "Twisted Pair" }
    ],
    "Mx.SmartPNCNT": [
      { A: "233", B: "TP", C: "ITA", D: "VPCCNTFAMILY", E: 0.0068, F: 0.985, G: "N", H: "610110172PP", I: 0, J: 30 },
      { A: "233", B: "TP", C: "ITA", D: "VPCCNTFAMILY", E: 0.0068, F: 0.985, G: "N", H: "610110172PP", I: 0, J: 30 },
      // Conflicting alias code: 900 maps to two different PNs -> no alias.
      { A: "900", B: "GMCT", C: "FML", D: "VENDORCONTACT", E: 0.0035, F: 0.514, G: "Y", H: "613623PP", I: 0, J: 0 },
      { A: "900", B: "GMCT", C: "FML", D: "VENDORCONTACT", E: 0.0035, F: 0.514, G: "Y", H: "613624PP", I: 0, J: 0 },
      { A: 0, B: "unplugged", C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0 }
    ],
    "Mx.ContactAttributes": [
      { A: "610110172PP", B: "TP", C: "ITA", D: "M22759", E: "233", F: 0.9 },
      { A: "610110172PP", B: "TP", C: "ITA", D: "M27500", E: "233", F: 0.9 }
    ],
    "Mx.ContactReturn": [
      { A: "9PinDBFemale", B: "FML", C: "9ConductorShielded", D: "233", E: "Multiple", F: 0, G: 0, H: null, I: "Signal_Crimp" }
    ],
    "Mx.ContactReturnVPC": [
      { A: "MyVendorConn", B: "ML", C: "RG178", D: 0, E: "544", F: "270404PP", G: 0, H: 0, I: 0, J: "Coax_Solder" }
    ],
    "Mx.Terminals": [
      { A: "FTERM", B: 6, C: "NA", D: 10, E: "540", F: "270404PP", G: 0.0098, H: 1.02 },
      { A: "FTERM", B: 6, C: "NA", D: 12, E: "540", F: "270404PP", G: 0.0098, H: 1.02 }
    ],
    Mx_TIHContacts: [
      { A: "610110172", B: true },
      { A: "610110172PP", B: true },
      { A: "999999", B: true }
    ],
    Mx_Module2: [
      { A: "VENDOR", B: null, C: null, D: "D38999/20FA35SN", E: null, F: null, G: null, H: "No", I: "289455PP", J: null, K: null, L: null, M: null, N: null },
      // VPC row with second contact group (F/G) and cover PN (K): flag for review.
      { A: "VPC", B: "90", C: "ITA", D: "TP", E: 16, F: "MC", G: 16, H: "No", I: "510108210PP", J: 1, K: "510109296PP", L: null, M: null, N: null },
      // Plain VPC row without F/G/K: auto-approved.
      { A: "VPC", B: "90", C: "ITA", D: "MC", E: 19, F: null, G: null, H: "No", I: "510108111PP", J: 1, K: null, L: null, M: null, N: null },
      // DSUB vendor module matched by ContactReturn "9PinDBFemale".
      { A: "VENDOR", B: "DSUB", C: "FML", D: "9 PIN NI 182238-02", E: 9, F: null, G: null, H: "No", I: "612565", J: null, K: null, L: null, M: null, N: null },
      // Exact vendor-name match target for "MyVendorConn".
      { A: "VENDOR", B: "SCSI", C: "ML", D: "MyVendorConn", E: 4, F: null, G: null, H: "No", I: "845000", J: null, K: null, L: null, M: null, N: null }
    ],
    "MX.CircularPinCount": [
      { A: "A35", B: 6, C: 6, J: "NO" },
      { A: "B2", B: 2, F: 2, J: "NO" }
    ],
    "Mx.PreTerm_Wire_AWGs": [
      { A: "DSUB FML 9 PIN NI 182238-02", B: 28, C: 9 },
      { A: "DSUB ML 999 PIN NOMATCH", B: 26, C: 999 }
    ],
    "Mx.zpc_VendorConnectorDSUB": [
      { A: "FML", B: "Shielded 26 AWG Foil", C: 15, D: 60, E: null, F: null, G: "260953" }
    ],
    "Mx.Backshell": [
      { A: "i1", B: "ITA", C: 1, D: "NO", E: "410128101IHU", F: "310113461", G: null, H: 6, I: 1.07 },
      { A: "i1", B: "RCV", C: 1, D: "NO", E: "310128101", F: "310113461", G: null, H: 0, I: 5 },
      { A: "i1", B: "RCV", C: 1, D: "YES", E: "310128101", F: "310113461", G: null, H: 0, I: 5 }
    ],
    "Mx.StrainRelief": [
      { A: "510104289", B: "510108210PP", C: "RCV", D: "Yes", E: 0.0418 },
      { A: "510109116", B: null, C: "RCV", D: "Yes", E: 0.0418 },
      { A: "510109116", B: null, C: "RCV", D: "Yes", E: 0.0418 }
    ],
    "Mx.Label": [
      { A: "Shrink", B: 10, C: "271903", D: 0.0073, E: 0.25, F: 0.093, G: null },
      { A: "Shrink", B: 14, C: "271903", D: 0.0073, E: 0.25, F: 0.093, G: null },
      { A: "Adhesive", B: null, C: "271860", D: 0.009, E: null, F: null, G: "90 Series" }
    ],
    "Mx.SleeveTubeBraid": [
      { A: 0.09, B: 0.19, C: "SLT", D: null, E: "875008PP", F: "875000", G: null },
      { A: 0.2, B: 0.31, C: "SLT", D: null, E: "875008PP", F: "875000", G: null },
      { A: 0.09, B: 0.13, C: "EXP", D: null, E: null, F: null, G: "875012PP" }
    ],
    "Mx.Splice": [
      { A: "D-181", B: 2, C: 22, D: 1, E: "ExampleSplice", F: "005570PP", G: "D-181-1222-90/9" },
      { A: "D-181", B: 2, C: 22, D: 2, E: "ExampleSplice", F: "005570PP", G: "D-181-1222-90/9" },
      { A: "M83519/2", B: 1, C: 20, D: 1, E: "ExampleSplice", F: "613887PP", G: "M83519/2-1" }
    ],
    "Mx.SolderSplice_PartNumber": [
      { A: 0, B: 450, C: null },
      { A: 451, B: 1250, C: "845678" }
    ],
    "Mx.Splice_CMA": [
      { A: 22, B: 754.11 },
      { A: 20, B: 1216 }
    ],
    "Mx.ContactWireCompatability": [
      { A: "310", B: "233", C: "ZZ", D: "Valid" },
      // Duplicate pair, same status -> merged.
      { A: "310", B: "233", C: "ZZ", D: "Valid" },
      // Conflicting status -> review.
      { A: "410", B: "233", C: "CA", D: "Valid" },
      { A: "410", B: "233", C: "CA", D: "NotValid" },
      // Unresolvable codes -> dropped and reported.
      { A: "777", B: "233", C: "ZZ", D: "Valid" },
      { A: "310", B: "888", C: "ZZ", D: "Valid" },
      // Conflicted contact code 900 cannot resolve.
      { A: "310", B: "900", C: "ZZ", D: "Valid" }
    ],
    "2D_Something": [{ A: "cad", B: "stuff" }],
    "Mx.TestingFixture": [{ A: "fixture" }]
  });
}

test("wires: PP merge, enrichment, float rounding, and aliases", () => {
  const build = buildCatalog(baseWorkbook());
  const wires = build.parts.filter((part) => part.category === "wire");
  assert.equal(wires.length, 2);
  const wire = wires.find((part) => part.partNumber === "269111");
  assert.ok(wire);
  assert.equal(wire?.id, "prt-wire-269111");
  assert.equal(wire?.family, "Single");
  assert.equal(wire?.attributes.awg, "22");
  assert.equal(wire?.attributes.color, "RED");
  assert.equal(wire?.attributes.overallDia, 0.062);
  assert.equal(wire?.attributes.milSpec, "M16878/4");
  assert.equal(wire?.attributes.weightPerFt, 0.0068);
  const twisted = wires.find((part) => part.partNumber === "269222");
  assert.equal(twisted?.family, "TwistedPair");
  assert.equal(twisted?.attributes.numberOfConductors, 2);
  const wireAliases = build.aliases.filter((alias) => alias.codeSystem === "wire_3digit");
  assert.deepEqual(
    wireAliases.map((alias) => alias.code).sort(),
    ["310", "410"]
  );
});

test("contacts: dedupe, accepted families, terminal AWG range, TIH, alias conflict", () => {
  const build = buildCatalog(baseWorkbook());
  const contacts = build.parts.filter((part) => part.category === "contact");
  assert.equal(contacts.length, 4); // 610110172, 613623, 613624, 270404
  const tp = contacts.find((part) => part.partNumber === "610110172");
  assert.ok(tp);
  assert.equal(tp?.attributes.genre, "VPC");
  assert.equal(tp?.attributes.gender, "ITA");
  assert.equal(tp?.attributes.ssCompatible, false);
  // ContactAttributes lengthAdded (0.9) wins over SmartPNCNT (0.985).
  assert.equal(tp?.attributes.lengthAdded, 0.9);
  assert.deepEqual(tp?.attributes.acceptedFamilies, ["M22759", "M27500"]);
  assert.equal(tp?.attributes.tih, true);
  const terminal = contacts.find((part) => part.partNumber === "270404");
  assert.equal(terminal?.attributes.studSize, "6");
  assert.equal(terminal?.attributes.acceptedAwgMin, 10);
  assert.equal(terminal?.attributes.acceptedAwgMax, 12);
  assert.equal(terminal?.attributes.awg, "10-12");
  assert.equal(terminal?.attributes.termType, "Coax_Solder");
  // Code 900 conflicts (two PNs) -> no alias; codes 233/540/544 resolve.
  const contactAliases = build.aliases.filter((alias) => alias.codeSystem === "contact_3digit");
  assert.deepEqual(contactAliases.map((alias) => alias.code).sort(), ["233", "540", "544"]);
  assert.ok(
    build.exceptions.some(
      (exception) => exception.kind === "alias-conflict" && exception.detail.includes("900")
    )
  );
  // Unknown TIH PN is reported, not created.
  assert.ok(!contacts.some((part) => part.partNumber === "999999"));
  assert.ok(build.exceptions.some((exception) => exception.sheet === "Mx_TIHContacts" && exception.kind === "unmatched-part-number"));
});

test("modules: family derivation, arrangement enrichment, F/G and cover flags, vendor alias", () => {
  const build = buildCatalog(baseWorkbook());
  const modules = build.parts.filter((part) => part.category === "module");
  assert.equal(modules.length, 6);
  const d38999 = modules.find((part) => part.partNumber === "289455");
  assert.ok(d38999);
  assert.equal(d38999?.family, "D38999");
  assert.equal(d38999?.attributes.insertArrangement, "A35");
  assert.equal(d38999?.attributes.pinCount, 6);
  assert.equal(d38999?.attributes.emi, false);
  assert.equal(d38999?.flaggedForReview, false);

  const flagged = modules.find((part) => part.partNumber === "510108210");
  assert.ok(flagged);
  assert.equal(flagged?.flaggedForReview, true);
  assert.ok(flagged?.description.includes("second contact group: MC x 16"));
  assert.ok(flagged?.description.includes("default protective cover PN 510109296PP"));
  assert.equal(flagged?.attributes.contactFamily1, "TP");
  assert.equal(flagged?.attributes.pinCount, 16);

  const plain = modules.find((part) => part.partNumber === "510108111");
  assert.equal(plain?.flaggedForReview, false);
  assert.equal(plain?.attributes.contactFamily1, "MC");

  // PreTerm enrichment matched the DSUB NI module.
  const dsub = modules.find((part) => part.partNumber === "612565");
  assert.ok(dsub?.description.includes("pre-terminated wire 28 AWG"));

  // zpc sheet created the pigtail module.
  const pigtail = modules.find((part) => part.partNumber === "260953");
  assert.equal(pigtail?.family, "DSUB");
  assert.equal(pigtail?.attributes.pinCount, 15);
  assert.ok(pigtail?.description.includes("pigtail: Shielded 26 AWG Foil, 60 in"));

  const vendorAliases = build.aliases.filter((alias) => alias.codeSystem === "vendor_pn");
  assert.deepEqual(vendorAliases.map((alias) => alias.code).sort(), ["D38999/20FA35SN"]);

  assert.deepEqual(build.reviewFlaggedPartIds, [flagged?.id]);
});

test("backshells: fitments, RCV length sentinel, keying reference unresolvable", () => {
  const build = buildCatalog(baseWorkbook());
  const backshells = build.parts.filter((part) => part.category === "backshell");
  assert.equal(backshells.length, 2);
  const ita = backshells.find((part) => part.partNumber === "410128101IHU");
  assert.equal(ita?.attributes.lengthAdded, 1.07);
  assert.equal((ita?.attributes.fitments as unknown[]).length, 1);
  const rcv = backshells.find((part) => part.partNumber === "310128101");
  assert.equal(rcv?.attributes.lengthAdded, undefined);
  assert.equal((rcv?.attributes.fitments as unknown[]).length, 2);
  assert.equal(rcv?.attributes.keyingPartId, undefined);
  assert.ok(
    build.exceptions.some(
      (exception) => exception.sheet === "Mx.Backshell" && exception.kind === "unresolvable-reference"
    )
  );
});

test("strain reliefs, labels, sleeves resolve references and ranges", () => {
  const build = buildCatalog(baseWorkbook());
  const strainReliefs = build.parts.filter((part) => part.category === "strain-relief");
  assert.equal(strainReliefs.length, 2);
  const withHint = strainReliefs.find((part) => part.partNumber === "510104289");
  assert.equal(withHint?.attributes.relatedModuleHintPartId, "prt-module-510108210");
  assert.equal(withHint?.attributes.requiresBackshell, true);

  const labels = build.parts.filter((part) => part.category === "label");
  assert.equal(labels.length, 2);
  const shrink = labels.find((part) => part.partNumber === "271903");
  assert.equal(shrink?.attributes.awgMin, 10);
  assert.equal(shrink?.attributes.awgMax, 14);
  assert.equal(shrink?.attributes.lengthIn, 0.25);

  const sleeves = build.parts.filter((part) => part.category === "sleeve-tube-braid");
  assert.equal(sleeves.length, 2);
  const slt = sleeves.find((part) => part.partNumber === "875008");
  const ranges = slt?.attributes.sizeRanges as Array<{ minDia: number; maxDia: number; relatedPartId?: string }>;
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].minDia, 0.09);
  assert.equal(ranges[0].relatedPartId, undefined);
  assert.ok(
    build.exceptions.some(
      (exception) => exception.sheet === "Mx.SleeveTubeBraid" && exception.kind === "unresolvable-reference"
    )
  );
});

test("splices: variant join, awg text, solder sleeve band, awg-cma reference", () => {
  const build = buildCatalog(baseWorkbook());
  const splices = build.parts.filter((part) => part.category === "splice");
  assert.equal(splices.length, 3);
  const d181 = splices.find((part) => part.partNumber === "005570");
  assert.equal(d181?.attributes.variant, "1,2");
  assert.equal(d181?.attributes.awg, "22");
  assert.equal(d181?.attributes.conductorCount, 2);
  assert.equal(d181?.attributes.manufacturerPn, "D-181-1222-90/9");
  const solder = splices.find((part) => part.partNumber === "845678");
  assert.equal(solder?.family, "SolderSleeve");
  assert.equal(solder?.attributes.cmaMin, 451);
  assert.equal(solder?.attributes.cmaMax, 1250);
  assert.deepEqual(build.awgCmaReference, [
    { awg: "20", cma: 1216 },
    { awg: "22", cma: 754.11 }
  ]);
});

test("contact-wire compat: resolution, dedupe, status conflict, unresolvable codes", () => {
  const build = buildCatalog(baseWorkbook());
  assert.equal(build.contactWireCompat.length, 2);
  const allowed = build.contactWireCompat.find((row) => row.wirePartId === "prt-wire-269111");
  assert.equal(allowed?.contactPartId, "prt-contact-610110172");
  assert.equal(allowed?.status, "allowed");
  assert.equal(allowed?.crimpClass, "ZZ");
  const conflicted = build.contactWireCompat.find((row) => row.wirePartId === "prt-wire-269222");
  assert.equal(conflicted?.status, "review");
  // Unresolved: wire code 777, contact code 888, conflicted contact code 900.
  assert.deepEqual(Array.from(build.unresolvedCompat.wireCodes.keys()), ["777"]);
  assert.deepEqual(Array.from(build.unresolvedCompat.contactCodes.keys()).sort(), ["888", "900"]);
});

test("module-contact compat: exact vendor-name match allowed, DSUB pattern review, unmatched reported", () => {
  const build = buildCatalog(baseWorkbook());
  const exact = build.moduleContactCompat.find((row) => row.modulePartId === "prt-module-845000");
  assert.ok(exact);
  assert.equal(exact?.status, "allowed");
  assert.equal(exact?.contactPartId, "prt-contact-270404");
  const pattern = build.moduleContactCompat.find((row) => row.modulePartId === "prt-module-612565");
  assert.ok(pattern);
  assert.equal(pattern?.status, "review");
  assert.equal(pattern?.contactPartId, "prt-contact-610110172");
});

test("reconciliation: every sheet balances", () => {
  const build = buildCatalog(baseWorkbook());
  for (const [sheet, stats] of build.sheetStats.entries()) {
    const total = Object.values(stats.outcomes).reduce((sum, count) => sum + count, 0);
    assert.equal(total, stats.dataRows, `sheet ${sheet} should balance (${total} vs ${stats.dataRows})`);
  }
  // Out-of-scope sheets are counted too.
  assert.equal(build.sheetStats.get("2D_Something")?.outcomes["skipped:out-of-scope"], 1);
  assert.equal(build.sheetStats.get("Mx.TestingFixture")?.outcomes["skipped:out-of-scope"], 1);
});

test("module-strain-relief compat: connector spreadsheet rows map to allowed pairs", () => {
  const workbook = makeWorkbook({
    "Connector-Strain Relief": [
      { A: "008408", B: "268158" },
      { A: "008408", B: "268158" },
      { A: "276707", B: "#N/A" },
      { A: 0, B: 0 }
    ]
  });
  const ctx = createContext();
  const build = buildModuleStrainReliefCompat(workbook, ctx, {
    modulePartIdByPn: new Map([["008408", "prt-module-008408"]]),
    strainReliefPartIdByPn: new Map([["268158", "prt-strain-relief-268158"]]),
    useDeterministicIds: true
  });
  assert.equal(build.rows.length, 1);
  assert.deepEqual(build.rows[0], {
    modulePartId: "prt-module-008408",
    strainReliefPartId: "prt-strain-relief-268158",
    status: "allowed",
    source: "connector-compat-import"
  });
  assert.equal(build.stubModules.length, 0);
  assert.equal(build.stubStrainReliefs.length, 0);
});

test("module-backshell compat: connector spreadsheet rows map to allowed pairs", () => {
  const workbook = makeWorkbook({
    "Connector-Backshell": [
      { A: "510160101", B: "310123101" },
      { A: "510160101", B: "310123101" },
      { A: 0, B: 0 }
    ]
  });
  const ctx = createContext();
  const build = buildModuleBackshellCompat(workbook, ctx, {
    modulePartIdByPn: new Map([["510160101", "prt-module-510160101"]]),
    backshellPartIdByPn: new Map([["310123101", "prt-backshell-310123101"]]),
    useDeterministicIds: true
  });
  assert.equal(build.rows.length, 1);
  assert.deepEqual(build.rows[0], {
    modulePartId: "prt-module-510160101",
    backshellPartId: "prt-backshell-310123101",
    status: "allowed",
    source: "connector-compat-import"
  });
});
