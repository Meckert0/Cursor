# Catalog sections

The catalog has three sections in one database: Items, Compatibility, and Images and Files. Automatic label selection is deferred; no selection-rule engine or inferred manufacturer approvals are introduced.

The admin console uses the full page width. Its Database section groups Item Database Viewer, Compatibility & Aliases, and Images and Files in three equal tabs across the top. The selected tab is retained in the `databaseTab` URL parameter, and switching tabs keeps unsaved form entries. Right-click the name of a major section or Database tab and choose **Rename** to edit that heading individually. Keyboard users can focus its section summary or tab and press **Shift+F10** or the context-menu key. Escape or an outside click dismisses the menu; the rename dialog supports Cancel and Escape. There is no standalone rename button. Names are shared across admins, saved in the existing `app_settings` records (`ui.adminSectionTitles.*`), and default when absent. No additional database migration is required. The existing page-description API accepts partial `adminSectionTitles` updates; only admins can save names, with 1–80 characters per name.

One search bar above the three tabs provides text search and a Family dropdown. Applying a search filters items, all compatibility tables/aliases, and images/files together; each tab opens with those results already selected. The query, family, and selected tab survive reloads in the URL. Compatibility shows matching targets and retains parent-only context when the target category has no item matches. This prevents a hybrid module's broad description from pulling unrelated Mini/Micro contact groups into a QuadraPaddle search. Searching a parent's part number shows its complete compatibility context. Filtered mixed groups indicate how many compatible parts are displayed. Editing always receives the full target list, positions and metadata. Item selectors in create/edit forms still use the complete catalog. Family choices also come from the complete catalog. Use **Clear search** to restore all results while staying in the same tab.

Typing or changing Family filters all three tabs immediately using one shared search state, including tabs that are currently hidden. Tab switches preserve the same query without another search request. The compatibility and image tabs open with results; add/edit fields are tucked behind explicitly labeled record editors so they cannot be confused with separate search controls. There are no search bars inside the three tab panels.

Each item category expands and collapses independently from its heading, which shows its item count. Categories start collapsed; an active search expands the matching categories. The compatibility view always retains Compatibility groups. Pair tables and Aliases appear only when they contain matching records, with an empty selected tab falling back to Compatibility groups. This changes which sections are displayed, without removing catalog data.

## Page titles and descriptions

Admins can right-click a page title or its description to open the page-header editor. Shift+F10 or the context-menu key opens the same popup when the title or description has keyboard focus. Changes are shared with all users when they open or reload that page. Titles accept 1–120 characters; descriptions accept up to 600 characters and may be cleared. Cancel and Escape discard unsaved edits. Failed saves preserve the draft.

Every page uses this editor, including the library, item details, revision workspace, admin pages, and sign-in and registration pages. Signed-in admins can visit `/login` and `/register` to edit their headers; signed-out visitors see the saved text without editing controls. Record fields such as `{harnessName}`, `{partNumber}`, and `{revisionNumber}` retain each record's information; the editor lists the fields available on that page.

The former Global Page Descriptions panel is removed. Existing projects and canvas descriptions are retained as defaults for their corresponding page headers. Page copy uses the existing `app_settings` table under `ui.pageHeaders.<pageKey>.<title|description>`, without a new migration. The page-header write API and server action both require an admin account. Anonymous reads expose only the sign-in and registration headers. Section-name editing in the admin console remains available independently.

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

Admin compatibility tables show descriptions beside parent and target part numbers, including pair tables and aliases. Consecutive positions display as ranges (for example `1–160` or `A1–D40`); gaps remain separate ranges and an empty scope displays **All positions**. This formatting is a display projection. Stored position arrays, their source ordering, editor values, API payloads, compatibility validation, BOM/export jobs and import processes retain exact individual position IDs. No schema or background-process change is needed.

The existing `/v1/library/relationships` routes manage groups. Inputs accept `targetPartIds`, or the prior `compatibleParts` list which is resolved by relationship category. Unresolved, ambiguous, wrong-category, self-referencing, and invalid known-position inputs are rejected. Bulk writes validate all rows and commit atomically. Referenced targets should be archived; hard deletion is refused until compatibility references are removed.

The four original `/v1/library/compat/*` APIs remain shortcuts over the same groups. They do not write independent pair tables. Imported VPC scoped contact rules remain authoritative; their derived unscoped aggregates are not copied into the new catalog as additional approvals. New VPC workbook imports write canonical groups directly and replace only their own source feed. Legacy groups retain the `legacy-catalog` source until explicitly reviewed/assigned; they are not silently discarded by a re-import.

The shared evaluator in `src/domain/compatibility-rules.ts` supplies frame/SIM filtering, wirelist verification and backend module/contact checks:

1. Matching explicit prohibition wins.
2. Matching review status requires review.
3. Matching allowance permits the relationship at that position.
4. Missing evidence remains unknown unless an exhaustive allowlist excludes the target. Frames and SIM slots still require positive allowance.

Relationships are directional and never inferred transitively. Physical module/strain-relief fit is the exception: an explicit fit may be owned by either part. The canvas, accessory retention, validation, and item compatibility views accept module-owned `STRAIN_RELIEF_ALLOWED`, strain-relief-owned `MODULE_ALLOWED` or `STRAIN_RELIEF_ALLOWED`, and explicit `MATES_WITH` pairs between these two categories. They do not follow a frame, another module, or an electrical mating list to infer a strain-relief approval. Prohibitions and review status in either direction take precedence over allowances, and blank modules reject every strain relief even if a source group includes them. Item views show the effective fit from both ends without duplicating reciprocal approvals.

Blank modules do not appear in strain-relief compatibility lists or editor values. API initialization removes existing blank↔strain-relief targets from canonical groups in either direction, deletes groups emptied by that cleanup, and preserves valid targets, source metadata, and frame↔blank fits. Cleanup is idempotent and persists for all store backends. New saves strip blank targets from mixed groups and reject blank-only pairings, including through the pair and bulk APIs. Non-electrical blanks remain blanks even when they carry mechanical position counts. The pair editor does not offer blank modules.

Known relationship types validate parent/target categories in application code and SQL triggers. Existing reverse-direction catalog rows remain readable; no migration or duplicate rules are required for their use by the canvas. New types can use the same group/member storage; add definitions and consumers when their semantics become available. Dimensional contact-wire profile checks remain distinct from explicit part approvals.

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

The API Vercel build runs a read-only catalog schema check before compiling. Missing required tables or columns stop deployment with `CATALOG_SCHEMA_NOT_READY`; the check never applies migrations. `npm run check:db-schema` runs the same check independently. Local `npm run build` does not need a database.

Migration 032 is additive: it preserves parts/designs/IDs, nominal label measurements and original compatibility tables. The old `part_relationships` and four pair tables become frozen pre-migration snapshots, not current data sources. Do not replay earlier destructive migrations or re-import the catalog as a substitute for migration. Before reverting to an old runtime, account for post-migration catalog changes; old snapshots do not contain new edits.

SQLite upgrades existing JSON state on load, resolves legacy relationship members to IDs, preserves unresolved tokens, and persists canonical groups/media on subsequent writes. Memory uses the same domain representation. No production database migration is performed by the test suite: migration/data-preservation checks use an isolated embedded PostgreSQL instance, and SQLite checks use temporary files.
