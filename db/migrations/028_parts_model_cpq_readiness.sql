-- Parts model CPQ readiness: close schema gaps that block CPQMatricesInfo ingest.
-- Safe while catalog rows are empty (027 discarded prior library data).
-- Must be applied before Stage 4 of the CPQ → item-database migration.

-- ---------------------------------------------------------------------------
-- parts: identity, stock unknown, import batch
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS parts_active_identity_uidx;

CREATE UNIQUE INDEX parts_active_identity_uidx
  ON parts (category, part_number)
  WHERE is_archived = FALSE;

ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_stock_status_check;

ALTER TABLE parts ADD CONSTRAINT parts_stock_status_check
  CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown'));

ALTER TABLE parts ADD COLUMN IF NOT EXISTS import_batch_id TEXT NULL;

CREATE INDEX IF NOT EXISTS parts_import_batch_id_idx ON parts (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- modules: insert arrangement + per-size contact positions
-- ---------------------------------------------------------------------------

ALTER TABLE modules ADD COLUMN IF NOT EXISTS insert_arrangement TEXT NULL;

CREATE TABLE IF NOT EXISTS module_contact_positions (
  module_part_id TEXT NOT NULL REFERENCES modules(part_id) ON DELETE CASCADE,
  contact_size TEXT NOT NULL,
  contact_family TEXT NULL,
  pin_count INTEGER NOT NULL CHECK (pin_count > 0),
  PRIMARY KEY (module_part_id, contact_size)
);

-- ---------------------------------------------------------------------------
-- contacts: size, stud, TIH
-- ---------------------------------------------------------------------------

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_size TEXT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stud_size TEXT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tih BOOLEAN NULL;

-- ---------------------------------------------------------------------------
-- labels: shrink selection attrs; label_type lives on parts.family
-- ---------------------------------------------------------------------------

ALTER TABLE labels ADD COLUMN IF NOT EXISTS awg_min DOUBLE PRECISION NULL;
ALTER TABLE labels ADD COLUMN IF NOT EXISTS awg_max DOUBLE PRECISION NULL;
ALTER TABLE labels ADD COLUMN IF NOT EXISTS length_in DOUBLE PRECISION NULL;
ALTER TABLE labels ADD COLUMN IF NOT EXISTS dia_in DOUBLE PRECISION NULL;

ALTER TABLE labels DROP COLUMN IF EXISTS label_type;

-- ---------------------------------------------------------------------------
-- splices: variant + CMA bands; splice_series lives on parts.family
-- ---------------------------------------------------------------------------

ALTER TABLE splices ADD COLUMN IF NOT EXISTS variant TEXT NULL;
ALTER TABLE splices ADD COLUMN IF NOT EXISTS cma_min DOUBLE PRECISION NULL;
ALTER TABLE splices ADD COLUMN IF NOT EXISTS cma_max DOUBLE PRECISION NULL;

ALTER TABLE splices DROP COLUMN IF EXISTS splice_series;

-- ---------------------------------------------------------------------------
-- sleeve / tube / braid: discrete size bands (non-contiguous ranges)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sleeve_size_ranges (
  part_id TEXT NOT NULL REFERENCES sleeve_tube_braids(part_id) ON DELETE CASCADE,
  min_dia DOUBLE PRECISION NOT NULL,
  max_dia DOUBLE PRECISION NOT NULL,
  related_part_id TEXT NULL REFERENCES parts(id) ON DELETE SET NULL,
  PRIMARY KEY (part_id, min_dia, max_dia),
  CHECK (min_dia <= max_dia)
);

ALTER TABLE sleeve_tube_braids DROP COLUMN IF EXISTS min_dia;
ALTER TABLE sleeve_tube_braids DROP COLUMN IF EXISTS max_dia;
ALTER TABLE sleeve_tube_braids DROP COLUMN IF EXISTS sleeve_style;
ALTER TABLE sleeve_tube_braids DROP COLUMN IF EXISTS related_part_id;

-- ---------------------------------------------------------------------------
-- backshells: multi-fitment rows for one PN
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS backshell_fitments (
  part_id TEXT NOT NULL REFERENCES backshells(part_id) ON DELETE CASCADE,
  family_type TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  backshell_size TEXT NOT NULL DEFAULT '',
  emi BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (part_id, family_type, gender, backshell_size, emi)
);

ALTER TABLE backshells DROP COLUMN IF EXISTS family_type;
ALTER TABLE backshells DROP COLUMN IF EXISTS gender;
ALTER TABLE backshells DROP COLUMN IF EXISTS backshell_size;
ALTER TABLE backshells DROP COLUMN IF EXISTS emi;

-- ---------------------------------------------------------------------------
-- compatibility junctions
-- ---------------------------------------------------------------------------

ALTER TABLE contact_wire_compat ADD COLUMN IF NOT EXISTS crimp_class TEXT NULL;

ALTER TABLE module_contact_compat ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE module_contact_compat ADD COLUMN IF NOT EXISTS source TEXT NULL;

ALTER TABLE module_backshell_compat ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE module_backshell_compat ADD COLUMN IF NOT EXISTS source TEXT NULL;

ALTER TABLE module_strain_relief_compat ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE module_strain_relief_compat ADD COLUMN IF NOT EXISTS source TEXT NULL;

-- ---------------------------------------------------------------------------
-- reference + provenance + kit components
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS awg_cma_reference (
  awg TEXT PRIMARY KEY,
  cma DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS part_import_provenance (
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NULL,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS part_import_provenance_part_id_idx
  ON part_import_provenance (part_id);

CREATE TABLE IF NOT EXISTS part_components (
  parent_part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  child_part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity > 0),
  unit TEXT NULL,
  PRIMARY KEY (parent_part_id, child_part_id),
  CHECK (parent_part_id <> child_part_id)
);
