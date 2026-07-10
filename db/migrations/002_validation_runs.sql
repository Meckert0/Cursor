CREATE TABLE IF NOT EXISTS validation_runs (
  id UUID PRIMARY KEY,
  revision_id UUID NOT NULL REFERENCES design_revisions(id),
  ruleset_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('quick', 'full')),
  status TEXT NOT NULL CHECK (status IN ('completed')),
  errors INTEGER NOT NULL,
  warnings INTEGER NOT NULL,
  infos INTEGER NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_revision_id ON validation_runs(revision_id);
