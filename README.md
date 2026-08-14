# Cable Design Tool Backend Starter

This repository now includes a runnable TypeScript API starter aligned with the CDT architecture docs in `docs/`.

Current project roadmap: `docs/roadmap.md` (single canonical source).
Vercel Production/Test hosting: `docs/deployment.md`.

## Run the local site

Paste this into the terminal:

```
cd "C:\Users\meckert\Documents\New project"
npm install
npm --prefix apps/web install
copy .env.example .env
copy apps\web\.env.example apps\web\.env.local
New-Item -ItemType Directory -Force -Path .\data | Out-Null
npm run migrate:sqlite
npm run dev:full
```

Then open this link in the browser:

```
http://localhost:3001
```

The API loads `.env` on startup. **SQLite is the default durable store for local development** (`STORE_BACKEND=sqlite`, `data/app.db`). Item catalog, projects, harnesses, and auth survive restarts. Use `STORE_BACKEND=memory` only for ephemeral tests. Vercel Production and Test always use PostgreSQL, Redis, and S3 or Vercel Blob — see `docs/deployment.md`.

### Backup local data

With the default SQLite + file-artifact setup, durable state lives in:

- `data/app.db` (projects, harnesses, revisions, auth, library / item database)
- `artifacts/` (export files when `ARTIFACT_STORAGE_BACKEND=file`)

Copy those paths to back up or move a local install.
## What is implemented

- Fastify API with versioned routes under `/v1`
- Next.js browser frontend shell in `apps/web` (projects -> harness creation -> revision builder -> validate/export)
- Store backend selection:
  - `STORE_BACKEND=sqlite` (**default** — durable local file via `SQLITE_PATH`, default `./data/app.db`)
  - `STORE_BACKEND=postgres` (durable relational persistence)
  - `STORE_BACKEND=memory` (ephemeral; for tests only — data is lost on restart)
- Auth/session endpoints with username + email/password registration, email/password login, and HTTP-only session cookie flow (Next.js sets `cdt_session`)
- Durable auth for `sqlite` and `postgres` store backends (`memory` auth is ephemeral)
- Queued JSON/PDF/XLSX export processing with deterministic content hashing, request-scoped processing (Vercel `waitUntil` in hosted environments), transient retry/backoff, and scheduled artifact retention cleanup
- Template-style PDF/XLSX artifact rendering in the export worker
- Configurable artifact storage backend:
  - `ARTIFACT_STORAGE_BACKEND=file` with local directory via `ARTIFACTS_DIR` (local only)
  - `ARTIFACT_STORAGE_BACKEND=s3` with S3-compatible object storage
  - `ARTIFACT_STORAGE_BACKEND=blob` with Vercel Blob (**Hobby**; requires `BLOB_READ_WRITE_TOKEN`)
- Role-based endpoint authorization (`viewer/editor/owner/supplier_reviewer`)
- Role-based endpoint authorization (`viewer/editor/owner/supplier_reviewer`)
- Ruleset registry with active version selection policy
- Per-project ruleset policy (default + allow-list enforcement)
- Project membership enforcement on all project-scoped resources
- Lock/unlock workflow with Redis support (required on Vercel; falls back to memory lock manager only for local development)
- Revision validation with ruleset/mode-gated topology, electrical, compatibility, and manufacturability checks; submit/state transitions require a non-stale validation of the current snapshot
- Library catalog, ingest/moderation, and admin console APIs
- Parts-model catalog (`parts` + typed category extensions + aliases + compatibility junctions); catalog starts empty (no starter seed) — ingest items via admin or API; data persists when using sqlite/postgres
- PostgreSQL migrations in `db/migrations/` (including `027_parts_model.sql` and `028_parts_model_cpq_readiness.sql`)

## Quick start

1. Copy env template:

   `copy .env.example .env`

2. Install dependencies:

   `npm install`

3. Bootstrap SQLite auth tables (default path `./data/app.db`):

   `npm run migrate:sqlite`

4. Run development server:

   `npm run dev`

   Or run backend + frontend together:

   `npm run dev:full`

5. Health check:

   `GET http://localhost:3000/v1/health`

   Returns store / lock / artifact backend status. Metrics: `GET http://localhost:3000/v1/metrics`.

## PostgreSQL mode

1. Set env:

   - `STORE_BACKEND=postgres`
   - `DATABASE_URL=postgres://...`
   - `ARTIFACT_STORAGE_BACKEND=file` and `ARTIFACTS_DIR=./artifacts` (or set S3 values below)
   - `ENABLE_LEGACY_HEADER_AUTH=false` (default; set `true` only for temporary header-based auth)
   - `ADMIN_EMAILS=meckert@vpc.com` (comma-separated admin account emails)
   - `REQUIRE_ROLE_HEADER=false` (only relevant when legacy header auth is enabled)
   - `REQUIRE_USER_HEADER=false` (only relevant when legacy header auth is enabled)

2. Apply all migrations in `db/migrations/` to your database (includes auth tables, parts model `027`, and CPQ readiness `028`).

3. Start server. The app validates DB connectivity at startup. The item catalog starts empty until you ingest or create parts (no automatic starter seed). Hosted Vercel environments skip startup recovery/retention; run `npm run maintenance` or wait for cron.

4. Optional: run SQL migrations automatically:

   `npm run migrate`

   Apply the same migrations to Test first, then Production. Do not run migrations when a Vercel function starts.

