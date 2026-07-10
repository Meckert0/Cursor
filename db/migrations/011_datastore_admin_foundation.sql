-- Phase 7 foundation: datastore ingestion/admin persistence model.
-- Adds durable tables for library catalog ingestion, job tracking, Redis companion metadata,
-- and object artifact manifests with provenance/review invariants.

CREATE TABLE IF NOT EXISTS library_components (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('connector', 'wire', 'backshell')),
  family TEXT NOT NULL,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  stock_status TEXT NOT NULL CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  compatibility_hints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  entered_by_user_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  last_edited_by_user_id TEXT NOT NULL,
  last_edited_at TIMESTAMPTZ NOT NULL,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_library_components_reviewed_consistency
    CHECK (is_reviewed = FALSE OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT chk_library_components_archive_consistency
    CHECK (is_archived = FALSE OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_library_components_active_part
  ON library_components(part_number, family, category)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_library_components_category_family
  ON library_components(category, family);

CREATE INDEX IF NOT EXISTS idx_library_components_active_stock
  ON library_components(is_active, stock_status);

CREATE TABLE IF NOT EXISTS project_library_overrides (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  base_component_id TEXT REFERENCES library_components(id),
  category TEXT NOT NULL CHECK (category IN ('connector', 'wire', 'backshell')),
  family TEXT NOT NULL,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  stock_status TEXT NOT NULL CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  compatibility_hints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  entered_by_user_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_project_library_overrides_reviewed_consistency
    CHECK (is_reviewed = FALSE OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT chk_project_library_overrides_archive_consistency
    CHECK (is_archived = FALSE OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_library_overrides_active_part
  ON project_library_overrides(project_id, part_number, family, category)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_project_library_overrides_project_category_family
  ON project_library_overrides(project_id, category, family);

CREATE TABLE IF NOT EXISTS datastore_ingest_jobs (
  id UUID PRIMARY KEY,
  target_store TEXT NOT NULL CHECK (target_store IN ('postgres', 'redis', 'object_storage')),
  target_entity TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL,
  idempotency_key TEXT,
  requested_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_datastore_ingest_jobs_idempotency
  ON datastore_ingest_jobs(target_store, target_entity, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_datastore_ingest_jobs_status_created_at
  ON datastore_ingest_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_datastore_ingest_jobs_requested_by_created_at
  ON datastore_ingest_jobs(requested_by_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS datastore_ingest_job_results (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES datastore_ingest_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  entity_key TEXT,
  result_status TEXT NOT NULL CHECK (result_status IN ('validated', 'committed', 'failed', 'skipped')),
  error_code TEXT,
  error_message TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_datastore_ingest_job_results_job_row
  ON datastore_ingest_job_results(job_id, row_number);

CREATE INDEX IF NOT EXISTS idx_datastore_ingest_job_results_job_status
  ON datastore_ingest_job_results(job_id, result_status);

CREATE TABLE IF NOT EXISTS redis_operational_namespaces (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

INSERT INTO redis_operational_namespaces (name, description)
VALUES
  ('lock_seed', 'User-managed lock seed values for bootstrap/recovery workflows'),
  ('queue_replay_marker', 'Queue replay pointers for controlled replay operations'),
  ('cache_warmup', 'Warmup key hints for controlled cache prepopulation')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS redis_operational_entries (
  id UUID PRIMARY KEY,
  namespace TEXT NOT NULL REFERENCES redis_operational_namespaces(name),
  redis_key TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL CHECK (ttl_seconds BETWEEN 1 AND 2592000),
  payload_hash TEXT,
  entered_by_user_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_redis_operational_entries_reviewed_consistency
    CHECK (is_reviewed = FALSE OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT chk_redis_operational_entries_archive_consistency
    CHECK (is_archived = FALSE OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_redis_operational_entries_active_key
  ON redis_operational_entries(namespace, redis_key)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_redis_operational_entries_namespace_entered_at
  ON redis_operational_entries(namespace, entered_at DESC);

CREATE TABLE IF NOT EXISTS artifact_manifests (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT NOT NULL,
  retention_class TEXT NOT NULL CHECK (retention_class IN ('standard', 'compliance', 'temporary')),
  source_type TEXT NOT NULL CHECK (source_type IN ('export', 'upload', 'import_bundle', 'reference_doc')),
  entered_by_user_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_artifact_manifests_reviewed_consistency
    CHECK (is_reviewed = FALSE OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT chk_artifact_manifests_archive_consistency
    CHECK (is_archived = FALSE OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_manifests_active_object
  ON artifact_manifests(bucket, object_key)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_artifact_manifests_project_entered_at
  ON artifact_manifests(project_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_manifests_retention_archived
  ON artifact_manifests(retention_class, is_archived);

CREATE INDEX IF NOT EXISTS idx_artifact_manifests_checksum
  ON artifact_manifests(checksum_sha256);
