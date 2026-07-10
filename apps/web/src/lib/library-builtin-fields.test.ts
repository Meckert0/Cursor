import { describe, expect, it } from "vitest";
import { mergeFieldDefinitionsWithBuiltinDefaults } from "./library-builtin-fields";

describe("library builtin fields", () => {
  it("adds audit and review system fields for minimal categories", () => {
    const merged = mergeFieldDefinitionsWithBuiltinDefaults("contact", [
      {
        id: "fld-contact-partnumber",
        category: "contact",
        key: "partNumber",
        label: "Part number",
        valueType: "text",
        isSystem: true,
        isVisibleInViewer: true,
        showOnAddForm: true,
        showInSearch: true,
        createdByUserId: "system-user",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z"
      }
    ]);

    expect(merged.map((definition) => definition.key)).toEqual(
      expect.arrayContaining([
        "createdByUserId",
        "createdAt",
        "isReviewed",
        "reviewedByUserId",
        "reviewedAt",
        "lastEditedByUserId",
        "lastEditedAt"
      ])
    );
  });
});
