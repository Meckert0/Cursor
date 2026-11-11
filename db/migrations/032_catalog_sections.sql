-- Additive catalog redesign. Original compatibility tables remain intact as
-- rollback snapshots; all application writes now use the normalized groups.
CREATE INDEX parts_catalog_number_idx ON parts (UPPER(BTRIM(part_number))) WHERE is_archived = FALSE;
CREATE TABLE compatibility_groups (
  id TEXT PRIMARY KEY,
  parent_part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  position_type TEXT NULL,
  parent_positions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'forbidden', 'review')),
  is_exhaustive BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NULL,
  source_status TEXT NULL,
  notes TEXT NULL,
  extra_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  legacy_pair_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(parent_positions_json) = 'array')
);
CREATE UNIQUE INDEX compatibility_groups_natural_uidx ON compatibility_groups (
  parent_part_id, relationship_type, COALESCE(position_type, ''), parent_positions_json, status
) WHERE legacy_pair_key IS NULL;
CREATE INDEX compatibility_groups_parent_idx ON compatibility_groups (parent_part_id, relationship_type);

CREATE TABLE compatibility_targets (
  group_id TEXT NOT NULL REFERENCES compatibility_groups(id) ON DELETE CASCADE,
  target_part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
  PRIMARY KEY (group_id, target_part_id)
);
CREATE INDEX compatibility_targets_part_idx ON compatibility_targets (target_part_id);

-- Retain unresolved/ambiguous source tokens for explicit catalog correction.
CREATE TABLE compatibility_unresolved_targets (
  group_id TEXT NOT NULL REFERENCES compatibility_groups(id) ON DELETE CASCADE,
  source_part_number TEXT NOT NULL,
  PRIMARY KEY (group_id, source_part_number)
);

INSERT INTO compatibility_groups (
  id, parent_part_id, relationship_type, position_type, parent_positions_json,
  status, is_exhaustive, source, source_status, notes, extra_json
)
SELECT id, parent_part_id, relationship_type, position_type,
       parent_positions_json,
       status, relationship_type IN ('MODULE_ALLOWED', 'INSERT_ALLOWED', 'CONTACT_ALLOWED'),
       'legacy-catalog', source_status, notes, extra_json
FROM part_relationships;

-- Resolve using relationship category and the current non-archived identity.
-- Unknown types must have an unambiguous part number across the catalog.
CREATE TEMP TABLE catalog_target_resolution AS
SELECT r.id AS group_id, TRIM(token) AS token, MIN(p.id) AS target_id, COUNT(p.id) AS match_count
FROM part_relationships r
CROSS JOIN LATERAL unnest(string_to_array(COALESCE(r.compatible_parts, ''), ',')) AS tokens(token)
LEFT JOIN parts p ON UPPER(TRIM(p.part_number)) = UPPER(TRIM(token)) AND p.is_archived = FALSE
  AND p.id <> r.parent_part_id
  AND (CASE r.relationship_type
    WHEN 'MODULE_ALLOWED' THEN p.category = 'module'
    WHEN 'INSERT_ALLOWED' THEN p.category = 'module'
    WHEN 'CONTACT_ALLOWED' THEN p.category = 'contact'
    WHEN 'WIRE_ALLOWED' THEN p.category = 'wire'
    WHEN 'WIRE_COMPATIBILITY' THEN p.category = 'wire'
    WHEN 'BACKSHELL_ALLOWED' THEN p.category = 'backshell'
    WHEN 'STRAIN_RELIEF_ALLOWED' THEN p.category = 'strain-relief'
    ELSE TRUE END)
WHERE TRIM(token) <> ''
GROUP BY r.id, TRIM(token);

INSERT INTO compatibility_targets (group_id, target_part_id)
SELECT DISTINCT group_id, target_id FROM catalog_target_resolution WHERE match_count = 1;
INSERT INTO compatibility_unresolved_targets (group_id, source_part_number)
SELECT group_id, token FROM catalog_target_resolution WHERE match_count <> 1;
DROP TABLE catalog_target_resolution;

-- Legacy pair endpoints are adapters over these groups, never independent data.
CREATE TEMP TABLE catalog_pair_migration AS
SELECT 'contact-wire' AS kind, contact_part_id AS parent_id, wire_part_id AS target_id,
       'WIRE_ALLOWED' AS relationship_type, status, notes, NULL::text AS source,
       CASE WHEN crimp_class IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('crimpClass', crimp_class) END AS extra
