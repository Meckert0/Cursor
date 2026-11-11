# Item Database

## Purpose

This document explains the item database (also called the parts library or component library): what it stores, where the data lives, how the tables relate to each other, and the full column reference for every table.

The item database is the master catalog of physical parts used to build cable harnesses — contacts, wires, sleeves/tubes/braids, labels, backshells, strain reliefs, modules (connector bodies), splices, and frames (ITA/Receiver housings). Designs reference these parts by part number / part ID, the BOM generator resolves quantities against them, and the validator uses their attributes and compatibility rules to flag design problems.

It is managed in three admin catalog sections: Items, Compatibility & Aliases, and Images and Files, exposed over `/v1/library/*`. See [Catalog sections](catalog-sections.md) for the current model, fields, API and migration/deployment instructions.

## Where Data Is Stored

The API server selects a storage backend at startup via the `STORE_BACKEND` environment variable (`src/server.ts`). All backends implement the same `Store` interface (`src/infra/store/store.ts`), so the application logic is identical regardless of backend.

| Backend | Selected by | Where item data lives | Notes |
| --- | --- | --- | --- |
| SQLite | `STORE_BACKEND=sqlite` (default when unset) + optional `SQLITE_PATH` (default `data/app.db`) | A single JSON blob | **Local durable default.** `SqliteStore` extends `MemoryStore` and serializes the entire in-memory state into one row (`id = 'memory_store'`) of an `app_state` table after each write. The relational schema below does **not** apply to SQLite. |
| Postgres | `STORE_BACKEND=postgres` + `DATABASE_URL` | Normalized relational tables (described in this document) | Production path. Schema is created by SQL migrations through `032`. |
| Memory | `STORE_BACKEND=memory` | In-process `Map`s, lost on restart | Tests / explicit ephemeral runs only. |

The API loads a project `.env` file at startup (`src/infra/env/load-dotenv.ts`) without overriding shell-set variables. Copy `.env.example` to `.env` for local defaults.

The catalog is a **global shared item database**: parts created (and reviewed) on this store are visible to other users of the same API/database and usable across projects. Separate SQLite files do not sync; use one shared DB (or Postgres) for multi-user sharing.

CPQMatricesInfo workbook load into this catalog is available via `npm run import:cpq` (see `scripts/import-cpq.ts` and `docs/cpq-import-report.md`). Schema readiness for that load is migration `028`. VPC i1/iCon product-catalog load is `npm run import:vpc-catalog` (`scripts/import-vpc-catalog.ts`), which writes PARTS and COMPATIBILITY rows straight to Postgres (`DATABASE_URL`) after migration `032`.

Postgres schema changes are plain `.sql` files in `db/migrations/`, applied in filename order by `npm run migrate` (`scripts/migrate.ts`), which tracks applied files in a `schema_migrations` table. The item model was introduced by `027_parts_model.sql`, corrected for CPQ ingest readiness by `028_parts_model_cpq_readiness.sql`, and extended for VPC i1/iCon catalog readiness by `029_vpc_catalog_readiness.sql`.

> History: migration 027 replaced the earlier flat `library_components` table and its EAV companions (`library_field_definitions`, `library_component_custom_values`) with the typed schema described here. Existing catalog rows were intentionally discarded (no data migration). Migration 028 adds CPQ-required selection, provenance, and child tables. Migration 029 adds VPC shared taxonomy, the `frame` category, module/contact extensions, and `part_relationships`. The web viewer still normalizes the legacy category name `connector` to `contact` when it encounters old records.

## Storage Design

The schema uses a **base table + typed extension tables** pattern (class-table inheritance):

1. **`parts`** holds identity, lifecycle, and audit fields shared by every item, plus a `category` discriminator.
2. **One extension table per category** (`modules`, `contacts`, `wires`, `labels`, `sleeve_tube_braids`, `backshells`, `strain_reliefs`, `splices`, `frames`) holds the category-specific attributes. Each extension row shares its primary key with `parts.id` (a strict 1:1 relationship).
3. **`part_aliases`** maps external part-numbering systems (legacy 3-digit codes, PC Designer codes, etc.) onto parts.
4. **`compatibility_groups` and `compatibility_targets`** store all compatibility rules and FK-backed target membership. Position scopes, source evidence and exhaustive-list policy live on each group. The original four pair APIs are adapters over these groups; the old pair tables and `part_relationships` are pre-migration snapshots.
5. **`part_media`** links items to hosted image/document files, with view/direction, primary selection and source/revision metadata.

