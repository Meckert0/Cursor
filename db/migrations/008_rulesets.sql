CREATE TABLE IF NOT EXISTS rulesets (
  version TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rulesets_single_active
  ON rulesets (is_active)
  WHERE is_active = TRUE;

INSERT INTO rulesets (version, is_active, notes, created_at, updated_at)
VALUES ('rules-2026.03', TRUE, 'Default ruleset.', NOW(), NOW())
ON CONFLICT (version) DO NOTHING;
