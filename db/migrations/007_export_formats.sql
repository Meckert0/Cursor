ALTER TABLE exports
  ALTER COLUMN artifact DROP NOT NULL;

ALTER TABLE exports
  DROP CONSTRAINT IF EXISTS exports_format_check;

ALTER TABLE exports
  ADD CONSTRAINT exports_format_check
  CHECK (format IN ('json', 'pdf', 'xlsx'));