Important characteristics:

- **IDs are application-generated strings** (`parts.id` is `TEXT`; e.g. ingest accepts an optional caller-supplied ID). There is no DB-side ID generation.
- **The category ↔ extension match is enforced at the application layer**, not by the database. The store inserts a `parts` row and then the matching extension row inside one transaction.
- **Compatibility is category-safe**: canonical groups/targets use part FKs and SQL triggers to enforce known parent/target category pairs; API/domain validation also checks category and known position scopes.
- **Soft delete via archiving**: `is_archived = TRUE` hides a part from normal listings but keeps the row (restorable from the admin UI). A hard `DELETE` is also available for unreferenced items; canonical compatibility target references must be removed first.
- **Identity uniqueness**: `(category, part_number)` must be unique among non-archived parts (partial unique index). `family` remains required for filtering/display; archived parts do not block reuse of an identity.
- **Naming convention**: database columns are `snake_case`; the domain layer maps them to `camelCase` fields (e.g. `accepted_awg_min` ↔ `acceptedAwgMin`). JSONB list columns map to string arrays (`pin_ids_json` ↔ `pinIds`, `accepted_families_json` ↔ `acceptedFamilies`).

### Categories

`parts.category` must be one of:

`contact`, `wire`, `sleeve-tube-braid`, `label`, `backshell`, `strain-relief`, `module`, `splice`, `frame`

Each category corresponds to exactly one extension table (see column reference below).

### Part lifecycle

The UI-facing lifecycle status is derived from three boolean columns (`resolveLibraryLifecycleStatus` in `src/domain/library.ts`):

| Status | Condition | Meaning |
| --- | --- | --- |
| `draft` | `is_reviewed = FALSE` | Newly entered, awaiting review (appears in the review queue). |
| `reviewed_active` | reviewed and `is_active = TRUE` | Approved and usable in designs. |
| `inactive` | reviewed and `is_active = FALSE` | Approved but deactivated (hidden from default listings). |
| `archived` | `is_archived = TRUE` | Soft-deleted; excluded from listings and from the identity uniqueness rule. |

Separately, `stock_status` tracks availability: `in_stock`, `low_stock`, `out_of_stock`, or `unknown`.

## Relationships

```mermaid
erDiagram
    parts ||--o| modules : "1:1 when category=module"
    parts ||--o| contacts : "1:1 when category=contact"
    parts ||--o| wires : "1:1 when category=wire"
    parts ||--o| labels : "1:1 when category=label"
    parts ||--o| sleeve_tube_braids : "1:1 when category=sleeve-tube-braid"
    parts ||--o| backshells : "1:1 when category=backshell"
    parts ||--o| strain_reliefs : "1:1 when category=strain-relief"
    parts ||--o| splices : "1:1 when category=splice"
    parts ||--o| frames : "1:1 when category=frame"

    parts ||--o{ part_aliases : "external codes"
    parts ||--o{ part_import_provenance : "source rows"
    parts ||--o{ part_components : "parent assembly"
    parts ||--o{ compatibility_groups : "compatibility rules"
    compatibility_groups ||--o{ compatibility_targets : "members"
    parts ||--o{ compatibility_targets : "target part"
    parts ||--o{ part_media : "images and files"
    modules ||--o{ module_contact_positions : "contact-size positions"
    sleeve_tube_braids ||--o{ sleeve_size_ranges : "diameter bands"
    backshells ||--o{ backshell_fitments : "fitments"


    modules }o--o| parts : "default_protective_cover_part_id"
    backshells }o--o| parts : "keying_part_id"
    strain_reliefs }o--o| parts : "related_module_hint_part_id"
```

The canvas part picker keeps Family and Side filters at the top. Positions and Availability remain available as sortable/filterable columns and through More filters; a fixed connector Type dropdown is omitted. Information columns can be moved by dragging their grips and resized by dragging their right edges. Grips support Left/Right keys; resize handles support Left/Right (Shift for larger steps) and Home to restore the default width. Column order, widths, and visibility are stored in the browser separately for connector, frame, and SIM-insert pickers. **Columns → Reset columns** restores the default layout while retaining search and filters.

Parts with the catalog side `DUAL` display **ITA & Receiver** in the picker. They appear under either ITA or Receiver in the Side filter, and count toward both options. Selecting both sides lists each part once.

Hybrid modules display their contact-group positions as a breakdown, such as **100/8**, in the Positions column and selected-part preview. The picker reads primary/secondary counts or contact-position groups in catalog order. Search accepts the displayed breakdown; numeric ranges and sorting use the total count.

