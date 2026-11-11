import type { Pool } from "pg";

const requiredColumns: Record<string, readonly string[]> = {
  compatibility_groups: [
    "id", "parent_part_id", "relationship_type", "position_type", "parent_positions_json", "status",
    "is_exhaustive", "source", "source_status", "notes", "extra_json", "legacy_pair_key"
  ],
  compatibility_targets: ["group_id", "target_part_id"],
  compatibility_unresolved_targets: ["group_id", "source_part_number"],
  part_media: [
    "id", "part_id", "url", "storage_key", "view_type", "orientation", "mime_type", "pixel_width",
    "pixel_height", "alt_text", "caption", "sort_order", "is_primary", "source", "revision"
  ],
  wires: ["cable_designation", "construction", "insulated_conductor_dia_in"],
  contacts: ["accepted_insulation_dia_min_in", "accepted_insulation_dia_max_in"],
  labels: [
    "label_style", "material", "fit_diameter_min_in", "fit_diameter_max_in", "printable_width_in",
    "printable_height_in", "max_characters_per_line", "max_lines", "print_profile", "text_allowance_notes"
  ]
};

/** Read-only deployment gate; migrations remain a separate, explicit operation. */
export async function assertCatalogSchemaReady(pool: Pick<Pool, "query">): Promise<void> {
  const result = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
  `, [Object.keys(requiredColumns)]);
  const available = new Set(result.rows.map(row => `${row.table_name}.${row.column_name}`));
  const missing = Object.entries(requiredColumns).flatMap(([table, columns]) =>
    columns.filter(column => !available.has(`${table}.${column}`)).map(column => `${table}.${column}`)
  );
  if (missing.length) {
    throw new Error(
      `CATALOG_SCHEMA_NOT_READY: Apply 032_catalog_sections.sql to this database before deploying the API. Missing: ${missing.join(", ")}`
    );
  }
}
