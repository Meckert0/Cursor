ALTER TABLE library_components
ADD COLUMN IF NOT EXISTS last_edited_by_user_id TEXT;

ALTER TABLE library_components
ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

UPDATE library_components
SET
  last_edited_by_user_id = COALESCE(last_edited_by_user_id, entered_by_user_id),
  last_edited_at = COALESCE(last_edited_at, updated_at);

ALTER TABLE library_components
ALTER COLUMN last_edited_by_user_id SET NOT NULL;

ALTER TABLE library_components
ALTER COLUMN last_edited_at SET NOT NULL;