FROM contact_wire_compat
UNION ALL
SELECT 'module-contact', module_part_id, contact_part_id, 'CONTACT_ALLOWED', status, notes, source, '{}'::jsonb
FROM module_contact_compat c
WHERE NOT (COALESCE(c.source, '') = 'vpc-catalog' AND EXISTS (
  SELECT 1 FROM compatibility_groups g JOIN compatibility_targets t ON t.group_id = g.id
  WHERE g.parent_part_id = c.module_part_id AND g.relationship_type = 'CONTACT_ALLOWED' AND t.target_part_id = c.contact_part_id
))
UNION ALL
SELECT 'module-backshell', module_part_id, backshell_part_id, 'BACKSHELL_ALLOWED', status, notes, source, '{}'::jsonb FROM module_backshell_compat
UNION ALL
SELECT 'module-strain-relief', module_part_id, strain_relief_part_id, 'STRAIN_RELIEF_ALLOWED', status, notes, source, '{}'::jsonb FROM module_strain_relief_compat;

INSERT INTO compatibility_groups (id, parent_part_id, relationship_type, status, notes, source, extra_json, legacy_pair_key)
SELECT 'pair-' || kind || ':' || parent_id || ':' || target_id, parent_id, relationship_type, status, notes, source, extra,
       kind || ':' || parent_id || ':' || target_id FROM catalog_pair_migration;
INSERT INTO compatibility_targets (group_id, target_part_id)
SELECT 'pair-' || kind || ':' || parent_id || ':' || target_id, target_id FROM catalog_pair_migration;
DROP TABLE catalog_pair_migration;

-- Preserve the category safety previously provided by typed pair-table FKs.
-- Install after backfill so questionable legacy source data is preserved for review.
CREATE FUNCTION catalog_check_compatibility() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  parent_id TEXT;
  kind TEXT;
  expected_parent TEXT;
  expected_target TEXT;
  target_id TEXT;
  group_id_value TEXT;
BEGIN
  target_id := to_jsonb(NEW)->>'target_part_id';
  group_id_value := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'group_id');
  IF TG_TABLE_NAME = 'compatibility_groups' THEN
    parent_id := NEW.parent_part_id;
    kind := NEW.relationship_type;
  ELSE
    SELECT parent_part_id, relationship_type INTO parent_id, kind FROM compatibility_groups WHERE id = NEW.group_id;
    IF parent_id = NEW.target_part_id THEN RAISE EXCEPTION 'Compatibility cannot reference itself' USING ERRCODE = '23514'; END IF;
  END IF;
  expected_parent := CASE kind WHEN 'MODULE_ALLOWED' THEN 'frame' WHEN 'INSERT_ALLOWED' THEN 'module'
    WHEN 'CONTACT_ALLOWED' THEN 'module' WHEN 'BACKSHELL_ALLOWED' THEN 'module' WHEN 'STRAIN_RELIEF_ALLOWED' THEN 'module'
    WHEN 'WIRE_ALLOWED' THEN 'contact' WHEN 'WIRE_COMPATIBILITY' THEN 'contact' END;
  expected_target := CASE kind WHEN 'MODULE_ALLOWED' THEN 'module' WHEN 'INSERT_ALLOWED' THEN 'module'
    WHEN 'CONTACT_ALLOWED' THEN 'contact' WHEN 'BACKSHELL_ALLOWED' THEN 'backshell' WHEN 'STRAIN_RELIEF_ALLOWED' THEN 'strain-relief'
    WHEN 'WIRE_ALLOWED' THEN 'wire' WHEN 'WIRE_COMPATIBILITY' THEN 'wire' END;
  IF expected_parent IS NOT NULL AND (SELECT category FROM parts WHERE id = parent_id) <> expected_parent THEN
    RAISE EXCEPTION 'Wrong parent category for %', kind USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'compatibility_targets' AND expected_target IS NOT NULL AND (SELECT category FROM parts WHERE id = target_id) <> expected_target THEN
    RAISE EXCEPTION 'Wrong target category for %', kind USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'compatibility_groups' AND EXISTS (
    SELECT 1 FROM compatibility_targets t JOIN parts p ON p.id = t.target_part_id WHERE t.group_id = group_id_value
      AND (p.id = parent_id OR (expected_target IS NOT NULL AND p.category <> expected_target))
  ) THEN RAISE EXCEPTION 'Existing targets do not match relationship' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compatibility_group_categories BEFORE INSERT OR UPDATE ON compatibility_groups FOR EACH ROW EXECUTE FUNCTION catalog_check_compatibility();
