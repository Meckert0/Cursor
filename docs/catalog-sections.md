# Catalog sections

The catalog has three sections in one database: Items, Compatibility, and Images and Files. Automatic label selection is deferred; no selection-rule engine or inferred manufacturer approvals are introduced.

## Items

`parts` remains the common identity/lifecycle/audit record, with one typed detail record per category. Existing categories and IDs are retained. A category is immutable for an existing ID; create a new identity when introducing a different kind of part. Part numbers are text, including leading zeros. Add more items through the existing editors/imports. Adding a new category involves its detail table, domain/API schema and editor metadata; compatibility and media continue referencing the common part ID.

Wire `awg` is optional and represents actual conductor gauge. `cableDesignation` holds codes such as RG-316; `construction` distinguishes single wire, twisted pair, shielded pair and coax. `insulatedConductorDiaIn` describes an individual insulated conductor; existing `overallDia` describes the complete purchased wire/cable. These are distinct from bare `conductorDia`. Confirm source units when importing; the new diameter and printable-dimension fields explicitly use inches. Catalog-owned `TBD-*` diameter references have `partType = WIRE_REFERENCE` and remain available for design planning.

Contacts retain exact `acceptedGauges` lists, media/interface and accepted families. Numeric min/max fields remain supported for actual continuous ranges. Exact lists take precedence over the legacy envelope. Optional `acceptedInsulationDiaMinIn`/`acceptedInsulationDiaMaxIn` describe insulated-conductor fit; a cable's overall diameter is not substituted for an unknown individual-conductor diameter.

Labels keep their existing part number, series, AWG import fields, length and nominal diameter. Added fields:

| API field | SQL field | Meaning |
| --- | --- | --- |
| `labelStyle`, `material` | `label_style`, `material` | Construction and material |
| `fitDiameterMinIn`, `fitDiameterMaxIn` | `fit_diameter_min_in`, `fit_diameter_max_in` | Supported target outside-diameter range |
| `printableWidthIn`, `printableHeightIn` | `printable_width_in`, `printable_height_in` | Usable print area |
| `maxCharactersPerLine`, `maxLines` | `max_characters_per_line`, `max_lines` | Optional positive integer allowances |
| `printProfile` | `print_profile` | Font/print settings under which allowances apply |
| `textAllowanceNotes` | `text_allowance_notes` | Exceptions and descriptive allowance information |

Unknown values remain null/absent. Subsequent source imports preserve previously stored attributes that the incoming source does not supply. Zero and reversed ranges are rejected. Existing `diaIn` is preserved as nominal diameter; migration does not invent fit limits from it. Optional fields can be cleared with JSON null through the edit API. Actual label text remains on the design path. Paths can additionally carry `labelComponentId`; BOM/validation resolve it before the display part number, and wirelist saves retain it until the label selection changes.

## Compatibility

`compatibility_groups` is the authoritative rule header: parent part ID, relationship type, position type and position IDs, status, exhaustive-list flag, source, source status and notes. Empty position scope means all positions. Source position ordering is preserved. `compatibility_targets` has one FK-backed target part ID per group/member. Part numbers are hydrated for display/import; renaming a part does not break its relationships. `compatibility_unresolved_targets` retains unresolved/ambiguous legacy part-number tokens for correction.

The existing `/v1/library/relationships` routes manage groups. Inputs accept `targetPartIds`, or the prior `compatibleParts` list which is resolved by relationship category. Unresolved, ambiguous, wrong-category, self-referencing, and invalid known-position inputs are rejected. Bulk writes validate all rows and commit atomically. Referenced targets should be archived; hard deletion is refused until compatibility references are removed.

The four original `/v1/library/compat/*` APIs remain shortcuts over the same groups. They do not write independent pair tables. Imported VPC scoped contact rules remain authoritative; their derived unscoped aggregates are not copied into the new catalog as additional approvals. New VPC workbook imports write canonical groups directly and replace only their own source feed. Legacy groups retain the `legacy-catalog` source until explicitly reviewed/assigned; they are not silently discarded by a re-import.

The shared evaluator in `src/domain/compatibility-rules.ts` supplies frame/SIM filtering, wirelist verification and backend module/contact checks:

1. Matching explicit prohibition wins.
2. Matching review status requires review.
3. Matching allowance permits the relationship at that position.
4. Missing evidence remains unknown unless an exhaustive allowlist excludes the target. Frames and SIM slots still require positive allowance.

Relationships are directional and never inferred transitively. Known relationship types validate parent/target categories in application code and SQL triggers. New types can use the same group/member storage; add definitions and consumers when their semantics become available. Dimensional contact-wire profile checks remain distinct from explicit part approvals.

## Images and Files

`part_media` stores associations and metadata; file bytes remain in hosted file/object storage. Admins add an existing hosted file URL, optional stable storage reference, view type, direction, caption/alt text, dimensions, source/revision and display order. The initial UI supports side profiles, mating faces, wire-entry views, drawings and datasheets; view types remain extensible. This release links hosted files; uploading file bytes to a provider is a separate storage capability.

Multiple files and orientations are allowed per item. Setting a primary file replaces the prior primary only for that item/view/direction. Viewing direction should explicitly distinguish looking into the mating face from the wire-entry side. Images illustrate parts; structured pin/slot definitions remain authoritative.

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET /v1/library/media?partId=...` | Admin | List catalog media |
| `PUT /v1/library/media` | Admin | Add/update a media association |
| `DELETE /v1/library/media?id=...&partId=...` | Admin | Remove an association |
| `GET /v1/library/components/:id/media` | Signed-in user with access to the item | Read item media |

Media URLs must be HTTP(S), without embedded credentials. Draft/inactive visibility follows the item-access rules. Metadata edits cannot move an existing media ID onto another item. Removing a reference does not delete the externally hosted file. Library detail pages show attributes, compatibility and images together; the admin item editor also shows related compatibility/media beside its editable facts.

## Migration and deployment

1. Back up the existing database or create an isolated branch/copy. Use the project's normal migration process and a direct PostgreSQL connection.
2. Run `npm run migrate` with the target database configuration before deploying the updated API. Migration `032_catalog_sections.sql` is required for the new runtime.
3. Review `compatibility_unresolved_targets` and the admin group's “Needs resolution” display. Correct missing or ambiguous targets explicitly.
4. Deploy backend and frontend together, then check a frame/SIM selection, a label edit, and a hosted image association.

Migration 032 is additive: it preserves parts/designs/IDs, nominal label measurements and original compatibility tables. The old `part_relationships` and four pair tables become frozen pre-migration snapshots, not current data sources. Do not replay earlier destructive migrations or re-import the catalog as a substitute for migration. Before reverting to an old runtime, account for post-migration catalog changes; old snapshots do not contain new edits.

SQLite upgrades existing JSON state on load, resolves legacy relationship members to IDs, preserves unresolved tokens, and persists canonical groups/media on subsequent writes. Memory uses the same domain representation. No production database migration is performed by the test suite: migration/data-preservation checks use an isolated embedded PostgreSQL instance, and SQLite checks use temporary files.
