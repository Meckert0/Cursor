-- Expand library categories to the new canonical item type set and clean up
-- legacy connector data while preserving wire/backshell entries.

DELETE FROM project_library_overrides
WHERE category = 'connector'
   OR base_component_id IN (
     SELECT id FROM library_components WHERE category = 'connector'
   );

DELETE FROM library_components
WHERE category = 'connector';

DELETE FROM library_field_definitions
WHERE category = 'connector';

ALTER TABLE library_components
  DROP CONSTRAINT IF EXISTS library_components_category_check;
ALTER TABLE library_components
  DROP CONSTRAINT IF EXISTS chk_library_components_category_allowed;
ALTER TABLE library_components
  ADD CONSTRAINT chk_library_components_category_allowed
  CHECK (
    category IN (
      'contact',
      'wire',
      'sleeve-tube-braid',
      'label',
      'backshell',
      'strain-relief',
      'module',
      'splice'
    )
  );

ALTER TABLE project_library_overrides
  DROP CONSTRAINT IF EXISTS project_library_overrides_category_check;
ALTER TABLE project_library_overrides
  DROP CONSTRAINT IF EXISTS chk_project_library_overrides_category_allowed;
ALTER TABLE project_library_overrides
  ADD CONSTRAINT chk_project_library_overrides_category_allowed
  CHECK (
    category IN (
      'contact',
      'wire',
      'sleeve-tube-braid',
      'label',
      'backshell',
      'strain-relief',
      'module',
      'splice'
    )
  );

ALTER TABLE library_field_definitions
  DROP CONSTRAINT IF EXISTS library_field_definitions_category_check;
ALTER TABLE library_field_definitions
  DROP CONSTRAINT IF EXISTS chk_library_field_definitions_category_allowed;
ALTER TABLE library_field_definitions
  ADD CONSTRAINT chk_library_field_definitions_category_allowed
  CHECK (
    category IN (
      'contact',
      'wire',
      'sleeve-tube-braid',
      'label',
      'backshell',
      'strain-relief',
      'module',
      'splice'
    )
  );

INSERT INTO library_field_definitions (
  id,
  category,
  key,
  label,
  value_type,
  is_system,
  is_visible_in_viewer,
  created_by_user_id
)
VALUES
  ('fld-contact-partnumber', 'contact', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-contact-description', 'contact', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-sleeve-tube-braid-partnumber', 'sleeve-tube-braid', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-sleeve-tube-braid-description', 'sleeve-tube-braid', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-label-partnumber', 'label', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-label-description', 'label', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-strain-relief-partnumber', 'strain-relief', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-strain-relief-description', 'strain-relief', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-module-partnumber', 'module', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-module-description', 'module', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-splice-partnumber', 'splice', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-splice-description', 'splice', 'description', 'Description', 'text', TRUE, TRUE, 'system-user')
ON CONFLICT (category, key) DO UPDATE
SET
  label = EXCLUDED.label,
  value_type = EXCLUDED.value_type,
  is_visible_in_viewer = EXCLUDED.is_visible_in_viewer,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();
