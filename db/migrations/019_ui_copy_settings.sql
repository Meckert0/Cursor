CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value, updated_at)
VALUES
  (
    'ui.projectsHeaderDescription',
    'Projects are collections of cable designs. They can be used to keep cable designs separate.',
    NOW()
  ),
  (
    'ui.harnessHeaderDescription',
    'Drag connectors to define a visual harness shape. Connector positions are carried forward in Details. Use node handles to drag-connect paths directly on canvas, including connector-to-junction topology.',
    NOW()
  )
ON CONFLICT (key) DO NOTHING;