CREATE TRIGGER compatibility_target_categories BEFORE INSERT OR UPDATE ON compatibility_targets FOR EACH ROW EXECUTE FUNCTION catalog_check_compatibility();

CREATE FUNCTION catalog_preserve_part_category() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category <> OLD.category THEN
    RAISE EXCEPTION 'A part category is immutable; create a new part identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_part_category BEFORE UPDATE OF category ON parts FOR EACH ROW EXECUTE FUNCTION catalog_preserve_part_category();

ALTER TABLE wires ALTER COLUMN awg DROP NOT NULL;
ALTER TABLE wires ADD COLUMN cable_designation TEXT NULL;
ALTER TABLE wires ADD COLUMN construction TEXT NULL;
ALTER TABLE wires ADD COLUMN insulated_conductor_dia_in DOUBLE PRECISION NULL CHECK (insulated_conductor_dia_in > 0);
UPDATE wires SET cable_designation = awg, construction = CASE WHEN awg ~* '^RG[- ]?[0-9]+$' THEN 'coax' ELSE construction END, awg = NULL
WHERE NULLIF(TRIM(awg), '') IS NOT NULL AND awg !~* '^(?:(?:AWG[[:space:]]*)?[0-9]+(?:[.][0-9]+)?(?:[[:space:]]*AWG)?|[1-4]/0)$';
UPDATE parts SET part_type = 'WIRE_REFERENCE' WHERE category = 'wire' AND part_number LIKE 'TBD-%' AND created_by_user_id = 'wire-diameter-catalog';

ALTER TABLE contacts ADD COLUMN accepted_insulation_dia_min_in DOUBLE PRECISION NULL CHECK (accepted_insulation_dia_min_in > 0);
ALTER TABLE contacts ADD COLUMN accepted_insulation_dia_max_in DOUBLE PRECISION NULL CHECK (accepted_insulation_dia_max_in > 0);
ALTER TABLE contacts ADD CONSTRAINT contacts_insulation_diameter_order CHECK (accepted_insulation_dia_min_in <= accepted_insulation_dia_max_in);

ALTER TABLE labels ADD COLUMN label_style TEXT NULL;
ALTER TABLE labels ADD COLUMN material TEXT NULL;
ALTER TABLE labels ADD COLUMN fit_diameter_min_in DOUBLE PRECISION NULL CHECK (fit_diameter_min_in > 0);
ALTER TABLE labels ADD COLUMN fit_diameter_max_in DOUBLE PRECISION NULL CHECK (fit_diameter_max_in > 0);
ALTER TABLE labels ADD CONSTRAINT labels_fit_diameter_order CHECK (fit_diameter_min_in <= fit_diameter_max_in);
ALTER TABLE labels ADD COLUMN printable_width_in DOUBLE PRECISION NULL CHECK (printable_width_in > 0);
ALTER TABLE labels ADD COLUMN printable_height_in DOUBLE PRECISION NULL CHECK (printable_height_in > 0);
ALTER TABLE labels ADD COLUMN max_characters_per_line INTEGER NULL CHECK (max_characters_per_line > 0);
ALTER TABLE labels ADD COLUMN max_lines INTEGER NULL CHECK (max_lines > 0);
ALTER TABLE labels ADD COLUMN print_profile TEXT NULL;
ALTER TABLE labels ADD COLUMN text_allowance_notes TEXT NULL;

CREATE TABLE part_media (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (url ~* '^https?://'),
  storage_key TEXT NULL,
  view_type TEXT NOT NULL,
  orientation TEXT NULL,
  mime_type TEXT NULL,
  pixel_width INTEGER NULL CHECK (pixel_width > 0),
  pixel_height INTEGER NULL CHECK (pixel_height > 0),
  alt_text TEXT NULL,
  caption TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NULL,
  revision TEXT NULL
);
CREATE INDEX part_media_part_idx ON part_media (part_id, view_type, sort_order);
CREATE UNIQUE INDEX part_media_primary_uidx ON part_media (part_id, view_type, COALESCE(orientation, '')) WHERE is_primary = TRUE;
