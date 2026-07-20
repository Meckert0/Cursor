ALTER TABLE library_components
  ADD COLUMN IF NOT EXISTS pin_count INTEGER
    CHECK (pin_count IS NULL OR pin_count > 0),
  ADD COLUMN IF NOT EXISTS pin_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_awg_min DOUBLE PRECISION
    CHECK (accepted_awg_min IS NULL OR accepted_awg_min > 0),
  ADD COLUMN IF NOT EXISTS accepted_awg_max DOUBLE PRECISION
    CHECK (accepted_awg_max IS NULL OR accepted_awg_max > 0),
  ADD COLUMN IF NOT EXISTS accepted_families_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Best-effort promotion of legacy custom-field compatibility keys into first-class columns.
UPDATE library_components AS lc
SET pin_count = COALESCE(
  lc.pin_count,
  NULLIF(regexp_replace(cv.value, '[^0-9]', '', 'g'), '')::INTEGER
)
FROM library_component_custom_values AS cv
JOIN library_field_definitions AS fd ON fd.id = cv.field_definition_id
WHERE cv.component_id = lc.id
  AND lower(fd.key) IN ('pincount', 'pin_count')
  AND lc.pin_count IS NULL
  AND NULLIF(regexp_replace(cv.value, '[^0-9]', '', 'g'), '') IS NOT NULL;

UPDATE library_components AS lc
SET accepted_awg_min = COALESCE(
  lc.accepted_awg_min,
  NULLIF(regexp_replace(cv.value, '[^0-9.]', '', 'g'), '')::DOUBLE PRECISION
)
FROM library_component_custom_values AS cv
JOIN library_field_definitions AS fd ON fd.id = cv.field_definition_id
WHERE cv.component_id = lc.id
  AND lower(fd.key) IN ('acceptedawgmin', 'accepted_awg_min')
  AND lc.accepted_awg_min IS NULL
  AND NULLIF(regexp_replace(cv.value, '[^0-9.]', '', 'g'), '') IS NOT NULL;

UPDATE library_components AS lc
SET accepted_awg_max = COALESCE(
  lc.accepted_awg_max,
  NULLIF(regexp_replace(cv.value, '[^0-9.]', '', 'g'), '')::DOUBLE PRECISION
)
FROM library_component_custom_values AS cv
JOIN library_field_definitions AS fd ON fd.id = cv.field_definition_id
WHERE cv.component_id = lc.id
  AND lower(fd.key) IN ('acceptedawgmax', 'accepted_awg_max')
  AND lc.accepted_awg_max IS NULL
  AND NULLIF(regexp_replace(cv.value, '[^0-9.]', '', 'g'), '') IS NOT NULL;

ALTER TABLE project_ruleset_policies
  ADD COLUMN IF NOT EXISTS unreviewed_part_severity TEXT
    CHECK (unreviewed_part_severity IS NULL OR unreviewed_part_severity IN ('error', 'warning', 'info'));

-- Unused since introduction; Priority 3 chooses removal over wiring.
DROP TABLE IF EXISTS project_library_overrides;
