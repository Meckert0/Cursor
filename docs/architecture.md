# Cable Design Tool Backend Architecture

## Purpose

This document defines a production-oriented backend architecture for a cable assembly design platform that converts interactive design actions into manufacturable outputs.

Primary goals:

- Preserve a single canonical source of truth for design intent.
- Enforce manufacturability and engineering constraints early.
- Support collaboration, review, quote submission, and downstream manufacturing.
- Generate deterministic exports (PDF, XLSX, JSON).

## Architectural Principles

- Canonical model over drawing model: store structured entities and relationships, not just canvas geometry.
- Immutable revisions: every saved revision is append-only and traceable.
- Rule-driven validity: manufacturability checks are explicit, versioned, and testable.
- Event-friendly workflow: key lifecycle actions produce auditable events.
- Deterministic outputs: same revision + ruleset + library version yields same exports.

## High-Level Components

1) API Gateway / BFF

- Authenticates users and issues scoped access to backend services.
- Handles request shaping for web client workflows.

2) Design Service

- Manages projects, designs, revisions, templates, and design states.
- Owns canonical design graph persistence.

3) Library Service

- Manages component catalog: connectors, wires, backshells, accessories.
- Exposes search/filter endpoints with stock-awareness metadata.

4) Rules Engine

- Validates design integrity and manufacturability constraints.
- Evaluates compatibility matrices and electrical constraints.
- Returns machine-readable violations and warnings.

5) Collaboration Service

- Presence, comments, notifications, activity stream, design locks.
- Optional real-time updates over WebSockets.

6) Export Service

- Converts structured revision payloads into PDF/XLSX/JSON outputs.
- Stores output artifacts in object storage with content hash.

7) Manufacturing Integration Service

- Produces build packets, test metadata, ERP/BOM payloads.
- Integrates with internal/external quote and manufacturing systems.

8) Async Job Worker

- Executes heavy operations (exports, validation runs, integrations).
- Retries transient failures with idempotent job semantics.

## Recommended Runtime Stack

- Backend language: TypeScript (Node.js) or Java/Kotlin.
- Primary database: PostgreSQL.
- Cache + lock + pub/sub: Redis.
- Object storage: S3-compatible bucket for attachments and generated files.
- Queue: BullMQ / RabbitMQ / SQS (team preference).
- PDF generation: template HTML + Playwright or Puppeteer renderer.

## Data and Storage Model

PostgreSQL:

- `projects`, `project_members`
- `designs`, `design_revisions`
- `connectors`, `paths`, `pin_mappings`, `bundles`, `annotations`
- `library_components`, `library_versions`, `inventory_snapshots`
- `comments`, `notifications`, `locks`, `audit_events`
- `validation_reports`, `rulesets`

Redis:

- Active lock registry (`design:{id}:lock`)
- Presence channels per design/project
- WebSocket fanout and transient session data

Object storage:

- Attachments
- Export artifacts (pdf/xlsx/json)
- Optional snapshot package exports

## Revision and Versioning Strategy

- `design_revisions` are immutable snapshots.
- New revision creation copies prior canonical graph and applies change set.
- Revision metadata includes:
  - `revision_number`
  - `created_by`
  - `created_at`
  - `base_revision_id`
  - `ruleset_version`
  - `library_version`
- Soft references to exports:
  - `export_id`, `artifact_uri`, `artifact_hash`

## Lifecycle State Machine

Recommended design states:

- `draft`
- `locked`
- `submitted`
- `in_review`
- `quoted`
- `released`

State transitions must:

- enforce role permissions (RBAC),
- create immutable audit events,
- optionally trigger async workflows (validation, notifications, export jobs).

## Validation and Rules Engine Design

Rules categories:

- Structural:
  - dangling wires, missing endpoints, invalid bundles
- Electrical:
  - incomplete pin mappings, prohibited loopback patterns, shield requirements
- Compatibility:
  - connector-to-cable constraints, pin count mismatches, family restrictions
- Manufacturability:
  - unsupported lengths/gauges, non-stock substitutions, forbidden combinations

Execution model:

- synchronous lightweight validation for UI feedback,
- asynchronous full validation for submission/quote readiness.

Rule outputs:

- severity (`error`, `warning`, `info`)
- code (`RULE_...`)
- path (`connectorId`, `pathId`, `pinMappingId`)
- human-readable message
- optional fix suggestion

## Real-Time Collaboration and Locking

Baseline:

- design-level pessimistic lock for edit mode.
- view-only access remains available while locked.

Enhanced mode:

- section-scoped or object-scoped locks for higher concurrency.
- Optional CRDT/OT if simultaneous edit workflows become core requirements.

## Export Pipeline

1) Resolve canonical revision payload.
2) Bind resolved data into render templates.
3) Generate:
   - PDF build docs
   - XLSX wiring/BOM sheets
   - JSON machine payload
4) Compute and persist content hash.
5) Store in object storage and record metadata in DB.

Determinism requirements:

- Pin order normalization,
- Stable sorting for connectors/wires,
- Ruleset and library version pinning in export metadata.

## Security and Compliance

- RBAC at project and design levels (`viewer`, `editor`, `owner`, `supplier_reviewer`).
- Immutable audit log for state transitions and key mutations.
- Attachment malware scanning and file type validation.
- Signed URL access to artifacts with short TTL.
- Data retention policy for revision and artifact lifecycle.

## Observability

- Structured logs with request and correlation IDs.
- Metrics:
  - validation latency
  - export success/failure rate
  - lock contention frequency
  - quote submission lead time
- Distributed tracing across API + worker + storage calls.

## Reliability and Scale Considerations

- Use idempotency keys on submit/export endpoints.
- Queue-based retries with dead-letter handling.
- Partition large projects by project ID and paginate heavy reads.
- Cache library queries with invalidation on version publish.

## Suggested Repository Layout

```text
services/
  api-gateway/
  design-service/
  library-service/
  rules-service/
  export-service/
  collaboration-service/
  manufacturing-integration/
workers/
  export-worker/
  validation-worker/
packages/
  domain-model/
  validation-rules/
  shared-auth/
docs/
```

## Roadmap Ownership

This architecture document defines system design principles and target architecture.  
Roadmap status, priorities, and sequencing are maintained only in `docs/roadmap.md`.
