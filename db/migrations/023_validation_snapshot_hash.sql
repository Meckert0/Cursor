ALTER TABLE validation_runs
  ADD COLUMN IF NOT EXISTS snapshot_hash TEXT;

UPDATE validation_runs
SET snapshot_hash = ''
WHERE snapshot_hash IS NULL;

ALTER TABLE validation_runs
  ALTER COLUMN snapshot_hash SET NOT NULL,
  ALTER COLUMN snapshot_hash SET DEFAULT '';
