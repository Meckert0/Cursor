ALTER TABLE project_ruleset_policies
  ADD COLUMN IF NOT EXISTS inactive_part_severity TEXT
    CHECK (inactive_part_severity IS NULL OR inactive_part_severity IN ('error', 'warning')),
  ADD COLUMN IF NOT EXISTS out_of_stock_severity TEXT
    CHECK (out_of_stock_severity IS NULL OR out_of_stock_severity IN ('error', 'warning', 'info'));

INSERT INTO rulesets (version, is_active, notes, created_at, updated_at)
VALUES (
  'rules-2026.04',
  FALSE,
  'Manufacturability ruleset (compatibility + strict inactive/OOS).',
  NOW(),
  NOW()
)
ON CONFLICT (version) DO NOTHING;