## SQLite mode

SQLite is the **default** when `STORE_BACKEND` is unset.

1. Optional env overrides:

   - `STORE_BACKEND=sqlite`
   - `SQLITE_PATH=./data/app.db` (default if unset)

2. Apply SQLite migrations:

   `npm run migrate:sqlite`

3. Start server. Project/harness data, auth sessions, and the item catalog persist in the SQLite file across restarts.

## S3-compatible artifact storage

Set these env vars to enable object storage:

- `ARTIFACT_STORAGE_BACKEND=s3`
- `S3_BUCKET=<bucket-name>` (required)
- `S3_REGION=us-east-1` (default shown)
- `S3_ENDPOINT=<https://...>` for S3-compatible providers (optional)
- `S3_FORCE_PATH_STYLE=true` for MinIO/local stacks if needed
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` when not using ambient credentials
- `S3_KEY_PREFIX=cdt` to namespace object keys (optional)
- `S3_PUBLIC_BASE_URL=https://cdn.example.com` to return HTTP artifact URLs (optional)
- `S3_SIGNED_DOWNLOADS=true` to return presigned `downloadUrl` for `s3://` artifacts
- `S3_SIGNED_DOWNLOAD_TTL_SECONDS=900` to control link lifetime

## Vercel Blob artifact storage

On Hobby, link a Blob store to the API project and set:

- `ARTIFACT_STORAGE_BACKEND=blob`
- `BLOB_READ_WRITE_TOKEN` (injected automatically when the store is linked)
- `BLOB_KEY_PREFIX=cdt` to namespace pathnames (optional)

Blobs are stored as private objects under `exports/{exportId}.{ext}`. Download links come from Blob `head()` `downloadUrl`. Hosted default remains `s3` unless you set `blob`.

## Key endpoints

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `POST /v1/projects`
- `GET /v1/projects`
- `PATCH /v1/projects/{projectId}`
- `POST /v1/projects/{projectId}/harnesses`
- `GET /v1/projects/{projectId}/harnesses`
- `GET /v1/projects/{projectId}/ruleset-policy`
- `PUT /v1/projects/{projectId}/ruleset-policy`
- `GET /v1/projects/{projectId}/members`
- `PUT /v1/projects/{projectId}/members/{userId}`
- `GET /v1/harnesses/{harnessId}`
- `PATCH /v1/harnesses/{harnessId}`
- `DELETE /v1/harnesses/{harnessId}`
- `GET /v1/harnesses/{harnessId}/revisions`
- `GET /v1/rulesets`
- `GET /v1/rulesets/active`
- `PUT /v1/rulesets/{version}`
- `POST /v1/harnesses/{harnessId}/revisions`
- `GET /v1/revisions/{revisionId}`
- `PATCH /v1/revisions/{revisionId}/snapshot` (requires `expectedSnapshotHash`; returns 409 on mismatch)
- `POST /v1/revisions/{revisionId}/validate`
- `GET /v1/revisions/{revisionId}/bom`
- `GET /v1/validations/{validationRunId}`
- `POST /v1/revisions/{revisionId}/exports`
- `GET /v1/revisions/{revisionId}/exports`
- `GET /v1/exports/{exportId}`
- `POST /v1/harnesses/{harnessId}/state-transitions`
- `GET /v1/harnesses/{harnessId}/audit-events`
- `POST /v1/harnesses/{harnessId}/submit-for-quote`
- `GET /v1/submissions/{submissionId}`
- `GET /v1/harnesses/{harnessId}/submissions`
- `POST /v1/harnesses/{harnessId}/lock`
- `POST /v1/harnesses/{harnessId}/unlock`
- `GET /v1/library/components`
- `GET /v1/library/components/archived`
- `GET /v1/library/components/{componentId}`
- `POST /v1/library/components/ingest`
- `GET /v1/library/components/review-queue`
- `POST /v1/library/components/{componentId}/review`
- `POST /v1/library/components/{componentId}/archive`
- `POST /v1/library/components/{componentId}/restore`
- `GET /v1/ui/page-descriptions`
- `GET /v1/admin/users`
- `GET /v1/admin/projects-overview`
- `PUT /v1/admin/ui/page-descriptions`
- `GET /v1/internal/maintenance` (cron; requires `CRON_SECRET`)
- `POST /v1/internal/maintenance` (same as GET)

## Tests

- `npm run test:validation` for domain validation rules, BOM builder, and export-queue reliability (unit + known-good/known-bad fixtures)
- `npm run test:api` for API integration flow
- `npm test` to run both suites
- `npm run lint:web` for frontend lint checks

Export operations runbook: `docs/export-operations.md`

## Frontend app (`apps/web`)

- Frontend dev URL: `http://localhost:3001`
- Configure frontend API connection in `apps/web/.env.local`:
  - `API_BASE_URL=http://localhost:3000` (server-side fetches and the `/v1` proxy)
  - Browser calls use same-origin `/v1/...` so the session cookie stays on the frontend origin
  - `API_LEGACY_AUTH_HEADERS=false` (set `true` only for temporary legacy header auth testing)

## Roadmap

For current project status, active priorities, deferred scope, and MVP exit criteria, use `docs/roadmap.md`.

Hosted Production/Test setup: `docs/deployment.md`.
Export operations: `docs/export-operations.md`.
