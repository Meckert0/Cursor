import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DesignSnapshot } from "./types.js";
import { validateSnapshot } from "./validator.js";

async function loadFixture(fileName: string): Promise<DesignSnapshot> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(currentDir, "fixtures", fileName);
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as DesignSnapshot;
}

test("known-good fixture returns zero errors and warnings", async () => {
  const snapshot = await loadFixture("known-good.basic.json");
  const report = validateSnapshot(snapshot);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.results.length, 0);
});

test("known-bad fixture returns expected validation rule hits", async () => {
  const snapshot = await loadFixture("known-bad.multiple-errors.json");
  const report = validateSnapshot(snapshot);
  const codes = new Set(report.results.map((result) => result.code));

  assert.ok(codes.has("RULE_PATH_CONNECTOR_NOT_FOUND"));
  assert.ok(codes.has("RULE_PIN_MAPPING_DEST_PIN_NOT_FOUND"));
  assert.ok(codes.has("RULE_PIN_MAPPING_INCOMPLETE"));
  assert.ok(codes.has("RULE_PIN_MAPPING_INVALID_PATH"));
  assert.ok(codes.has("RULE_PIN_MAPPING_DUPLICATE_SOURCE"));
  assert.ok(codes.has("RULE_PIN_MAPPING_ENDPOINT_MISMATCH"));
  assert.ok(codes.has("RULE_BUNDLE_PATH_NOT_FOUND"));
  assert.ok(codes.has("RULE_CONNECTOR_ORPHANED"));
});
