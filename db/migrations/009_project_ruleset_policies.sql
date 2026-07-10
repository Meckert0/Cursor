CREATE TABLE IF NOT EXISTS project_ruleset_policies (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  default_ruleset_version TEXT,
  allowed_ruleset_versions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_ruleset_policies_default_ruleset
  ON project_ruleset_policies(default_ruleset_version);