Physical blank filler modules with no electrical positions or SIM slots use the **Blank insert** family. Their ITA/Receiver/Dual side is independent of this family. Existing entries receive the same classification when read through the library API and in picker facets; ingest, edits, and both VPC and CPQ imports store it for new or updated entries. Part IDs remain stable. SIM hosts awaiting inserts and modules with electrical contacts retain their existing families.

Four kinds of relationships exist:

1. **Extension (1:1)** — every part has exactly one extension row in the table matching its category. `ON DELETE CASCADE` from `parts`, so deleting a part removes its extension row (and, transitively, its compat rows).
2. **Cross-part reference columns (soft pointers)** — a few extension columns point at other parts (`default_protective_cover_part_id`, `keying_part_id`, `related_module_hint_part_id`), while `sleeve_size_ranges.related_part_id` points to an optional paired part. All are nullable with `ON DELETE SET NULL`, so removing the referenced part just clears the pointer.
3. **Compatibility (many-to-many)** — canonical groups with normalized target members, `allowed`/`forbidden`/`review` status, source, position scope, and explicit completeness policy. Existing pair endpoints are adapters; the shared evaluator is used by browser pickers and validation.
4. **Scoped relationships** — `compatibility_groups` rows scoped by `relationship_type` and `parent_positions_json` (slots, pin groups, SIM sections), with target IDs in `compatibility_targets`. New relationship types do not need a new SQL table. Canvas creation has separate **Add connector** and **Add frame** actions: Define Connector lists only standalone `MODULE` parts, while Define Frame lists only ITA/Receiver housings. Frame quick-add uses the `frame` category and its own housing type, module capacity, and slot fields. Slot pickers still use `MODULE` parts filtered by `MODULE_ALLOWED`. SIM hosts remain modules; `SIM_INSERT` parts appear only in a host's dedicated insert picker, filtered by `INSERT_ALLOWED`, side, section boundaries, and available slot occupancy.

SIM hosts expose a compact slot-layout preview followed by backshell and strain relief controls. The accessory fields sit next to the preview with a small gap and wrap below it when space is limited. Clicking the preview opens a modal module editor without expanding the top bar. The miniature and editor share the same module-face geometry. Part 510161130 follows the supplied VPC mating-face reference: portrait housing, four mounting points, two continuous keyed openings, A above B, and positions 8 through 1 from left to right in each bank. The miniature shows the physical outline; the editor adds selectable position guides. Physical A/B labels do not rename saved slot IDs or wiring references; the editor shows both when they differ. Slot names and order come from `simSlotSections`. A complete single bank or numbered fallback is split into the module's physical slot groups without changing slot IDs; inserts cannot cross between groups. Explicit incomplete layouts remain incomplete and require library correction. Unknown modules use their catalog section layout; those with only a slot count show a numbered fallback with a notice that the physical layout is unavailable.

