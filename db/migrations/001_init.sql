-- Baseline schema for production persistence.
-- Current API starter uses in-memory storage, but this migration defines
-- the first canonical tables aligned with docs/domain-model.md.

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS designs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  current_revision_id UUID,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS design_revisions (
  id UUID PRIMARY KEY,
  design_id UUID NOT NULL REFERENCES designs(id),
  revision_number INTEGER NOT NULL,
  base_revision_id UUID,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  ruleset_version TEXT NOT NULL,
  library_version TEXT NOT NULL,
  snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_designs_project_id ON designs(project_id);
CREATE INDEX IF NOT EXISTS idx_revisions_design_id ON design_revisions(design_id);
