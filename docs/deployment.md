# Production and Test deployments (Vercel)

This app is deployed as two **structurally identical** environments. The only differences are separate resources and URLs.

Workflow: **make changes → deploy Test → verify → promote the same commit to Production.**

For a personal Hobby trial, skip Test and use the [Hobby](#hobby-personal) two-project layout instead.

## Hobby (personal)

Hobby is personal, non-commercial use only. Company or paid work needs Pro.

Use **two** Vercel projects, both on `main`. Hobby has one concurrent build; do not create `cdt-web-test` / `cdt-api-test` until you are on Pro.

1. **cdt-web** — Root Directory `apps/web`, Framework Next.js, Production branch `main`
2. **cdt-api** — Root Directory `.` (repo root), Framework **Other**, Production branch `main`

Leave **Vercel Deployment Protection off** on the API. Browser `/v1/...` calls go to a Next.js route handler ([`apps/web/src/app/v1/[[...path]]/route.ts`](../apps/web/src/app/v1/[[...path]]/route.ts)) that proxies to `API_BASE_URL` at runtime. Protection on the API would 401 that proxy and server-side fetches. App auth is the `cdt_session` cookie.

Hobby API env:

- `STORE_BACKEND=postgres`
- `DATABASE_URL` — pooled Postgres URL (for example Neon)
- `REDIS_URL` — Redis protocol URL (`rediss://…` for TLS, for example Upstash)
- `ARTIFACT_STORAGE_BACKEND=blob`
- `BLOB_READ_WRITE_TOKEN` — injected when you link a Blob store to `cdt-api`
- `BLOB_KEY_PREFIX` — optional pathname namespace
- `CRON_SECRET`
- `ADMIN_EMAILS`, `SESSION_TTL_HOURS`, `LOG_LEVEL`, export knobs (`EXPORT_*`)

Hobby web env (runtime; used by the `/v1` proxy and server components):

- `API_BASE_URL` — the `cdt-api` production URL, no trailing slash

Maintenance cron is once per day at 04:00 UTC (`0 4 * * *`). Hobby may fire anytime in that hour. Interrupted exports can wait until the next daily run unless you call `/v1/internal/maintenance` or `npm run maintenance`. In-request exports still finish via `waitUntil`.

## Topology

Each Production/Test environment has:

- Next.js frontend
- Fastify API (Vercel serverless function)
- PostgreSQL
- Redis
- S3-compatible artifact storage **or** Vercel Blob

| Resource | Production | Test | Local |
|---|---|---|---|
| Frontend | `cdt-web` (`main`) | `cdt-web-test` (`test`) | `npm run dev:web` |
| API | `cdt-api` (`main`) | `cdt-api-test` (`test`) | `npm run dev` |
| `STORE_BACKEND` | `postgres` | `postgres` | `sqlite` (default) |
| `DATABASE_URL` | prod DB | test DB | unused unless postgres |
| `REDIS_URL` | prod Redis | test Redis | optional |
| `ARTIFACT_STORAGE_BACKEND` | `s3` or `blob` | `s3` or `blob` | `file` |
| `S3_BUCKET` / `S3_KEY_PREFIX` | prod | test | unused |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_KEY_PREFIX` | prod Blob store | test Blob store | unused |
| `API_BASE_URL` (web) | prod API URL | test API URL | `http://localhost:3000` |
| `CRON_SECRET` | prod secret | test secret | unused |

Do not use SQLite, local files, or in-memory locks on Vercel. `VERCEL=1` rejects those backends at startup.

Do not use Preview deployments as Test. Test is its own Vercel project whose Production branch is `test`, so cron, URLs, and function settings match Production.

## Vercel projects

Create four projects from this repo (same git remote, identical settings, different env values):

1. **cdt-web** — Root Directory `apps/web`, Production branch `main`
2. **cdt-web-test** — Root Directory `apps/web`, Production branch `test`
3. **cdt-api** — Root Directory `.` (repo root), Production branch `main`, Framework **Other**
4. **cdt-api-test** — Root Directory `.`, Production branch `test`, Framework **Other**

API projects use the root [`vercel.json`](../vercel.json): catch-all rewrite to `/api`, 300s `maxDuration`, `data/**` included for the wirelist XLSX template, SQLite sources excluded from the function bundle, and a daily cron (`0 4 * * *` UTC) to `/v1/internal/maintenance`. Hobby may invoke that job anytime within the 04:00 hour.

The web app does not depend on the API package. Browser calls use same-origin `/v1/...`, proxied at runtime to `API_BASE_URL`, so the `cdt_session` cookie stays on the frontend origin.

## Environment variables

Set the **same keys** on Test and Production with different values.

### API (`cdt-api` / `cdt-api-test`)

- `STORE_BACKEND=postgres`
- `DATABASE_URL` — use the provider’s **pooled** connection string
- `REDIS_URL` — required; optional `REDIS_KEY_PREFIX` if one Redis is namespaced
- `ARTIFACT_STORAGE_BACKEND=s3` or `blob` (hosted default is `s3`)
- For `s3`: `S3_BUCKET`, `S3_REGION`, and credentials/`S3_ENDPOINT` as needed; `S3_KEY_PREFIX` optional; `S3_SIGNED_DOWNLOADS=true` (recommended)
- For `blob`: `BLOB_READ_WRITE_TOKEN` (injected when a Blob store is linked); `BLOB_KEY_PREFIX` optional
- `CRON_SECRET` — Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
- `ADMIN_EMAILS`, `SESSION_TTL_HOURS`, `LOG_LEVEL`, export knobs (`EXPORT_*`)

### Web (`cdt-web` / `cdt-web-test`)

- `API_BASE_URL` — that environment’s Fastify URL (no trailing slash). Needed at runtime for the `/v1` proxy and server-side fetches.

## Migrations

Migrations are **manual**. They must not run when a Vercel function starts.

1. Apply to Test: `DATABASE_URL=<test> npm run migrate`
2. Deploy and verify Test
3. Apply to Production: `DATABASE_URL=<prod> npm run migrate`
4. Promote the same commit to Production (`test` → `main`)

## Maintenance

Export recovery, due retries, artifact retention, and `ADMIN_EMAILS` role sync run from:

- Vercel Cron: `GET /v1/internal/maintenance` once per day at 04:00 UTC (both API projects; Hobby may fire anytime in that hour)
- Ops: `npm run maintenance` (uses `DATABASE_URL` and the same create-app wiring)

Interrupted exports stay `processing` until they are older than `EXPORT_STALE_PROCESSING_MS` (default 5 minutes), then the next maintenance run requeues them. With a daily cron that can be up to ~24 hours unless you trigger maintenance manually.

`/v1/metrics` is in-process and per function instance; it is not cluster-wide.

## Promote workflow

1. Merge the change to the `test` branch (deploys `cdt-web-test` and `cdt-api-test`).
2. Run Test migrations if the change includes SQL.
3. Verify Test (health, login, canvas/wirelist, export, locks).
4. Merge `test` to `main` (deploys Production).
5. Run Production migrations if needed, **after** Test verification.
