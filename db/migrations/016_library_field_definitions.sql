CREATE TABLE IF NOT EXISTS library_field_definitions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('connector', 'wire', 'backshell')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text' CHECK (value_type = 'text'),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible_in_viewer BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT NOT NULL DEFAULT 'system-user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, key)
);

CREATE TABLE IF NOT EXISTS library_component_custom_values (
  component_id TEXT NOT NULL REFERENCES library_components(id) ON DELETE CASCADE,
  field_definition_id TEXT NOT NULL REFERENCES library_field_definitions(id) ON DELETE CASCADE,
  value_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (component_id, field_definition_id)
);

INSERT INTO library_field_definitions (id, category, key, label, value_type, is_system, is_visible_in_viewer, created_by_user_id)
VALUES
  ('fld-connector-partnumber', 'connector', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-family', 'connector', 'family', 'Family', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-description', 'connector', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-isactive', 'connector', 'isActive', 'Active', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-stockstatus', 'connector', 'stockStatus', 'Stock status', 'text', TRUE, FALSE, 'system-user'),
  ('fld-connector-createdbyuserid', 'connector', 'createdByUserId', 'Created by', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-createdat', 'connector', 'createdAt', 'Created at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-isreviewed', 'connector', 'isReviewed', 'Reviewed', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-reviewedbyuserid', 'connector', 'reviewedByUserId', 'Reviewed by', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-reviewedat', 'connector', 'reviewedAt', 'Reviewed at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-lasteditedbyuserid', 'connector', 'lastEditedByUserId', 'Last editor', 'text', TRUE, TRUE, 'system-user'),
  ('fld-connector-lasteditedat', 'connector', 'lastEditedAt', 'Last edited at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-partnumber', 'wire', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-family', 'wire', 'family', 'Family', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-awg', 'wire', 'awg', 'AWG', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-color', 'wire', 'color', 'Color', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-isactive', 'wire', 'isActive', 'Active', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-stockstatus', 'wire', 'stockStatus', 'Stock status', 'text', TRUE, FALSE, 'system-user'),
  ('fld-wire-createdbyuserid', 'wire', 'createdByUserId', 'Created by', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-createdat', 'wire', 'createdAt', 'Created at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-isreviewed', 'wire', 'isReviewed', 'Reviewed', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-reviewedbyuserid', 'wire', 'reviewedByUserId', 'Reviewed by', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-reviewedat', 'wire', 'reviewedAt', 'Reviewed at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-lasteditedbyuserid', 'wire', 'lastEditedByUserId', 'Last editor', 'text', TRUE, TRUE, 'system-user'),
  ('fld-wire-lasteditedat', 'wire', 'lastEditedAt', 'Last edited at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-partnumber', 'backshell', 'partNumber', 'Part number', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-family', 'backshell', 'family', 'Family', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-description', 'backshell', 'description', 'Description', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-isactive', 'backshell', 'isActive', 'Active', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-stockstatus', 'backshell', 'stockStatus', 'Stock status', 'text', TRUE, FALSE, 'system-user'),
  ('fld-backshell-createdbyuserid', 'backshell', 'createdByUserId', 'Created by', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-createdat', 'backshell', 'createdAt', 'Created at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-isreviewed', 'backshell', 'isReviewed', 'Reviewed', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-reviewedbyuserid', 'backshell', 'reviewedByUserId', 'Reviewed by', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-reviewedat', 'backshell', 'reviewedAt', 'Reviewed at', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-lasteditedbyuserid', 'backshell', 'lastEditedByUserId', 'Last editor', 'text', TRUE, TRUE, 'system-user'),
  ('fld-backshell-lasteditedat', 'backshell', 'lastEditedAt', 'Last edited at', 'text', TRUE, TRUE, 'system-user')
ON CONFLICT (id) DO NOTHING;
