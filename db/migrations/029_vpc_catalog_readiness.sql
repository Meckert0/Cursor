-- VPC i1/iCon catalog readiness: shared part taxonomy, frames, position-scoped
-- relationships, and module/contact fields needed for slot/SIM/gauge rules.
-- Safe while the hosted catalog is empty. Does not load catalog rows.

-- ---------------------------------------------------------------------------
-- parts: shared VPC taxonomy + extras bag
-- ---------------------------------------------------------------------------

ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_category_check;

ALTER TABLE parts ADD CONSTRAINT parts_category_check
  CHECK (category IN (
    'contact', 'wire', 'sleeve-tube-braid', 'label',
    'backshell', 'strain-relief', 'module', 'splice', 'frame'
  ));

ALTER TABLE parts ADD COLUMN IF NOT EXISTS part_type TEXT NULL;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS side TEXT NULL;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS electrical_mode TEXT NULL;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS extra_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS parts_part_type_idx ON parts (part_type)
  WHERE part_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS parts_side_idx ON parts (side)
  WHERE side IS NOT NULL;

-- ---------------------------------------------------------------------------
-- frames: ITA / Receiver housings with named module slots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS frames (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  module_capacity INTEGER NULL CHECK (module_capacity IS NULL OR module_capacity > 0),
  slot_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- modules: SIM host / insert occupancy + total electrical positions
-- ---------------------------------------------------------------------------

ALTER TABLE modules ADD COLUMN IF NOT EXISTS position_count INTEGER NULL
  CHECK (position_count IS NULL OR position_count >= 0);
ALTER TABLE modules ADD COLUMN IF NOT EXISTS sim_slot_count INTEGER NULL
  CHECK (sim_slot_count IS NULL OR sim_slot_count > 0);
ALTER TABLE modules ADD COLUMN IF NOT EXISTS sim_slot_sections_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS slot_occupancy INTEGER NULL
  CHECK (slot_occupancy IS NULL OR slot_occupancy > 0);

-- ---------------------------------------------------------------------------
-- contacts: gauge/media lists that are not always numeric AWG
-- ---------------------------------------------------------------------------

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS accepted_gauges_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wire_interface TEXT NULL;

-- ---------------------------------------------------------------------------
-- Generic position-scoped relationships (new types do not need new tables)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS part_relationships (
  id TEXT PRIMARY KEY,
  parent_part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  child_part_id TEXT NULL REFERENCES parts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  position_type TEXT NULL,
  parent_positions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'forbidden', 'review')),
  source_status TEXT NULL,
  notes TEXT NULL,
  extra_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (child_part_id IS NULL OR child_part_id <> parent_part_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS part_relationships_natural_uidx
  ON part_relationships (
    parent_part_id,
    COALESCE(child_part_id, ''),
    relationship_type,
    COALESCE(position_type, '')
  );

CREATE INDEX IF NOT EXISTS part_relationships_parent_idx
  ON part_relationships (parent_part_id);

CREATE INDEX IF NOT EXISTS part_relationships_child_idx
  ON part_relationships (child_part_id)
  WHERE child_part_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS part_relationships_type_idx
  ON part_relationships (relationship_type);
