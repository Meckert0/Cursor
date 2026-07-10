CREATE TABLE IF NOT EXISTS user_table_preferences (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  column_order TEXT[] NOT NULL DEFAULT '{}',
  column_widths JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope)
);
