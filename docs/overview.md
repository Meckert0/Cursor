# Cable Design Tool Overview

The Cable Design Tool (CDT) is a web application for designing cable harnesses. Users author a harness as structured engineering data, validate it against a versioned ruleset and a shared parts catalog, then produce a bill of materials and deterministic JSON, PDF, and XLSX exports. Quote submission and harness lifecycle transitions are recorded against that same revision.

The product is a TypeScript Fastify API plus a Next.js browser app. They share one canonical revision snapshot: canvas geometry is display metadata; connectors, paths, pin mappings, and part references are the source of truth.

## What users do

1. Register or sign in (email/password). The session is an HTTP-only `cdt_session` cookie on the frontend origin.
2. Create a project, manage members, and optionally set a per-project ruleset policy.
3. Create a harness under the project. Opening a harness goes to the canvas.
4. Author topology and part selection on the **canvas**: connector modules, junctions, cable paths, backshells, and strain reliefs, with undo/redo and server autosave.
5. Author pin-level, wire, contact, signal, label, and sleeving detail on the **wirelist**. From/To cells use `Connector-Pin` (for example `J1-3`). Saving emits `pinMappings` into the same snapshot.
6. Open **details** for the current revision: run validation, inspect the BOM, queue JSON/PDF/XLSX exports, lock or unlock the harness, and submit for quote.

Canvas and wirelist both `PATCH` the same revision snapshot. Saves send `expectedSnapshotHash`; a mismatch returns `409 SNAPSHOT_MISMATCH` and the UI asks the user to reload instead of overwriting the other surface.

## Domain model

Hierarchy:

- **Project** — named workspace with members and a ruleset policy.
- **Harness** (API entity `Design`) — a cable design under a project. Status is one of `draft`, `locked`, `submitted`, `in_review`, `quoted`, `released`.
- **Revision** — an immutable snapshot of the harness. Each revision pins `rulesetVersion` and `libraryVersion`. New revisions copy the prior snapshot.

A revision snapshot contains:

| Entity | Role |
| --- | --- |
| Connectors | Graph nodes. Reference (e.g. `J1`), library module, pins, optional backshell and strain relief, canvas position. |
| Junctions | Intermediate nodes on the canvas (location, optional label/type). |
| Cable paths | Graph edges between connectors/junctions. Wire part, AWG, color, length (inches), sleeving, contacts, signals, labels, notes. |
| Pin mappings | Pin-to-pin relationships keyed by path (`one_to_one`, `one_to_many`, `loopback`). |
| Bundles | Named groups of path IDs. |
| Annotations | Notes attached to the snapshot. |

HTTP paths use `/v1/harnesses/...`. The API rewrites those URLs to `/v1/designs/...` internally.

Detailed field definitions: `docs/domain-model.md`.

## Item database

The item database (parts library) is the shared catalog of physical parts used in designs, BOM resolution, and compatibility checks. It starts empty; parts enter through the admin UI, the library ingest API, or `npm run import:cpq` (CPQMatricesInfo workbook).

Categories:

`contact`, `wire`, `sleeve-tube-braid`, `label`, `backshell`, `strain-relief`, `module`, `splice`

Storage is a base `parts` table plus one typed extension table per category, plus:

- **Aliases** — external/legacy codes mapped onto a part (used when resolving BOM part numbers).
- **Compatibility junctions** — pairwise `allowed` / `forbidden` / `review` rules for contact–wire, module–contact, module–backshell, and module–strain-relief.

Lifecycle is derived from flags: draft (unreviewed), reviewed active, inactive, or archived (soft delete). Stock status is `in_stock`, `low_stock`, `out_of_stock`, or `unknown`.

The catalog is global to the store: reviewed parts are usable across projects on that database.

Admin UI (`/admin`) hosts the item database viewer (per-category tables, create/edit/delete) and the compatibility manager (junctions and aliases). `/admin/datastores` is the review queue. `/library` is a search/filter catalog for signed-in users.

Schema, columns, and API map: `docs/item-database.md`.

## Validation and rulesets

`POST /v1/revisions/{revisionId}/validate` runs the rules engine in `quick` or `full` mode. Issues have severity (`error`, `warning`, `info`), a `RULE_...` code, and an optional entity path.

Rule families:

- **Topology** — dangling/missing connectors on paths, invalid bundles, incomplete or inconsistent pin mappings, loopback/one-to-many/junction constraints, orphaned connectors.
- **Library** — missing, inactive, unreviewed, or out-of-stock parts.
- **Electrical / pin** — incomplete mappings, pin-count and pin-ID checks against the module.
- **Compatibility** — junction-table lookups (contact–wire, module–contact, module–backshell, module–strain-relief) plus attribute checks (accepted AWG range, accepted wire families).
- **Manufacturability** — unsupported wire gauge or path length (supported AWG 10–30; max length 1200 in).

Shipped rulesets:

| Version | Behavior |
| --- | --- |
| `rules-2026.03` (default) | Structural and library-existence checks; light electrical; compatibility matrix rules off. |
| `rules-2026.04` | Stricter full-mode checks: compatibility junctions, pin/family/AWG, unsupported length/gauge, inactive and out-of-stock as errors. |

Projects can override severity for inactive, unreviewed, and out-of-stock parts. Submit-for-quote and state transitions require a non-stale full validation of the current snapshot (the stored snapshot hash must still match).

## Bill of materials and exports

`GET /v1/revisions/{revisionId}/bom` joins the snapshot with the catalog (including aliases). Lines cover connectors, contacts, wires (length in inches, with AWG/color), labels, sleeving, backshells, and strain reliefs. Each line is `resolved`, `not_found`, `inactive`, or `unreviewed`. The details page shows the same BOM.

