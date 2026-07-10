ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS artifact_uri TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE exports
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE exports
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE exports
  DROP CONSTRAINT IF EXISTS exports_status_check;

ALTER TABLE exports
  ADD CONSTRAINT exports_status_check
  CHECK (status IN ('queued', 'processing', 'completed', 'failed'));

ALTER TABLE exports
  ALTER COLUMN content_hash DROP NOT NULL;
