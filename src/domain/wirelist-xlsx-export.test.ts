import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { resolveWirelistTemplatePath } from "./wirelist-xlsx-export.js";

test("resolveWirelistTemplatePath finds the committed XLSX template", () => {
  const templatePath = resolveWirelistTemplatePath();
  assert.match(templatePath, /wirelist-template\.xlsx$/);
  assert.equal(existsSync(templatePath), true);
});
