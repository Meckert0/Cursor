-- Preserve strict lower bounds from the sleeve/tube/braid diameter catalog.
-- Older catalog ranges retain their inclusive minimum.
ALTER TABLE sleeve_size_ranges
  ADD COLUMN IF NOT EXISTS min_inclusive BOOLEAN NOT NULL DEFAULT TRUE;
