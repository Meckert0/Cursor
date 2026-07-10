-- Add optional wire filtering metadata for catalog selection UX.
ALTER TABLE library_components
  ADD COLUMN IF NOT EXISTS awg TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT;

CREATE INDEX IF NOT EXISTS idx_library_components_wire_awg
  ON library_components(awg)
  WHERE category = 'wire' AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_library_components_wire_color
  ON library_components(color)
  WHERE category = 'wire' AND is_archived = FALSE;
