-- Parts model: replace flat library_components + EAV with parts + typed extensions + compat junctions.
-- Existing catalog items are intentionally discarded (no data migration).
-- Users, projects, designs, revisions, auth, and preferences are preserved.

DROP TABLE IF EXISTS library_component_custom_values;
DROP TABLE IF EXISTS library_field_definitions;
DROP TABLE IF EXISTS library_components;

-- Category ↔ extension match is enforced at the application layer (insert parts then matching extension).

CREATE TABLE parts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL
    CHECK (category IN (
      'contact', 'wire', 'sleeve-tube-braid', 'label',
      'backshell', 'strain-relief', 'module', 'splice'
    )),
  part_number TEXT NOT NULL,
  family TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by_user_id TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  stock_status TEXT NOT NULL
    CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ NULL,
  archived_by_user_id TEXT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_edited_by_user_id TEXT NOT NULL,
  last_edited_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX parts_active_identity_uidx
  ON parts (category, family, part_number)
  WHERE is_archived = FALSE;

CREATE INDEX parts_category_idx ON parts (category);
CREATE INDEX parts_is_archived_idx ON parts (is_archived);

CREATE TABLE modules (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  genre TEXT NULL,
  gender TEXT NULL,
  contact_family_1 TEXT NULL,
  pin_count INTEGER NULL CHECK (pin_count IS NULL OR pin_count > 0),
  contact_family_2 TEXT NULL,
  pin_count_2 INTEGER NULL CHECK (pin_count_2 IS NULL OR pin_count_2 > 0),
  emi BOOLEAN NULL,
  crimp_gauge TEXT NULL,
  contact_size TEXT NULL,
  amp_rating TEXT NULL,
  operating_voltage TEXT NULL,
  operating_temp TEXT NULL,
  default_protective_cover_part_id TEXT NULL REFERENCES parts(id) ON DELETE SET NULL,
  pin_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE contacts (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  genre TEXT NULL,
  gender TEXT NULL,
  awg TEXT NULL,
  plating TEXT NULL,
  term_type TEXT NULL,
  ss_compatible BOOLEAN NULL,
  length_added DOUBLE PRECISION NULL,
  accepted_awg_min DOUBLE PRECISION NULL CHECK (accepted_awg_min IS NULL OR accepted_awg_min > 0),
  accepted_awg_max DOUBLE PRECISION NULL CHECK (accepted_awg_max IS NULL OR accepted_awg_max > 0),
  accepted_families_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE wires (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  mil_spec TEXT NULL,
  awg TEXT NOT NULL,
  color TEXT NOT NULL,
  cma DOUBLE PRECISION NULL,
  wire_type TEXT NULL,
  insulation_material TEXT NULL,
  overall_dia DOUBLE PRECISION NULL,
  conductor_dia DOUBLE PRECISION NULL,
  number_of_conductors INTEGER NULL,
  temp_max DOUBLE PRECISION NULL,
  overall_wire_braid BOOLEAN NULL,
  overall_wire_foil BOOLEAN NULL,
  internal_pair_foil BOOLEAN NULL,
  weight_per_ft DOUBLE PRECISION NULL,
  k1 DOUBLE PRECISION NULL,
  k2 DOUBLE PRECISION NULL,
  loss_coefficient DOUBLE PRECISION NULL,
  max_freq DOUBLE PRECISION NULL,
  impedance DOUBLE PRECISION NULL,
  max_voltage DOUBLE PRECISION NULL
);

CREATE TABLE labels (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  label_type TEXT NULL,
  series TEXT NULL
);

CREATE TABLE sleeve_tube_braids (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  min_dia DOUBLE PRECISION NULL,
  max_dia DOUBLE PRECISION NULL,
  sleeve_style TEXT NULL,
  related_part_id TEXT NULL REFERENCES parts(id) ON DELETE SET NULL
);

CREATE TABLE backshells (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  family_type TEXT NULL,
  gender TEXT NULL,
  backshell_size TEXT NULL,
  emi BOOLEAN NULL,
  keying_part_id TEXT NULL REFERENCES parts(id) ON DELETE SET NULL,
  length_added DOUBLE PRECISION NULL,
  bundle_allowance DOUBLE PRECISION NULL
);

CREATE TABLE strain_reliefs (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  gender TEXT NULL,
  requires_backshell BOOLEAN NULL,
  related_module_hint_part_id TEXT NULL REFERENCES parts(id) ON DELETE SET NULL
);

CREATE TABLE splices (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  splice_series TEXT NULL,
  conductor_count INTEGER NULL,
  awg TEXT NULL,
  manufacturer_pn TEXT NULL
);

CREATE TABLE part_aliases (
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  code_system TEXT NOT NULL,
  code TEXT NOT NULL,
  PRIMARY KEY (code_system, code)
);

CREATE INDEX part_aliases_part_id_idx ON part_aliases (part_id);

CREATE TABLE contact_wire_compat (
  contact_part_id TEXT NOT NULL REFERENCES contacts(part_id) ON DELETE CASCADE,
  wire_part_id TEXT NOT NULL REFERENCES wires(part_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'forbidden', 'review')),
  notes TEXT NULL,
  PRIMARY KEY (contact_part_id, wire_part_id)
);

CREATE TABLE module_contact_compat (
  module_part_id TEXT NOT NULL REFERENCES modules(part_id) ON DELETE CASCADE,
  contact_part_id TEXT NOT NULL REFERENCES contacts(part_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'forbidden', 'review')),
  PRIMARY KEY (module_part_id, contact_part_id)
);

CREATE TABLE module_backshell_compat (
  module_part_id TEXT NOT NULL REFERENCES modules(part_id) ON DELETE CASCADE,
  backshell_part_id TEXT NOT NULL REFERENCES backshells(part_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'forbidden', 'review')),
  PRIMARY KEY (module_part_id, backshell_part_id)
);

CREATE TABLE module_strain_relief_compat (
  module_part_id TEXT NOT NULL REFERENCES modules(part_id) ON DELETE CASCADE,
  strain_relief_part_id TEXT NOT NULL REFERENCES strain_reliefs(part_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'forbidden', 'review')),
  PRIMARY KEY (module_part_id, strain_relief_part_id)
);
