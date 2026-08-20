# Cable Design Tool Roadmap

Last updated: 2026-08-20

## Purpose

This is the single canonical roadmap for the project. It defines current status, active work, priority order, deferred scope, and MVP exit criteria.

## Goal

Get one cable completely working from start to finish, with a complete bill of materials as the output. Topology and part selection are authored on the canvas; pin-level, wire, contact, signal, and label detail are authored on the wirelist. Both surfaces write the same revision snapshot, and the BOM must resolve every line against the component library.

## Current Status At A Glance

- Core platform foundations are complete: RBAC, project/harness/revision lifecycle, persistence modes, locking, artifact storage abstraction, and observability baseline.
- Hosted architecture is in place on Vercel (PostgreSQL, Redis, S3 or Vercel Blob). Local development still defaults to SQLite and file artifacts. See `docs/deployment.md`.
- The workflow shell works end to end in the browser: author on canvas/wirelist, validate, export (JSON/PDF/XLSX), and submit for quote.
- Rules depth v2, the E2E journey matrix, library governance, canvas persistence/hardening, export reliability v1, wirelist pin-mapping authoring (Phase A), BOM completeness (Phase C), canvas/wirelist data-integrity hardening (Phase D), and the full-cable E2E acceptance journey (Phase E) are shipped.
- The catalog starts empty. Phase B shipped a starter seed, then that automatic seed was removed; ingest parts via admin, the library API, `npm run import:cpq`, or `npm run import:vpc-catalog`.
- The Complete-Cable MVP exit criteria are met. Notifications and datastore-admin breadth remain deferred post-MVP.
- GitHub Actions CI is the standing validation gate (backend tests, frontend lint/build/unit tests, Playwright E2E).

## Delivery Status By Workstream

### Completed

- Foundations and platform baseline (service skeleton, auth roles, storage switching, lock manager, artifact backends).
- Hosted Vercel Production/Test layout (Postgres, Redis, S3 or Vercel Blob; Hobby Blob option; daily maintenance cron). Local default remains SQLite + file artifacts.
- Canonical revision model and immutable revision flow.
- Project/design lifecycle APIs and browser flows.
- Rules engine v2 (topology + electrical + compatibility + manufacturability; ruleset/mode-gated severity).
- E2E journey matrix (auth, project/harness, canvas, validate/export, submit-for-quote, moderation, wirelist, failure paths) with CI trace upload.
- Library governance v1 (first-class compatibility columns, archive/restore, review policies).
- Canvas persistence and hardening v1 (server snapshot autosave, undo/redo, junction properties, module split).
- Export reliability v1 (startup recovery, transient retry/backoff, permanent failure classification, retention cleanup, operations runbook).
- Bill of materials v1 (API, details UI, JSON/PDF/XLSX inclusion, library existence validation, unresolved-part visibility).
- Observability baseline v1 (request/correlation IDs, `/v1/metrics`, deepened `/v1/health`, export worker trace logs).
- Datastore ingestion/admin moderation v1 (ingest dry-run/commit, review queue, archive flows, browser moderation coverage).
- Pin-level mapping authored from the wirelist (Phase A: parse `Connector-Pin`, emit/load `pinMappings`, validate unresolved connector/pin refs).
- Starter library catalog (Phase B: originally seeded across memory, sqlite, and postgres; automatic seed later removed — catalog now starts empty).
- BOM completeness (Phase C: backshell/strain-relief connector fields + canvas pickers, library-resolved sleeving, wire AWG/color on BOM lines).
- Canvas/wirelist data-integrity hardening (Phase D: optimistic concurrency on snapshot PATCH, conflict UI, wirelist→canvas revalidation, sleeving column).
- Full-cable E2E acceptance journey (Phase E: canonical fixture + browser journey through author → validate → resolved BOM → export → submit).

### In Progress

- None.

## Near-Term Priorities (Ordered)

VPC catalog schema Phases 1–3 are complete: `029` on Neon, then `npm run import:vpc-catalog` for the i1/iCon workbook. Canvas/frame authoring and CPQ merge remain deferred.

