CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  design_id UUID NOT NULL REFERENCES designs(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('design.state.changed')),
  actor_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_design_id ON audit_events(design_id);
