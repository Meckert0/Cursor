-- Store part_relationships at the Excel COMPATIBILITY grain: one row per rule,
-- with compatible part numbers as a comma-separated list instead of one row
-- per parent/child pair. Existing exploded rows are dropped; re-run
-- import:vpc-catalog to reload the grouped rows.

DELETE FROM part_relationships;

ALTER TABLE part_relationships ADD COLUMN IF NOT EXISTS compatible_parts TEXT NULL;

DROP INDEX IF EXISTS part_relationships_natural_uidx;
DROP INDEX IF EXISTS part_relationships_child_idx;

ALTER TABLE part_relationships DROP COLUMN IF EXISTS child_part_id;

CREATE UNIQUE INDEX IF NOT EXISTS part_relationships_natural_uidx
  ON part_relationships (
    parent_part_id,
    relationship_type,
    COALESCE(position_type, ''),
    parent_positions_json,
    status
  );
