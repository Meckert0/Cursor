# Export Operations Runbook

Last updated: 2026-08-14

## Purpose

Operational guidance for the async export pipeline (JSON/PDF/XLSX), including failure handling, retries, scheduled recovery, artifact retention, and observability signals.

## Pipeline Overview

1. `POST /v1/revisions/{revisionId}/exports` creates an export row with `status=queued` and returns `202`.
2. The same request invocation continues processing (Vercel `waitUntil` in Production/Test; in-process promise locally):
   - `queued` -> `processing`
   - build artifact content
   - persist file/object via artifact storage
   - `completed` (with `contentHash` + `artifactUri`) or retry/`failed`
3. Concurrent workers take a Redis job lock when Redis is configured.
4. Clients poll `GET /v1/exports/{exportId}` (details UI auto-refreshes every 3s while pending).

Postgres (or the local store) is the job record. There is no in-memory queue and no `setTimeout` scheduler on Vercel.

## Observability Signals

### Request / correlation IDs

- Every API response includes `x-request-id` and `x-correlation-id`.
- Clients may supply either header; if omitted, the API generates a request ID and uses it as the correlation ID.
- Export enqueue propagates those IDs into worker logs so a failed export can be traced from the originating HTTP request.

### Worker log events

Look for structured log messages (Pino JSON) with these `msg` values:

| Message | Meaning |
|---------|---------|
| `export.enqueued` | Export accepted and queued |
| `export.attempt.start` | Worker began an attempt |
| `export.attempt.completed` | Attempt succeeded |
| `export.attempt.retry` | Transient failure; next attempt stored as `queued` + `nextAttemptAt` |
| `export.attempt.failed` | Final failure (permanent or attempts exhausted) |

Each event includes `exportId`, `revisionId`, `format`, `attemptCount`, `requestId`, and `correlationId`.

### Metrics endpoint

`GET /v1/metrics` returns **in-process** counters (per function instance; not cluster-wide):

- `metrics.validation` — count, errorCount, total/avg latency
- `metrics.exports` — enqueued, completed, failed, retried
- `metrics.locks` — acquired, contention

Use export success/failure rate from `completed` vs `failed`, and lock contention from `locks.contention`.

### Health endpoint

`GET /v1/health` returns component checks:

- `checks.store` — datastore reachability (`memory` / `sqlite` / `postgres`)
- `checks.lockManager` — lock backend (`memory` / `redis`)
- `checks.artifactBackend` — artifact storage (`file` / `s3` / `blob`)

Returns HTTP 503 when any check fails. On Vercel, store must be `postgres`, locks `redis`, and artifacts `s3` or `blob`.

### Tracing a failed export

1. Capture `x-request-id` / `x-correlation-id` from the `POST .../exports` response (or client logs).
2. Search API/worker logs for that `requestId` or `correlationId`.
3. Follow `export.attempt.*` events for the matching `exportId`.
4. Cross-check `GET /v1/exports/{exportId}` for `failureKind` / `errorMessage` and `GET /v1/metrics` for rising `exports.failed` / `exports.retried`.

## Failure Classification

| Kind | Behavior | Examples |
|------|----------|----------|
| `transient` | Retry with exponential backoff until `EXPORT_MAX_ATTEMPTS` | `ECONNRESET`, timeouts, 429/503-style storage errors |
| `permanent` | Fail immediately (no retry) | Missing revision, missing wirelist template |

Backoff delay is `EXPORT_RETRY_BASE_MS * 2^(attempt-1)`. Short delays retry in the same invocation (up to `EXPORT_SAME_REQUEST_RETRY_BUDGET_MS`). Longer delays stay `queued` until maintenance.

## Recovery and retention (scheduled)

Vercel functions do **not** recover or clean up on cold start.

`GET`/`POST /v1/internal/maintenance` (Authorization: `Bearer $CRON_SECRET`, or `x-cron-secret`) runs:

1. Reset `processing` rows older than `EXPORT_STALE_PROCESSING_MS` (default 5 minutes) back to `queued`.
2. Process due `queued` rows (`nextAttemptAt` missing or in the past).
3. Retention cleanup (see below).
4. Sync `ADMIN_EMAILS` onto existing users.

Vercel Cron hits this path once per day at 04:00 UTC (`0 4 * * *` in [`vercel.json`](../vercel.json)) on both the Test and Production API projects. Hobby may invoke it anytime within that hour. Interrupted exports can sit until the next daily run unless an operator calls this endpoint or `npm run maintenance`. Normal exports still finish in the same request via `waitUntil`.

Local `npm run dev` still runs recovery/retention once at listen time for developer convenience.

## Manual Retry

The details page "Retry export" button creates a **new** export job for the same format. It does not reset attempt counters on the failed row.

## Artifact Retention

Controlled by `EXPORT_ARTIFACT_RETENTION_DAYS` (default `30`).

- `> 0`: maintenance deletes `completed`/`failed` export rows whose `updatedAt` is older than the cutoff, and deletes their artifact files/objects when possible.
- `0` or negative: retention cleanup disabled.

On Vercel, artifacts live in S3 or Vercel Blob (separate Production and Test buckets, Blob stores, or key prefixes). Local file storage under `artifacts/` is development-only.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `EXPORT_MAX_ATTEMPTS` | `3` | Max processing attempts for transient failures |
| `EXPORT_RETRY_BASE_MS` | `500` | Base backoff delay |
| `EXPORT_ARTIFACT_RETENTION_DAYS` | `30` | Retention window; `0` disables cleanup |
| `EXPORT_STALE_PROCESSING_MS` | `300000` | Age after which `processing` is treated as interrupted |
| `EXPORT_SAME_REQUEST_RETRY_BUDGET_MS` | `10000` | Max in-invocation wait before leaving a retry for maintenance |
| `ARTIFACT_STORAGE_BACKEND` | `file` local / `s3` on Vercel | `file`, `s3`, or `blob` |
| `ARTIFACTS_DIR` | `./artifacts` | Local artifact root when using file storage |
| `BLOB_READ_WRITE_TOKEN` | unset | Required when `ARTIFACT_STORAGE_BACKEND=blob` (injected on Vercel when a Blob store is linked) |
| `BLOB_KEY_PREFIX` | unset | Optional pathname prefix for Blob objects |
| `CRON_SECRET` | unset | Required for `/v1/internal/maintenance` |
| `LOG_LEVEL` | `info` | Fastify/Pino log level for API + export worker |

## Operator Checklist

- Export stuck in `processing` on Vercel: wait for the next daily cron, or `npm run maintenance` / call `/v1/internal/maintenance`. Fresh `processing` rows are left alone until they are older than `EXPORT_STALE_PROCESSING_MS` (default 5 minutes).
- Repeated `failed` with `failureKind=transient`: inspect storage connectivity (S3 credentials or Blob token) and increase `EXPORT_MAX_ATTEMPTS` only if needed.
- Repeated `failed` with `failureKind=permanent`: fix the underlying data/template issue, then create a new export.
- Artifact growth: confirm retention is enabled and that cron/maintenance is running in that environment.
- Cannot correlate a failure: confirm the client logged `x-request-id` / `x-correlation-id`, then search worker logs for `export.attempt.failed`.
- Health degraded: call `GET /v1/health` and inspect which of `store` / `lockManager` / `artifactBackend` is not `ok`.

## Postgres Migration

Apply `db/migrations/022_export_reliability.sql` (via `npm run migrate`) before relying on attempt/retention metadata in Postgres mode. Apply migrations to Test first, then Production. Never run migrations inside a Vercel function cold start.

Deployment topology: `docs/deployment.md`.
