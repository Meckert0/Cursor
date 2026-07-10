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

Grounded against the current codebase (2026-07-10 review): validation is still topology + library-existence only, ruleset versions are stamped but do not change validator behavior, canvas edits persist only to browser localStorage (never to the server revision snapshot), E2E coverage is a single Playwright smoke spec, the canvas is one large component, and there is no notification or observability infrastructure yet.

1. ~~Bill of materials generation from revision snapshots + library resolution (API, exports, validation, UI).~~ Done (v1).
2. ~~Export reliability hardening (retry/backoff, transient vs permanent failure handling, retention controls).~~ Done (v1).

### Priority 0: Host the repository on GitHub

Why: the project currently exists only as a local git repo (single baseline commit, no remote), so there is no off-machine backup, no collaboration surface, and the CI workflow in `.github/workflows/ci.yml` never runs. An empty GitHub repository named `Cursor` is already created for this.

Scope:

- Commit current local work-in-progress (there are uncommitted changes across backend, frontend, and docs).
- Add the `Cursor` GitHub repository as the `origin` remote and push `master`.
- Confirm secrets hygiene before pushing: `.env` is git-ignored and only `.env.example` is tracked (verify no credentials in tracked files).
- Verify GitHub Actions picks up the existing CI workflow on the first push and the pipeline goes green.

Acceptance: repository visible on GitHub with full history; CI runs automatically on push; local development workflow unchanged.

### Priority 1: Rules depth v2 — compatibility and manufacturability checks

Why: MVP exit criterion 2 ("deterministic validation blocks invalid progression") is the weakest today. `validateSnapshot` covers structural integrity and library part existence/status, but none of the compatibility or manufacturability categories the architecture defines.

Scope:

- Connector/pin compatibility: pin-count and pin-id validation against the resolved library connector definition; connector family restrictions.
- Wire/contact compatibility: wire AWG vs contact and connector acceptance, driven by structured library data (see Priority 3).
- Electrical checks: enforce `loopback` and `one_to_many` mapping-type semantics (currently declared but never validated), incomplete-mapping coverage per connector, and pin-mapping rules at junction endpoints (today only connector endpoints are checked).
- Manufacturability checks: unsupported lengths/gauges, inactive/out-of-stock substitution policy as errors (not just warnings) when project policy requires it.
- Make rulesets real: validator behavior must vary by `rulesetVersion` (rule enablement/severity per version), so the existing registry and per-project policy actually gate behavior. Give `mode: quick | full` real semantics (it is stored but currently changes nothing).

Acceptance: new rule codes covered by unit + fixture tests (extend `known-good`/`known-bad` fixtures); submit-for-quote blocked by new error-severity rules; ruleset version selection changes validation output deterministically.

### Priority 2: E2E and regression matrix expansion

Why: MVP exit criterion 5 requires CI-gated coverage of primary journeys, but only `apps/web/tests/e2e/smoke.spec.ts` exists. This is also a prerequisite for safely doing the canvas refactor in Priority 4.

Scope:

- Split the single smoke spec into journey specs: auth/registration, project + harness lifecycle, canvas authoring (create/connect/edit/delete), validate -> export -> download, submit-for-quote, and library moderation.
- Cover failure paths that matter operationally: stale-validation submit rejection, lock contention, export failure surfacing.
- Keep the suite CI-gated (already wired in `.github/workflows/ci.yml`); add artifact upload of Playwright traces on failure.

Acceptance: each MVP exit journey has at least one dedicated spec; CI runs the full matrix on every push.

### Priority 3: Library governance depth and structured compatibility data

Why: `compatibilityHints` is free text and components carry no machine-usable compatibility attributes, which blocks Priority 1's compatibility rules. Lifecycle governance (inactive/custom parts) is also still shallow.

Scope:

- Add structured compatibility fields to `LibraryComponentRecord` (e.g. accepted AWG range for contacts, pin count/family for modules) with migrations for all three store backends.
- Inactive-part governance: project-level policy for whether inactive/unreviewed parts block validation vs warn.
- Custom component lifecycle: clear draft -> reviewed -> active/archived transitions with provenance, replacing ad-hoc flags. Fix lifecycle inconsistencies: archiving does not deactivate a part, and there is no list/restore API for archived components.
- Wire up `project_library_overrides` (schema exists in `db/migrations/011` with no store methods or routes) or remove it.

