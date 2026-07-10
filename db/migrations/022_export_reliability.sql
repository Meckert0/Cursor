ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_kind TEXT;

ALTER TABLE exports
  DROP CONSTRAINT IF EXISTS exports_failure_kind_check;

ALTER TABLE exports
  ADD CONSTRAINT exports_failure_kind_check
  CHECK (failure_kind IS NULL OR failure_kind IN ('transient', 'permanent'));

CREATE INDEX IF NOT EXISTS idx_exports_status_updated_at ON exports(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_exports_status_next_attempt_at ON exports(status, next_attempt_at);
