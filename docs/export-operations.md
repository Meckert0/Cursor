# Export Operations Runbook

Last updated: 2026-07-10

## Purpose

Operational guidance for the async export pipeline (JSON/PDF/XLSX), including failure handling, retries, startup recovery, artifact retention, and observability signals.

## Pipeline Overview

1. `POST /v1/revisions/{revisionId}/exports` creates an export row with `status=queued` and enqueues it in-process.
2. `ExportQueueService` processes jobs sequentially:
   - `queued` -> `processing`
   - build artifact content
   - persist file/object via artifact storage
   - `completed` (with `contentHash` + `artifactUri`) or retry/`failed`
3. Clients poll `GET /v1/exports/{exportId}` (details UI auto-refreshes every 3s while pending).

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
| `export.attempt.retry` | Transient failure; next attempt scheduled |
| `export.attempt.failed` | Final failure (permanent or attempts exhausted) |

Each event includes `exportId`, `revisionId`, `format`, `attemptCount`, `requestId`, and `correlationId`.

### Metrics endpoint

`GET /v1/metrics` returns in-process counters:

- `metrics.validation` — count, errorCount, total/avg latency
- `metrics.exports` — enqueued, completed, failed, retried
- `metrics.locks` — acquired, contention

Use export success/failure rate from `completed` vs `failed`, and lock contention from `locks.contention`.

### Health endpoint

`GET /v1/health` returns component checks:

- `checks.store` — datastore reachability (`memory` / `sqlite` / `postgres`)
- `checks.lockManager` — lock backend (`memory` / `redis`)
- `checks.artifactBackend` — artifact storage (`file` / `s3`)

Returns HTTP 503 when any check fails.

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

Backoff delay is `EXPORT_RETRY_BASE_MS * 2^(attempt-1)`.

## Startup Recovery

On API process start:

1. Any `processing` rows are reset to `queued` (interrupted mid-job).
2. All `queued` rows are re-scheduled (honoring `nextAttemptAt` when set).
3. Retention cleanup runs once (see below).

This covers process crashes and deploys without requiring an external queue broker.

## Manual Retry

The details page "Retry export" button creates a **new** export job for the same format. It does not reset attempt counters on the failed row.

## Artifact Retention

Controlled by `EXPORT_ARTIFACT_RETENTION_DAYS` (default `30`).

- `> 0`: on startup, delete `completed`/`failed` export rows whose `updatedAt` is older than the cutoff, and delete their artifact files/objects when possible.
- `0` or negative: retention cleanup disabled.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `EXPORT_MAX_ATTEMPTS` | `3` | Max processing attempts for transient failures |
| `EXPORT_RETRY_BASE_MS` | `500` | Base backoff delay |
| `EXPORT_ARTIFACT_RETENTION_DAYS` | `30` | Retention window; `0` disables cleanup |
| `ARTIFACT_STORAGE_BACKEND` | `file` | `file` or `s3` |
| `ARTIFACTS_DIR` | `./artifacts` | Local artifact root when using file storage |
| `LOG_LEVEL` | `info` | Fastify/Pino log level for API + export worker |

## Operator Checklist

- Export stuck in `processing` after restart: confirm API started successfully; recovery should requeue automatically.
- Repeated `failed` with `failureKind=transient`: inspect storage connectivity (disk permissions / S3 credentials) and increase `EXPORT_MAX_ATTEMPTS` only if needed.
- Repeated `failed` with `failureKind=permanent`: fix the underlying data/template issue, then create a new export.
- Disk growth under `artifacts/exports`: confirm retention is enabled and restart (or call retention path after future admin endpoint if added).
- Cannot correlate a failure: confirm the client logged `x-request-id` / `x-correlation-id`, then search worker logs for `export.attempt.failed`.
- Health degraded: call `GET /v1/health` and inspect which of `store` / `lockManager` / `artifactBackend` is not `ok`.

## Postgres Migration

Apply `db/migrations/022_export_reliability.sql` (via `npm run migrate`) before relying on attempt/retention metadata in Postgres mode.
