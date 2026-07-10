# Cable Design Tool Roadmap

Last updated: 2026-07-10

## Purpose

This is the single canonical roadmap for the project. It defines current status, active work, priority order, deferred scope, and MVP exit criteria.

## Current Status At A Glance

- Core platform foundations are complete: RBAC, project/harness/revision lifecycle, persistence modes, locking, and artifact storage abstraction.
- Core product workflow is mostly complete in browser and API: author revision, validate, export (JSON/PDF/XLSX), and submit for quote.
- Frontend has meaningful quality gates in place (lint, unit/integration tests, Playwright E2E, CI workflow).
- Active implementation focus is now split between:
  - graphical authoring depth and hardening (canvas track),
  - moderated datastore/admin workflows (ingest and review track),
  - bill of materials generation from revision + library resolution.
- Most important remaining gaps are deeper validation/rules coverage, canvas hardening, and broader datastore operational hardening.

## Delivery Status By Workstream

### Completed

- Foundations and platform baseline (service skeleton, auth roles, storage switching, lock manager, artifact backends).
- Canonical revision model and immutable revision flow.
- Project/design lifecycle APIs and browser flows.

### Mostly Complete

- Rules engine v1 and validation persistence (strong topology checks, incomplete manufacturability depth).
- Library and inventory awareness (search/filter/detail, policy signals in authoring UX).
- Export pipeline v1 (format support and deterministic output, not yet fully hardened for retries/retention).
- Quote submission workflow and audit/traceability visibility.
- Bill of materials v1 (API, details UI, JSON/PDF/XLSX inclusion, library existence validation).
- Export reliability v1 (startup recovery, transient retry/backoff, permanent failure classification, retention cleanup, operations runbook).

### In Progress

- Phase 6: Graphical authoring (canvas) hardening and UX depth.
- Phase 7: Datastore ingestion and admin console expansion with moderated workflow.

## Active Workstreams

### Graphical Authoring (Phase 6)

Recent delivery includes junction modeling, canvas drag-connect flows, wire metadata round-tripping, inline length editing, wire quick-add with moderation handoff, and canvas-first E2E coverage.

Current focus:

- Continue canvas UX hardening and reliability.
- Preserve deterministic structured snapshot integrity for all canvas-driven edits.
- Expand critical-path testing for canvas-first authoring through validate/export/submit.

### Datastore Ingestion/Admin (Phase 7)

Recent delivery includes moderation data foundations, ingest dry-run/commit patterns, review/unreview/archive flows, owner review queue, and browser moderation coverage.

Current focus:

- Complete safe ingestion and admin breadth while preserving provenance/audit guarantees.
- Keep visibility/review policy invariants strict and test-backed.
- Extend operational guardrails for reliability and recovery.

## Near-Term Priorities (Ordered)

1. ~~Bill of materials generation from revision snapshots + library resolution (API, exports, validation, UI).~~ Done (v1).
2. ~~Export reliability hardening (retry/backoff, transient vs permanent failure handling, retention controls).~~ Done (v1).
3. Rules depth expansion beyond topology-first checks (compatibility and policy-driven manufacturability checks).
4. Library policy depth (inactive governance and custom component lifecycle).
5. Canvas hardening and structured round-trip guarantees.
6. Datastore admin expansion across PostgreSQL, Redis operational concerns, and object storage manifests.
7. Workflow policy tightening and notifications.
8. Broader regression and E2E matrix for pre-production confidence.

## Deferred Scope (Post-MVP)

The following are intentionally deferred beyond the current moderation-centric MVP cut:

- Pricing / manufacturer / inventory quantity columns on BOM (library schema does not yet carry these).
- Backshell / strain-relief BOM lines until authoring surfaces those references on connectors.
- Advanced export operational hardening beyond baseline reliability.
- Broader non-critical rules families and policy permutations.
- Advanced canvas polish (extended snap/grid/zoom/undo ergonomics).
- Full datastore operational breadth beyond immediate moderation priorities.
- Extended observability and large-scale admin throughput optimizations.
- Collaboration and downstream integrations (comments, real-time, ERP/manufacturing integration).

## MVP Exit Criteria

MVP exit requires:

1. Engineers can author and revise complete pin-mapped harnesses in browser without data loss.
2. Deterministic validation blocks invalid progression and submission.
3. JSON/PDF/XLSX exports are operationally reliable and include a complete bill of materials resolved against the library.
4. Submission and review package flow is traceable end-to-end.
5. CI-gated quality checks prevent regressions in primary user journeys.

## Definition Of Done For Remaining MVP Work

- Scope-locked moderation acceptance criteria are satisfied and test-backed.
- This roadmap, `README.md`, and architecture guidance are aligned and non-contradictory.
- Operational runbooks exist for export failure handling and artifact retention behavior (`docs/export-operations.md`).
- BOM generation is available via API, details UI, and export artifacts with unresolved-part visibility.

## Changelog Notes

- 2026-07-10: Shipped export reliability v1 (recovery/retry/retention) and linked operations runbook.
- 2026-07-10: Added BOM generation as an explicit near-term priority and MVP exit criterion.
- 2026-05-14: Consolidated multiple roadmap documents into this single canonical roadmap and aligned roadmap ownership across project docs.
