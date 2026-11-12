import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PAGE_HEADERS, PAGE_KEYS, formatPageHeaderText, mergeUiCopySettings, resolveUiCopySettings } from "./ui-settings.js";

test("page headers preserve legacy descriptions and support independent partial edits", () => {
  const initial = resolveUiCopySettings({ projectsHeaderDescription: "Existing projects copy", harnessHeaderDescription: "Existing canvas copy" });
  assert.equal(initial.pageHeaders.projects.description, "Existing projects copy");
  assert.equal(initial.pageHeaders.project.description, "Existing projects copy");
  assert.equal(initial.pageHeaders.canvas.description, "Existing canvas copy");
  assert.equal(Object.keys(initial.pageHeaders).length, PAGE_KEYS.length);
  const renamed = mergeUiCopySettings(initial, { pageHeaders: { projects: { title: " Shared projects " }, library: { description: "" } } });
  assert.equal(renamed.pageHeaders.projects.title, "Shared projects");
  assert.equal(renamed.pageHeaders.projects.description, "Existing projects copy");
  assert.equal(renamed.pageHeaders.library.description, "");
  assert.deepEqual(renamed.pageHeaders.canvas, initial.pageHeaders.canvas);
  const updated = mergeUiCopySettings(renamed, { projectsHeaderDescription: "Old API update", pageHeaders: { project: { description: "Independent project copy" } } });
  assert.equal(updated.pageHeaders.projects.description, "Old API update");
  assert.equal(updated.pageHeaders.project.description, "Independent project copy");
  assert.equal(updated.projectsHeaderDescription, "Old API update");
  assert.equal(initial.pageHeaders.projects.title, DEFAULT_PAGE_HEADERS.projects.title);
  assert.equal(resolveUiCopySettings({ projectsHeaderDescription: "Legacy", pageHeaders: { projects: { title: undefined, description: undefined } } }).pageHeaders.projects.description, "Legacy");
});

test("page header fields substitute record data once and leave unknown fields literal", () => {
  assert.equal(formatPageHeaderText("Harness {harnessName}: {revisionNumber}", { harnessName: "J1 {revisionNumber}", revisionNumber: 3 }), "Harness J1 {revisionNumber}: 3");
  assert.equal(formatPageHeaderText("Part {partNumber} {unknown} {toString}", { partNumber: "510160101" }), "Part 510160101 {unknown} {toString}");
});
