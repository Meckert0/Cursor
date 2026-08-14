import assert from "node:assert/strict";
import test from "node:test";
import {
  boolOrUndefined,
  cleanText,
  compactName,
  intOrUndefined,
  normalizeGender,
  normalizePartNumber,
  normalizeWireType,
  numberOrUndefined,
  roundNumber,
  textOrUndefined
} from "./normalize.js";
import { makePartId } from "./part-id.js";

test("cleanText trims, collapses whitespace, and drops sentinel text", () => {
  assert.equal(cleanText("  ML  "), "ML");
  assert.equal(cleanText("Twisted   Pair"), "Twisted Pair");
  assert.equal(cleanText(""), undefined);
  assert.equal(cleanText(null), undefined);
  assert.equal(cleanText("NotFound"), undefined);
  assert.equal(cleanText("notavailable"), undefined);
  assert.equal(cleanText("NA"), undefined);
  assert.equal(cleanText("Multiple"), undefined);
  assert.equal(cleanText("Unknown"), undefined);
  assert.equal(cleanText("Default Value"), undefined);
  assert.equal(cleanText(42), "42");
  assert.equal(cleanText("0"), "0");
});

test("textOrUndefined also treats zero as no-data", () => {
  assert.equal(textOrUndefined(0), undefined);
  assert.equal(textOrUndefined("0"), undefined);
  assert.equal(textOrUndefined("TP"), "TP");
});

test("numberOrUndefined handles sentinels, zero option, and float noise", () => {
  assert.equal(numberOrUndefined(-1), undefined);
  assert.equal(numberOrUndefined(999), undefined);
  assert.equal(numberOrUndefined("NotFound"), undefined);
  assert.equal(numberOrUndefined("abc"), undefined);
  assert.equal(numberOrUndefined(0), 0);
  assert.equal(numberOrUndefined(0, { zeroIsNull: true }), undefined);
  assert.equal(numberOrUndefined(6.7999999999999996e-3), 0.0068);
  assert.equal(numberOrUndefined("0.242"), 0.242);
  assert.equal(numberOrUndefined(0.00042), 0.00042);
});

test("roundNumber keeps six significant digits and strips representation noise", () => {
  assert.equal(roundNumber(6.7999999999999996e-3), 0.0068);
  assert.equal(roundNumber(1.0699999999999998), 1.07);
  assert.equal(roundNumber(0.00042), 0.00042);
  assert.equal(roundNumber(9353.97), 9353.97);
  assert.equal(roundNumber(0), 0);
});

test("intOrUndefined rejects non-integers", () => {
  assert.equal(intOrUndefined(15), 15);
  assert.equal(intOrUndefined("77"), 77);
  assert.equal(intOrUndefined(1.5), undefined);
  assert.equal(intOrUndefined(0, { zeroIsNull: true }), undefined);
});

test("boolOrUndefined coerces Y/N variants and passes booleans through", () => {
  assert.equal(boolOrUndefined("Y"), true);
  assert.equal(boolOrUndefined("yes"), true);
  assert.equal(boolOrUndefined("N"), false);
  assert.equal(boolOrUndefined("No"), false);
  assert.equal(boolOrUndefined(true), true);
  assert.equal(boolOrUndefined(false), false);
  assert.equal(boolOrUndefined("maybe"), undefined);
  assert.equal(boolOrUndefined(null), undefined);
});

test("normalizePartNumber uppercases and strips the trailing PP packaging suffix", () => {
  assert.equal(normalizePartNumber("270546PP"), "270546");
  assert.equal(normalizePartNumber("270546"), "270546");
  assert.equal(normalizePartNumber(" 610143101pps "), "610143101PPS");
  assert.equal(normalizePartNumber("610143101PPS"), "610143101PPS");
  assert.equal(normalizePartNumber(269272), "269272");
  assert.equal(normalizePartNumber(0), undefined);
  assert.equal(normalizePartNumber("NotFound"), undefined);
  assert.equal(normalizePartNumber("PP"), "PP");
});

test("normalizeGender fixes drift", () => {
  assert.equal(normalizeGender("ML "), "ML");
  assert.equal(normalizeGender("ML(PIN)"), "ML");
  assert.equal(normalizeGender("fml"), "FML");
  assert.equal(normalizeGender("FML/ML"), "FML/ML");
  assert.equal(normalizeGender(0), undefined);
});

test("normalizeWireType removes internal spaces", () => {
  assert.equal(normalizeWireType("Twisted Pair"), "TwistedPair");
  assert.equal(normalizeWireType("TwistedPair"), "TwistedPair");
  assert.equal(normalizeWireType("Single"), "Single");
});

test("compactName lowercases and strips non-alphanumerics", () => {
  assert.equal(compactName("15PinDBFemale"), "15pindbfemale");
  assert.equal(compactName("15 PIN"), "15pin");
  assert.equal(compactName("  "), undefined);
});

test("makePartId is deterministic and slug-safe", () => {
  assert.equal(makePartId("contact", "610110172"), "prt-contact-610110172");
  assert.equal(makePartId("wire", "M27500-24ML1T08"), "prt-wire-m27500-24ml1t08");
  assert.equal(makePartId("module", "D38999/20FA35SN"), "prt-module-d38999-20fa35sn");
  assert.throws(() => makePartId("contact", "///"));
});
