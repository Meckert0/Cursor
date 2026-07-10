CREATE TABLE IF NOT EXISTS quote_submissions (
  id UUID PRIMARY KEY,
  design_id UUID NOT NULL REFERENCES designs(id),
  revision_id UUID NOT NULL REFERENCES design_revisions(id),
  validation_run_id UUID NOT NULL REFERENCES validation_runs(id),
  message TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('received')),
  estimated_response_hours INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_submissions_design_id ON quote_submissions(design_id);
CREATE INDEX IF NOT EXISTS idx_quote_submissions_revision_id ON quote_submissions(revision_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_submissions_design_idempotency
  ON quote_submissions(design_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