Acceptance: compatibility rules in Priority 1 consume structured fields (no free-text parsing); moderation flows and ingest dry-run/commit cover the new fields.

### Priority 4: Canvas persistence, hardening, and decomposition

Why: two problems. First, canvas edits are saved only to browser localStorage (`cable-canvas-draft:{revisionId}` / `cable-canvas-layout:{revisionId}` in `cable-canvas.tsx`) and are never written to the server revision snapshot — but validation, BOM, and export all read the server snapshot. Clearing storage or switching browsers loses canvas work, and validate/export can silently run against stale data, which directly threatens MVP exit criterion 1 ("author without data loss"). Second, `apps/web/src/components/cable-canvas.tsx` is a single ~50KB component carrying all interaction logic, making every hardening change risky.

Scope:

- Close the persistence gap first: save canvas drafts to the server via the snapshot PATCH endpoint (as the wirelist editor already does), with localStorage retained only as an offline/unsaved-changes buffer. Surface dirty-state so users know when canvas work is not yet on the revision.
- Decompose into focused modules (interaction state machine, geometry/snap utilities already partly in `cable-canvas-utils.ts`, rendering layers) without behavior changes, protected by the Priority 2 canvas specs.
- Undo/redo depth and reliability for all mutation types (canvas currently has undo-only with no redo and no Ctrl+Z); keyboard-shortcut coverage audit; junction property panel (currently empty on selection).
- Preserve deterministic structured snapshot round-tripping for every canvas edit (extend unit coverage in `cable-canvas-utils.test.ts`).

Acceptance: a canvas-authored design survives browser storage loss and validates/exports what the user drew; no snapshot-shape regressions (hash-stable round-trip tests); canvas E2E specs green before and after decomposition.

### Priority 5: Observability baseline

Why: the architecture doc specifies structured logs, metrics, and tracing; none exist today. This becomes the operational safety net as validation and export load grows.

Scope:

- Structured request logging with request/correlation IDs (Fastify logger configuration, propagated into the export worker).
- Minimal metrics: validation latency, export success/failure rate, lock contention — exposed via a metrics endpoint.
- Deepen `/v1/health` to report store/lock/artifact-backend status.

Acceptance: an operator can trace a failed export from request ID to worker attempt logs; runbook (`docs/export-operations.md`) updated with the new signals.

### Priority 6: Workflow tightening and notifications v1

Why: state transitions and quote submissions produce audit events but notify no one; the collaboration service in the architecture is entirely unbuilt. A minimal version closes the review-loop gap without taking on real-time scope.

Scope:

- Notification records persisted on key events (submit-for-quote, state transitions, moderation decisions) with an in-app unread feed; email delivery optional/behind config.
- Workflow policy tightening: role-gated transition matrix review, required-validation freshness already enforced — extend to submission review states.

Acceptance: reviewers see pending submissions without polling; events are test-covered per store backend.

### Priority 7: Datastore admin and operational breadth

Why: valuable but not MVP-blocking; keep behind the items above.

Scope: PostgreSQL operational tooling (migration status surfacing, admin overview depth), Redis lock-manager health/diagnostics, object storage artifact manifests and orphan detection.

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

- 2026-07-10: Added Priority 0: push the project to the existing `Cursor` GitHub repository and activate CI.
- 2026-07-10: Rewrote near-term priorities as a codebase-grounded, scoped plan (rules depth v2 first, then E2E matrix, library governance, canvas decomposition, observability, notifications, datastore breadth). Flagged canvas localStorage-only persistence as a data-loss risk and added server-side draft saving to canvas scope.
- 2026-07-10: Hardened auth defaults (legacy header auth off), durable postgres auth, and stale-validation submit/state-transition guards; aligned README endpoints.
- 2026-07-10: Shipped export reliability v1 (recovery/retry/retention) and linked operations runbook.
- 2026-07-10: Added BOM generation as an explicit near-term priority and MVP exit criterion.
- 2026-05-14: Consolidated multiple roadmap documents into this single canonical roadmap and aligned roadmap ownership across project docs.