| iSeries modules | Slot groups | Geometry | Sources |
| --- | --- | --- | --- |
| iCon/i1 ITA 510161130 | 2 × 8 | Portrait mating face, 30.22 × 56.13 mm; A above B; slot 1 at right | [ITA drawing](https://www.vpc.com/resources/files/510161130-pdf/) |
| iCon/i1 Receiver 510160130 | 2 × 8 | Profile schematic | [Receiver drawing](https://www.vpc.com/resources/files/510160130-pdf/) |
| i2 MX rails 510143001, 510144001 | 1–5, 6–10, 11 | Two banks of five with a separate end slot; schematic proportions | [Receiver drawing](https://www.vpc.com/resources/files/510143001-pdf/), [ITA drawing](https://www.vpc.com/resources/files/510144001-pdf/) |

Selecting a slot shows its insert details and opens the existing compatible insert picker to add or change an insert. Selecting a covered slot edits the same physical insert at its starting slot. Each physical insert is saved once in the module's optional `simInserts` array, with its starting `slotId`, `occupiedSlotIds`, library part ID, part number, and local pins. This array is separate from frame `slots`, so a SIM host never becomes a frame. Covered slots cannot receive a second insert. Changing a host retains assignments and flags those that no longer fit; inserts outside the new layout remain removable in the editor. Read-only revisions allow viewing the layout while disabling insert changes. Existing assignments that span a newly recognized VPC bank break are retained and marked incompatible for explicit correction.

Usable host pins come from compatible selected inserts, not the host's nominal capacity. Local insert pin IDs become `SIM-slot:pin` and display as `SIM-slot/pin`; frame-contained hosts add the frame-slot prefix to their internal IDs. For example, `J1A - 1/P` resolves to frame pin `A:1:P`. Autosave, revision JSON, and undo preserve assignments. Validation checks fit, overlap, completeness, library state, and pin consistency; contact checks resolve the selected insert. The BOM counts each physical insert once, even when it occupies several slots.

Opening an editable canvas normalizes older SIM hosts that contain nominal pins without insert assignments. It saves empty insert configuration and removes those nominal pins while retaining wirelist rows and their mapping IDs for review. Read-only views do not save this normalization. The wirelist position list also excludes nominal pins for unconfigured hosts.

Alias rows form a fourth, simpler relationship: many aliases per part, with `(code_system, code)` globally unique — a given code within a code system resolves to exactly one part. The BOM builder (`src/domain/bom.ts`) uses aliases to resolve legacy part numbers found in design snapshots.

## Column Reference

### `parts` (base table, all categories)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | TEXT | no | — | Primary key. Application-generated string ID. |
| `category` | TEXT | no | — | CHECK: one of the nine categories listed above. Determines the extension table. |
| `part_number` | TEXT | no | — | Manufacturer/internal part number. Part of the active identity. |
| `family` | TEXT | no | — | Product family/series grouping. Required filter/display field, not identity. |
| `description` | TEXT | no | — | Human-readable description. |
| `is_active` | BOOLEAN | no | `TRUE` | Inactive parts are hidden from default listings and flagged by validation rules. |
| `is_reviewed` | BOOLEAN | no | `FALSE` | `FALSE` = draft, appears in the review queue. |
| `reviewed_by_user_id` | TEXT | yes | — | User who approved the part. |
| `reviewed_at` | TIMESTAMPTZ | yes | — | When it was approved. |
| `stock_status` | TEXT | no | — | CHECK: `in_stock`, `low_stock`, `out_of_stock`, or `unknown`. |
| `import_batch_id` | TEXT | yes | — | Identifier for the ingest batch that created the row. |
| `is_archived` | BOOLEAN | no | `FALSE` | Soft-delete flag. |
| `archived_at` | TIMESTAMPTZ | yes | — | When the part was archived. |
| `archived_by_user_id` | TEXT | yes | — | Who archived it. |
| `created_by_user_id` | TEXT | no | — | Original author (also shown as "entered by" in the review queue). |
| `created_at` | TIMESTAMPTZ | no | — | Creation time. |
| `last_edited_by_user_id` | TEXT | no | — | Most recent editor. |
| `last_edited_at` | TIMESTAMPTZ | no | — | Most recent edit time. |
| `updated_at` | TIMESTAMPTZ | no | — | System bookkeeping timestamp (updated on any write, including review/archive actions). |
| `part_type` | TEXT | yes | — | Open taxonomy (`ITA`, `RECEIVER`, `MODULE`, `SIM_INSERT`, `CONTACT`, …). |
| `side` | TEXT | yes | — | `ITA`, `RECEIVER`, or `DUAL`. |
| `notes` | TEXT | yes | — | Free-text catalog notes. |
| `electrical_mode` | TEXT | yes | — | `NONE`, `CONTACT`, `SELECTABLE`, or `INSERT_HOST`. |
| `extra_attributes` | JSONB | no | `'{}'` | Bag for facts that have not earned typed columns yet. |

Indexes:

- `parts_active_identity_uidx` — UNIQUE on `(category, part_number)` WHERE `is_archived = FALSE`.
- `parts_category_idx` — on `category`.
- `parts_is_archived_idx` — on `is_archived`.
- `parts_import_batch_id_idx` — on non-null `import_batch_id`.
- `parts_part_type_idx` — on non-null `part_type`.
- `parts_side_idx` — on non-null `side`.

### `modules` (category `module` — connector bodies/inserts)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `genre` | TEXT | yes | — | Free-text classification. |
| `gender` | TEXT | yes | — | e.g. male/female. |
| `contact_family_1` | TEXT | yes | — | Primary contact family this module accepts. |
| `pin_count` | INTEGER | yes | — | CHECK: > 0 when set. Used by validation (pin mapping bounds). |
| `contact_family_2` | TEXT | yes | — | Secondary contact family (mixed-contact modules). |
| `pin_count_2` | INTEGER | yes | — | CHECK: > 0 when set. Pin count for the secondary family. |
| `insert_arrangement` | TEXT | yes | — | Insert arrangement code parsed from CPQ data. |
| `emi` | BOOLEAN | yes | — | EMI shielding capability. |
| `crimp_gauge` | TEXT | yes | — | Crimp tooling gauge. |
| `contact_size` | TEXT | yes | — | Contact size designation. |
| `amp_rating` | TEXT | yes | — | Current rating. |
| `operating_voltage` | TEXT | yes | — | Voltage rating. |
| `operating_temp` | TEXT | yes | — | Temperature rating. |
| `default_protective_cover_part_id` | TEXT | yes | — | FK → `parts.id`, ON DELETE SET NULL. Suggested protective cover part. |
| `pin_ids_json` | JSONB | no | `'[]'` | String array of pin identifiers (maps to `pinIds`). Used by validation for pin-ID checks. |
| `position_count` | INTEGER | yes | — | CHECK: ≥ 0 when set. Total electrical positions; may populate `pin_count` for simple modules. |
| `sim_slot_count` | INTEGER | yes | — | CHECK: > 0 when set. SIM host slot count. |
| `sim_slot_sections_json` | JSONB | no | `'[]'` | Array of section arrays for SIM hosts (maps to `simSlotSections`). |
| `slot_occupancy` | INTEGER | yes | — | CHECK: > 0 when set. Adjacent SIM slots occupied by an insert. |

### `module_contact_positions`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `module_part_id` | TEXT | no | — | PK/FK → `modules.part_id`, ON DELETE CASCADE. |
| `contact_size` | TEXT | no | — | PK component; contact-size designation. |
| `contact_family` | TEXT | yes | — | Contact family for this size group. |
| `pin_count` | INTEGER | no | — | CHECK: > 0. |

### `contacts` (category `contact` — crimp contacts/terminals)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `genre` | TEXT | yes | — | Free-text classification. |
| `gender` | TEXT | yes | — | Pin/socket. |
| `awg` | TEXT | yes | — | Nominal wire gauge designation. |
| `plating` | TEXT | yes | — | e.g. gold, tin. |
| `term_type` | TEXT | yes | — | Termination type (crimp, solder, ...). |
| `ss_compatible` | BOOLEAN | yes | — | Stamped & formed / size-specific compatibility flag. |
| `length_added` | DOUBLE PRECISION | yes | — | Length the contact adds to the assembly. |
| `contact_size` | TEXT | yes | — | Insert contact-size designation. |
| `stud_size` | TEXT | yes | — | Ring/fork terminal stud size. |
| `tih` | BOOLEAN | yes | — | TIH contact flag. |
| `accepted_awg_min` | DOUBLE PRECISION | yes | — | CHECK: > 0 when set. Smallest accepted wire AWG value. |
| `accepted_awg_max` | DOUBLE PRECISION | yes | — | CHECK: > 0 when set. Largest accepted wire AWG value. |
| `accepted_families_json` | JSONB | no | `'[]'` | String array of accepted wire families (maps to `acceptedFamilies`). Used by attribute-based compatibility validation. |
| `accepted_gauges_json` | JSONB | no | `'[]'` | String list of gauges/media (`22`, `RG316`, `FLEX405`). Not always numeric AWG. |
| `wire_interface` | TEXT | yes | — | Optional interface note from wire/cable compatibility. |

### `wires` (category `wire`)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `mil_spec` | TEXT | yes | — | MIL-spec designation. |
| `awg` | TEXT | yes | — | Actual conductor gauge; cable/media designations are separate after migration 032. |
| `color` | TEXT | no | — | Wire color. Required for wires (also a search filter in the UI). |
| `cma` | DOUBLE PRECISION | yes | — | Circular mil area. |
| `wire_type` | TEXT | yes | — | Construction type. |
| `insulation_material` | TEXT | yes | — | Insulation material. |
| `overall_dia` | DOUBLE PRECISION | yes | — | Overall diameter. |
| `conductor_dia` | DOUBLE PRECISION | yes | — | Conductor diameter. |
| `number_of_conductors` | INTEGER | yes | — | Conductor count. |
| `temp_max` | DOUBLE PRECISION | yes | — | Maximum temperature rating. |
| `overall_wire_braid` | BOOLEAN | yes | — | Has overall braid shield. |
| `overall_wire_foil` | BOOLEAN | yes | — | Has overall foil shield. |
| `internal_pair_foil` | BOOLEAN | yes | — | Has internal pair foil. |
| `weight_per_ft` | DOUBLE PRECISION | yes | — | Weight per foot. |
| `k1` | DOUBLE PRECISION | yes | — | Electrical model coefficient. |
| `k2` | DOUBLE PRECISION | yes | — | Electrical model coefficient. |
| `loss_coefficient` | DOUBLE PRECISION | yes | — | Signal loss coefficient. |
| `max_freq` | DOUBLE PRECISION | yes | — | Maximum frequency. |
| `impedance` | DOUBLE PRECISION | yes | — | Characteristic impedance. |
| `max_voltage` | DOUBLE PRECISION | yes | — | Maximum voltage. |

### `labels` (category `label`)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `series` | TEXT | yes | — | Label series. |
| `awg_min` | DOUBLE PRECISION | yes | — | Minimum supported AWG for shrink labels. |
| `awg_max` | DOUBLE PRECISION | yes | — | Maximum supported AWG for shrink labels. |
| `length_in` | DOUBLE PRECISION | yes | — | Label length in inches. |
| `dia_in` | DOUBLE PRECISION | yes | — | Label diameter in inches. |

Label type is stored in `parts.family`.

### `sleeve_tube_braids` (category `sleeve-tube-braid`)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
This extension is identity-only; sleeve style is stored in `parts.family`.

### `sleeve_size_ranges`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK/FK → `sleeve_tube_braids.part_id`, ON DELETE CASCADE. |
| `min_dia` | DOUBLE PRECISION | no | — | PK component; minimum covered diameter. |
| `max_dia` | DOUBLE PRECISION | no | — | PK component; maximum covered diameter; CHECK: `min_dia <= max_dia`. |
| `related_part_id` | TEXT | yes | — | FK → `parts.id`, ON DELETE SET NULL. Optional paired braid/tube part. |

### `backshells` (category `backshell`)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `keying_part_id` | TEXT | yes | — | FK → `parts.id`, ON DELETE SET NULL. Associated keying part. |
| `length_added` | DOUBLE PRECISION | yes | — | Length added to the assembly. |
| `bundle_allowance` | DOUBLE PRECISION | yes | — | Extra bundle length allowance. |

### `backshell_fitments`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK/FK → `backshells.part_id`, ON DELETE CASCADE. |
| `family_type` | TEXT | no | — | PK component; fitment family type. |
| `gender` | TEXT | no | `''` | PK component; mating gender. |
| `backshell_size` | TEXT | no | `''` | PK component; shell size. |
| `emi` | BOOLEAN | no | `FALSE` | PK component; EMI variant. |

### `strain_reliefs` (category `strain-relief`)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `gender` | TEXT | yes | — | Mating gender. |
| `requires_backshell` | BOOLEAN | yes | — | Whether this strain relief must be paired with a backshell. |
| `related_module_hint_part_id` | TEXT | yes | — | FK → `parts.id`, ON DELETE SET NULL. Hint linking to a module it is typically used with. |

### `splices` (category `splice`)

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `variant` | TEXT | yes | — | Splice variant. |
| `conductor_count` | INTEGER | yes | — | Number of conductors joined. |
| `awg` | TEXT | yes | — | Accepted gauge. |
| `manufacturer_pn` | TEXT | yes | — | Manufacturer part number. |
| `cma_min` | DOUBLE PRECISION | yes | — | Minimum CMA for solder-splice selection. |
| `cma_max` | DOUBLE PRECISION | yes | — | Maximum CMA for solder-splice selection. |

Splice series is stored in `parts.family`.

### `frames` (category `frame` — ITA / Receiver housings)

ITA and Receiver share this extension. They must not be stored as `module`, or they would appear in the canvas connector picker. `parts.part_type` distinguishes ITA vs Receiver.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | PK, FK → `parts.id`, ON DELETE CASCADE. |
| `module_capacity` | INTEGER | yes | — | CHECK: > 0 when set. Named slot count (1 or 2 for i1/iCon). |
| `slot_ids_json` | JSONB | no | `'[]'` | String array of slot ids (e.g. `["A","B"]`). |

### `part_aliases`

Maps codes from external/legacy numbering systems onto parts. Many aliases per part; a code is unique within its code system.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | FK → `parts.id`, ON DELETE CASCADE. |
| `code_system` | TEXT | no | — | Part of composite PK. Known systems include `contact_3digit`, `wire_3digit`, `pc_designer_contact`, `pc_designer_wire`, and `vendor_pn` (open-ended). |
| `code` | TEXT | no | — | Part of composite PK. The alias code itself. |

Primary key: `(code_system, code)`. Index: `part_aliases_part_id_idx` on `part_id`.

### Legacy compatibility tables (pre-migration snapshots)

The following table descriptions are historical. After migration 032, current compatibility is stored in `compatibility_groups`/`compatibility_targets`; use [Catalog sections](catalog-sections.md) and the group/pair APIs for current data.

All four share the same shape: a composite primary key of the two part IDs plus a `status` column constrained to `allowed`, `forbidden`, or `review`. They reference the **extension tables** (not `parts`), which guarantees each side of the pair is the correct category. All FKs are ON DELETE CASCADE.

#### `contact_wire_compat`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `contact_part_id` | TEXT | no | — | FK → `contacts.part_id`. Composite PK. |
| `wire_part_id` | TEXT | no | — | FK → `wires.part_id`. Composite PK. |
| `status` | TEXT | no | — | CHECK: `allowed` / `forbidden` / `review`. |
| `notes` | TEXT | yes | — | Free-text notes. |
| `crimp_class` | TEXT | yes | — | CPQ crimp class (`ZZ`, `CA`, `CB`). |

#### `module_contact_compat`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `module_part_id` | TEXT | no | — | FK → `modules.part_id`. Composite PK. |
| `contact_part_id` | TEXT | no | — | FK → `contacts.part_id`. Composite PK. |
| `status` | TEXT | no | — | CHECK: `allowed` / `forbidden` / `review`. |
| `notes` | TEXT | yes | — | Notes for heuristic/review mapping. |
| `source` | TEXT | yes | — | Source of heuristic/review mapping. |

#### `module_backshell_compat`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `module_part_id` | TEXT | no | — | FK → `modules.part_id`. Composite PK. |
| `backshell_part_id` | TEXT | no | — | FK → `backshells.part_id`. Composite PK. |
| `status` | TEXT | no | — | CHECK: `allowed` / `forbidden` / `review`. |
| `notes` | TEXT | yes | — | Notes for heuristic/review mapping. |
| `source` | TEXT | yes | — | Source of heuristic/review mapping. |

#### `module_strain_relief_compat`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `module_part_id` | TEXT | no | — | FK → `modules.part_id`. Composite PK. |
| `strain_relief_part_id` | TEXT | no | — | FK → `strain_reliefs.part_id`. Composite PK. |
| `status` | TEXT | no | — | CHECK: `allowed` / `forbidden` / `review`. |
| `notes` | TEXT | yes | — | Notes for heuristic/review mapping. |
| `source` | TEXT | yes | — | Source of heuristic/review mapping. |

`module_strain_relief_compat` ships empty in v1 pending a reliable source of fit rules.

### `compatibility_groups`, `compatibility_targets`, and `part_media`

Migration 032 preserves `part_relationships` as a frozen source snapshot, moves active rules into canonical groups, and resolves each compatible part number into an FK-backed target member. Unresolved tokens remain in `compatibility_unresolved_targets`. Groups preserve position scopes, status, notes and source evidence. Media associations are separate from item specifications and compatibility. See [Catalog sections](catalog-sections.md) for the current field reference and behavior.

### Supporting tables

#### `awg_cma_reference`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `awg` | TEXT | no | — | Primary key. |
| `cma` | DOUBLE PRECISION | no | — | Circular mil area. |

#### `part_import_provenance`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `part_id` | TEXT | no | — | FK → `parts.id`, ON DELETE CASCADE. |
| `source_sheet` | TEXT | no | — | CPQ source sheet. |
| `source_row` | INTEGER | yes | — | Source row number. |
| `note` | TEXT | yes | — | Import note. |

#### `part_components`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `parent_part_id` | TEXT | no | — | PK/FK → `parts.id`, ON DELETE CASCADE. |
| `child_part_id` | TEXT | no | — | PK/FK → `parts.id`, ON DELETE CASCADE; must differ from parent. |
| `quantity` | DOUBLE PRECISION | no | — | CHECK: > 0. |
| `unit` | TEXT | yes | — | Component quantity unit. |

## How the Application Maps to the Schema

### Domain types

`src/domain/library.ts` defines the canonical shapes:

- `PartRecord` — mirrors the `parts` table (camelCase), including `partType`, `side`, `notes`, `electricalMode`, and `extraAttributes`.
- `ModuleAttributes`, `ContactAttributes`, `WireAttributes`, `LabelAttributes`, `SleeveTubeBraidAttributes`, `BackshellAttributes`, `StrainReliefAttributes`, `SpliceAttributes`, `FrameAttributes` — mirror the extension tables.
- `PartWithAttributes` — a discriminated union of `PartRecord & { category, attributes }`; this is the shape the API returns and the stores accept. (`LibraryComponentRecord` is a deprecated alias for it.)
- `PartAlias`, `ContactWireCompat`, `ModuleContactCompat`, `ModuleBackshellCompat`, `ModuleStrainReliefCompat`, `PartRelationship`, `CompatStatus` — mirror the alias, junction, and generic relationship tables.
- `isCanvasConnectorPart` — true only for `category === "module"` with `partType` `MODULE` or empty (slot modules).
- `isCanvasFramePart` / `isCanvasDefinablePart` — ITA/Receiver frames and the combined canvas catalog; connector and frame pickers apply separate eligibility predicates.

The Postgres store (`src/infra/store/postgres-store.ts`) reads `parts` rows, batch-loads the matching extension rows, and assembles `PartWithAttributes` objects; writes insert/upsert the `parts` row and extension row in one transaction.

### Field metadata

`src/domain/part-fields.ts` (mirrored for the web app at `apps/web/src/lib/part-fields.ts`) declares `PART_FIELDS_BY_CATEGORY`: per-category field lists with label, input type (`text` / `number` / `boolean` / `string-list`), and flags controlling whether each field appears in the item database viewer, on the add form, and in search. Identity/audit fields live on `PartRecord`; everything else lives on `attributes`. This metadata is what makes the admin viewer render the right columns per category without hardcoding them.

### API surface

All under `/v1/library` (`src/routes/library.ts`):

- **Items**: `GET/POST` variants on `/components` — list (with `q`, `category`, `family`, `awg`, `color`, `partType`, `side` filters), get by ID, bulk `ingest` (with `dry-run`), `PATCH` update, `DELETE`, plus lifecycle actions `review`, `unreview`, `archive`, `restore`, `GET /components/archived`, and `GET /components/review-queue`.
- **Compatibility**: `GET/PUT/DELETE` on `/compat/contact-wire`, `/compat/module-contact`, `/compat/module-backshell`, `/compat/module-strain-relief`.
- **Generic relationships**: admin `GET/PUT/DELETE` on `/relationships`, plus `POST /relationships/bulk`.
- **Aliases**: `GET/PUT/DELETE` on `/aliases`.
- **Table preferences**: `GET/PUT /table-preferences/:scope` (per-user column layout for the viewer; stored separately from item data).

### Consumers

- **Admin UI** — `apps/web/src/app/admin/page.tsx` hosts the item database viewer (`item-database-viewer.tsx`, per-category virtualized tables with create/edit/delete) and the compatibility manager (`compatibility-manager.tsx`, junction, generic relationship, and alias editing).
- **BOM generation** — `src/domain/bom.ts` resolves snapshot part numbers against parts, including alias codes from `part_aliases`.
- **Validation** — `src/domain/validator.ts` uses `createCompatLookup` (`src/domain/compat-lookup.ts`) over adapters to the canonical groups for pairwise checks, and `resolveLibraryCompatibility` (`src/domain/library-compatibility.ts`) for attribute-driven checks (module pin counts/pin IDs, contact accepted-AWG range, accepted wire families).

## File Map

| Concern | Location |
| --- | --- |
| Schema (Postgres) | `db/migrations/027_parts_model.sql`, `db/migrations/028_parts_model_cpq_readiness.sql`, `db/migrations/029_vpc_catalog_readiness.sql`, `db/migrations/032_catalog_sections.sql` |
| Migration runner | `scripts/migrate.ts` (`npm run migrate`) |
| Domain types & lifecycle | `src/domain/library.ts` |
| Per-category field metadata | `src/domain/part-fields.ts`, `apps/web/src/lib/part-fields.ts` |
| Compatibility helpers | `src/domain/compat-lookup.ts`, `src/domain/library-compatibility.ts` |
| Store interface | `src/infra/store/store.ts` |
| Postgres implementation | `src/infra/store/postgres-store.ts` |
| Memory / SQLite implementations | `src/infra/store/memory-store.ts`, `src/infra/store/sqlite-store.ts` |
| HTTP API | `src/routes/library.ts` |
| Admin UI | `apps/web/src/app/admin/` (`page.tsx`, `item-database-viewer.tsx`, `compatibility-manager.tsx`) |
