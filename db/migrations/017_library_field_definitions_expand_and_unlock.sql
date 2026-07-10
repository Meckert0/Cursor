INSERT INTO library_field_definitions (id, category, key, label, value_type, is_system, is_visible_in_viewer, created_by_user_id)
VALUES
  ('fld-connector-compatibilityhints', 'connector', 'compatibilityHints', 'Compatibility hints', 'text', TRUE, FALSE, 'system-user'),
  ('fld-wire-description', 'wire', 'description', 'Description', 'text', TRUE, FALSE, 'system-user'),
  ('fld-wire-compatibilityhints', 'wire', 'compatibilityHints', 'Compatibility hints', 'text', TRUE, FALSE, 'system-user'),
  ('fld-backshell-compatibilityhints', 'backshell', 'compatibilityHints', 'Compatibility hints', 'text', TRUE, FALSE, 'system-user')
ON CONFLICT (category, key) DO UPDATE
SET
  label = EXCLUDED.label,
  value_type = EXCLUDED.value_type,
  is_visible_in_viewer = EXCLUDED.is_visible_in_viewer,
  updated_at = NOW();
