-- Per-field flags controlling whether a field appears on the add-connector form and in the connector search popup.

ALTER TABLE library_field_definitions
  ADD COLUMN IF NOT EXISTS show_on_add_form BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_in_search BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed sensible defaults for built-in identifying fields so the connector add form and search work out of the box.
UPDATE library_field_definitions
SET show_on_add_form = TRUE
WHERE key IN ('partNumber', 'family');

UPDATE library_field_definitions
SET show_in_search = TRUE
WHERE key IN ('partNumber', 'family', 'description');
