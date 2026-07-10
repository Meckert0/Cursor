CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY,
  revision_id UUID NOT NULL REFERENCES design_revisions(id),
  format TEXT NOT NULL CHECK (format IN ('json')),
  status TEXT NOT NULL CHECK (status IN ('completed')),
  content_hash TEXT NOT NULL,
  artifact JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exports_revision_id ON exports(revision_id);
CREATE INDEX IF NOT EXISTS idx_exports_content_hash ON exports(content_hash);