Exports (`POST /v1/revisions/{revisionId}/exports`):

| Format | Content |
| --- | --- |
| JSON | Normalized revision payload plus BOM; SHA-256 content hash. |
| PDF | Template-style build document including BOM. |
| XLSX | Wirelist from `data/wirelist-template.xlsx` plus BOM. |

The same revision + ruleset + library yields the same artifact bytes (stable sort order, pin order, hashing). Jobs are stored in the database (`queued` → `processing` → `completed` / `failed`). Processing continues in the same request (Vercel `waitUntil` when hosted). Transient failures retry with backoff; permanent failures fail immediately. Redis holds an export job lock when configured. Maintenance recovers stale `processing` rows, runs due retries, and deletes artifacts older than `EXPORT_ARTIFACT_RETENTION_DAYS` (default 30).

Operations: `docs/export-operations.md`.

## Collaboration and lifecycle

- **RBAC.** Account role is `regular` or `admin` (`ADMIN_EMAILS` marks admins). Project membership roles are `viewer`, `editor`, `owner`, `supplier_reviewer`. Project-scoped APIs enforce membership.
- **Locks.** Pessimistic harness lock (`POST .../lock` and `.../unlock`). Redis is required on Vercel; local development can use an in-memory lock manager.
- **State machine.** Transitions are explicit, permission-checked, and written as audit events.
- **Submit for quote.** Creates a submission record tied to the revision and its validation run. Clients poll submission status; the details UI lists submissions for the harness.

## Runtime architecture

One API process implements design, library, rules, export, and auth. There is no separate microservice per concern.

```text
Browser (Next.js, apps/web, port 3001)
    same-origin /v1/*  →  Next.js route handler proxies to API_BASE_URL
Fastify API (src/, port 3000; on Vercel: api/index.ts)
    Store          sqlite | postgres | memory
    Auth store     matching backend
    Lock manager   redis | memory
    Artifacts      local files | S3 | Vercel Blob
    Export queue   DB-backed jobs + optional Redis job lock
```

| Concern | Local default | Hosted (Vercel Production and Test) |
| --- | --- | --- |
| API + web | `npm run dev:full` | Hobby: `cdt-api` + `cdt-web` on `main`. Pro Test/Prod: four projects including `cdt-*-test` |
| Store | SQLite (`data/app.db`) | PostgreSQL |
| Locks | Memory (Redis optional) | Redis |
| Artifacts | `artifacts/` on disk | S3 or Vercel Blob |
| Maintenance | Once at API listen; or `npm run maintenance` | Daily cron (04:00 UTC) → `/v1/internal/maintenance` |

On Vercel, `VERCEL=1` rejects SQLite, file artifacts, and in-memory locks. Hosted artifacts must be `s3` or `blob`. Postgres migrations live in `db/migrations/` and are applied with `npm run migrate` (never at function cold start). SQLite uses `npm run migrate:sqlite`. SQLite persists the in-memory store as a JSON blob; the relational parts schema applies to Postgres.

Health: `GET /v1/health` (store, locks, artifacts; 503 if a check fails). Metrics: `GET /v1/metrics` (in-process counters). Responses include `x-request-id` and `x-correlation-id`.

Deployment: `docs/deployment.md`.

## Browser routes

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | Auth |
| `/` | Projects (create, rename, reorder, delete) |
| `/projects/[projectId]` | Members, ruleset policy, harness list |
| `/harnesses/[harnessId]/canvas` | Graphical authoring |
| `/harnesses/[harnessId]/wirelist` | Pin/wire/contact/signal/label grid |
| `/harnesses/[harnessId]/revisions/new` | Structured revision builder |
| `/details/[revisionId]` | Validate, BOM, export, lock, submit for quote |
| `/library`, `/library/[componentId]` | Catalog search and part detail |
| `/admin` | Item database and compatibility manager |
| `/admin/datastores` | Library review queue |

## Repository layout

```text
src/                  Fastify API, domain, stores, export queue
api/                  Vercel serverless entry (`waitUntil` for background work)
apps/web/             Next.js UI
db/migrations/        PostgreSQL schema
scripts/              migrate, CPQ import, connector-compat import, maintenance
data/                 SQLite DB (local) and wirelist XLSX template
docs/                 Domain, item database, deployment, export operations
```

Notable domain modules: `src/domain/validator.ts`, `bom.ts`, `library.ts`, `compat-lookup.ts`, `exporter.ts`, `path-roles.ts`, `cpq-import/`.

## Tests

| Command | Coverage |
| --- | --- |
| `npm run test:validation` | Rules, BOM, compatibility, CPQ normalize/builders, export-queue, env/hosted config |
| `npm run test:api` | Auth, library bulk ingest, API flow, SQLite/Postgres store integration |
| `npm run test:web` | Frontend unit tests |
| `npm run test:web:e2e` | Playwright: auth, project/harness, canvas, wirelist, validate/export, submit, moderation, failure paths, full-cable journey |
| `npm test` | Validation + API + web unit suites |

The full-cable E2E spec (`apps/web/tests/e2e/full-cable.spec.ts`) walks register → project/harness → canvas topology and parts → wirelist pin/contact/signal/label detail → clean validation → library-resolved BOM → JSON/PDF/XLSX export → submit for quote.

## Related documentation

- Getting started and endpoint list: `README.md`
- Domain entities: `docs/domain-model.md`
- Item database schema and library API: `docs/item-database.md`
- Hosted Production/Test: `docs/deployment.md`
- Export jobs, retries, retention: `docs/export-operations.md`
- API surface (draft): `docs/api-spec.md`