Phases A-E are complete. The ordered MVP plan below is retained as the shipped record.

### Phase A: Pin-level mapping authored from the wirelist — DONE

Why: nothing in the product authored `pinMappings` before this phase. The wirelist `From/To Location (Conn - Pin)` columns already carry connector label and pin position in one cell separated by `-` (e.g. `J1-3`), but the save path resolved only the connector and silently dropped the pin.

Shipped:

- Parse `Connector-Pin` in the From/To Location columns (split on the last `-`; resolve connector by reference, pin by number against that connector's pins).
- Emit a `PinMapping` per wirelist row when both ends resolve, merged into the snapshot keyed by path ID.
- Render `Connector-Pin` back from the associated pin mapping on load so the round trip is stable.
- Wire `validNodeIds` into wirelist validation to flag unresolved connector/pin references inline.

Acceptance: entering `J1-3` / `J2-A1` on a wirelist row produces a persisted pin mapping; reloading the wirelist shows the same cells; unit tests cover parse, round-trip, and validation.

### Phase B: Starter library catalog — DONE

Why: `DEFAULT_LIBRARY_COMPONENTS` previously contained a single inactive backshell, so the catalog pickers were unusable out of the box and every part had to be quick-added as unreviewed.

Shipped:

- Seed a small realistic catalog covering every category one real cable needs: connector modules with real pin counts, matching contacts, wire gauges/colors, labels, sleeving, backshells, strain reliefs.
- Seed identically across memory, sqlite, and postgres backends (`ensureDefaultLibrarySeeded`, insert-missing / backfill).
- Update README quick-start notes for seeding behavior.

Acceptance: a fresh install lets a user pick every part of a complete cable from active, reviewed library entries in all three store backends.

Later change: the automatic starter seed (`ensureDefaultLibrarySeeded`) was removed. Fresh installs now start with an empty catalog. Ingest parts via the admin UI, the library ingest API, or `npm run import:cpq`. E2E and full-cable fixtures ingest the parts they need rather than relying on a seeded catalog.

### Phase C: BOM completeness for a fully accessorized cable — DONE

Why: the BOM previously omitted backshells and strain reliefs, resolved sleeving from a hardcoded enum label instead of the library, and hid wire AWG/color.

Shipped:

- Add `backshellPartNumber` / `strainReliefPartNumber` (and library component IDs) to the runtime connector type with canvas property-panel pickers sourced from the `backshell` / `strain-relief` library categories.
- Emit resolved backshell/strain-relief BOM lines per connector.
- Resolve sleeving against the `sleeve-tube-braid` library category via compatibility hints, falling back to the enum label.
- Surface wire AWG/color on wire BOM lines.
- Extend BOM unit fixtures and API integration fixtures to a fully-specified cable exercising every line type.

Acceptance: a fully accessorized cable produces a BOM where every line (connectors, contacts, wires, labels, sleeving, backshells, strain reliefs) resolves against the library with correct quantities.

### Phase D: Canvas/wirelist data-integrity hardening — DONE

Why: both editors PATCH the same snapshot with last-write-wins semantics; a stale canvas tab can silently clobber wirelist edits and vice versa. The wirelist also lacks a sleeving column (canvas-only field) and does not revalidate the canvas page after saving.

Shipped:

- Optimistic concurrency on `PATCH /v1/revisions/{id}/snapshot` via `expectedSnapshotHash`; mismatch returns 409 `SNAPSHOT_MISMATCH`.
- Visible conflict/reload state in canvas and wirelist UIs.
- Wirelist saves revalidate the canvas path (parity with canvas already revalidating wirelist).
- Sleeving column on the wirelist grid (including import/export template headers).

Acceptance: concurrent stale saves are rejected instead of silently overwriting; sleeving survives edits from either surface.

### Phase E: Full-cable E2E acceptance journey (capstone) — DONE

Why: existing E2E specs exercise empty or minimal harnesses. Nothing proves the complete journey for one real cable, which is the definition of done for this roadmap.

Shipped:

- Canonical fully-specified cable fixture (`src/domain/fixtures/full-cable.complete.json`) covering connectors, pin mappings, contacts, signals, labels, sleeving, backshells, and strain reliefs against seeded library parts.
- Fixture-backed validation/BOM unit coverage.
- E2E acceptance spec (`apps/web/tests/e2e/full-cable.spec.ts`): register → create project/harness → author topology and parts on canvas → complete pin/contact/signal/label detail on wirelist → validate clean → assert every BOM line resolves with expected part numbers and quantities → export JSON/PDF/XLSX → submit for quote.

Acceptance: the spec passes in CI and is the standing acceptance test for "one cable working start to finish with a complete BOM."

## Deferred Scope (Post-MVP)

- VPC canvas/frame authoring and CPQ merge (catalog schema + i1/iCon workbook import are done; see `docs/vpc_catalog_schema_7ab9d02d.plan.md`).
- Workflow notifications v1 (in-app unread feed on submit-for-quote, state transitions, moderation decisions; optional email delivery).
- Datastore admin and operational breadth (migration status surfacing, Redis lock diagnostics, artifact manifests and orphan detection).
- Pricing / manufacturer / inventory quantity columns on BOM (library schema does not yet carry these).
- Advanced export operational hardening beyond baseline reliability.
- Broader non-critical rules families and policy permutations.
- Advanced canvas polish (extended snap/grid/zoom/undo ergonomics).
- Extended observability and large-scale admin throughput optimizations.
- Collaboration and downstream integrations (comments, real-time, ERP/manufacturing integration).

## MVP Exit Criteria

MVP exit requires:

1. One real cable can be authored end to end in the browser: topology and part selection on the canvas, pin mappings and wire/contact/signal/label detail on the wirelist, with no data loss between the two surfaces.
2. Deterministic validation passes clean for the complete cable and blocks invalid progression and submission.
3. The BOM resolves every line against the library — connectors, contacts, wires, labels, sleeving, backshells, and strain reliefs — with correct quantities, and is included in JSON/PDF/XLSX exports.
4. Submission and review package flow is traceable end-to-end.
5. The full-cable E2E journey (Phase E) runs green in CI and prevents regressions in the complete path.

## Definition Of Done For Remaining MVP Work

- Phases A-E acceptance criteria are satisfied and test-backed. **Complete-Cable MVP is done.**
- This roadmap, `README.md`, and architecture guidance are aligned and non-contradictory.
- Operational runbooks exist for export failure handling and artifact retention behavior (`docs/export-operations.md`).
- BOM generation is available via API, details UI, and export artifacts with unresolved-part visibility.

## Changelog Notes

- 2026-08-20: VPC catalog Phase 3 — `import:vpc-catalog` loads the i1/iCon PARTS/COMPATIBILITY workbook into Postgres (`part_relationships` + dual-write `module_contact_compat`). Phases 1–2 shipped the `029` schema to GitHub/Neon first.
- 2026-08-20: VPC catalog schema Phase 1 — Postgres migration `029` (shared part taxonomy, `frames`, module/contact extensions, `part_relationships`), store/API round-trip, Item Database fields, generic relationship manager, canvas connector picker excludes frames and SIM inserts.
- 2026-08-18: Hosted Vercel Production/Test architecture is implemented (PostgreSQL, Redis, S3 or Vercel Blob; local default remains SQLite + file artifacts). Catalog automatic seed removed — catalog starts empty. Export retention now keeps the DB row when Blob/S3/file delete fails so cleanup can retry. Frontend lint/hooks cleanup and GitHub Actions upgraded to Node 24-capable majors (`checkout`/`setup-node`/`upload-artifact` v7). Supersedes the 2026-07-20 local-only note; deployment packaging is no longer deferred.
- 2026-07-20: Confirmed local-only product mode for now (no cloud deploy packaging). **Superseded 2026-08-18.** Complete-Cable MVP remains available locally via `npm run dev:full`; notifications and BOM pricing stay post-MVP.
- 2026-07-10: Completed Phase E — full-cable E2E acceptance journey (canonical fixture, fixture BOM/validation coverage, browser journey through author → validate → resolved BOM → JSON/PDF/XLSX export → submit for quote). Complete-Cable MVP exit criteria met.
- 2026-07-10: Completed Phase D — canvas/wirelist data-integrity hardening (optimistic concurrency on snapshot PATCH, conflict UI, wirelist→canvas revalidation, sleeving column).
- 2026-07-10: Completed Phase C — BOM completeness (backshell/strain-relief connector fields + canvas pickers, library-resolved sleeving via compatibility hints, wire AWG/color on BOM lines, fully-accessorized fixtures).
- 2026-07-10: Completed Phase B — starter library catalog (modules/contacts/wires/labels/sleeving/backshells/strain reliefs; identical seed/backfill across memory, sqlite, and postgres via `ensureDefaultLibrarySeeded`).
- 2026-07-10: Completed Phase A — wirelist pin-mapping authoring (`Connector-Pin` parse/save/load round-trip, `pinMappings` emission keyed by path ID, unresolved connector/pin validation via `validNodeIds`).
- 2026-07-10: Recreated the roadmap around the Complete-Cable MVP goal (one cable start to finish with a complete, library-resolved BOM). Near-term priorities are now Phases A-E: wirelist pin-mapping authoring, starter library catalog, BOM completeness (backshell/strain-relief/sleeving), canvas/wirelist data-integrity hardening, and a full-cable E2E acceptance journey. Deferred notifications (old Priority 6) and datastore admin breadth (old Priority 7) to post-MVP.
- 2026-07-10: Completed Priority 5 — observability baseline (request/correlation IDs, `/v1/metrics`, deepened `/v1/health`, export worker trace logs, runbook update).
- 2026-07-10: Completed Priority 4 — canvas persistence/hardening (server snapshot autosave + dirty status, undo/redo + shortcuts, junction property panel, module split, hash-stable round-trip tests).
- 2026-07-10: Completed Priority 3 — library governance v1 (first-class compatibility columns, archive deactivates + list/restore, unreviewedPartSeverity policy, dropped unused `project_library_overrides`).
- 2026-07-10: Completed Priority 2 — E2E journey matrix (auth, project/harness, canvas, validate/export, submit-for-quote, moderation, failure paths); CI trace artifact upload; details submit/lock UI.
- 2026-07-10: Completed Priority 1 — rules depth v2 (ruleset/mode-gated electrical, compatibility, and manufacturability checks; `rules-2026.04`; project policy inactive/OOS severity overrides; compatibility attrs via library `customFieldValues` bridge until Priority 3).
- 2026-07-10: Completed Priority 0 — hosted at https://github.com/Meckert0/Cursor; CI green (backend + frontend E2E). Also fixed XLSX export hash determinism, CI web dependency install, and frontend typecheck blockers uncovered by the first CI runs.
- 2026-07-10: Added Priority 0: push the project to the existing `Cursor` GitHub repository and activate CI.
- 2026-07-10: Rewrote near-term priorities as a codebase-grounded, scoped plan (rules depth v2 first, then E2E matrix, library governance, canvas decomposition, observability, notifications, datastore breadth). Flagged canvas localStorage-only persistence as a data-loss risk and added server-side draft saving to canvas scope.
- 2026-07-10: Hardened auth defaults (legacy header auth off), durable postgres auth, and stale-validation submit/state-transition guards; aligned README endpoints.
- 2026-07-10: Shipped export reliability v1 (recovery/retry/retention) and linked operations runbook.
- 2026-07-10: Added BOM generation as an explicit near-term priority and MVP exit criterion.
- 2026-05-14: Consolidated multiple roadmap documents into this single canonical roadmap and aligned roadmap ownership across project docs.
