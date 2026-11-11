import { CatalogError } from "../../domain/catalog-attributes.js";
import type { Pool, PoolClient } from "pg";
import { normalizePartRelationship, type PartMedia, type PartMediaInput, type PartRelationship } from "../../domain/library.js";

export async function listRelationships(pool: Pick<Pool, "query">, input?: { parentPartId?: string; compatiblePart?: string; relationshipType?: string; id?: string }): Promise<PartRelationship[]> {
  const result = await pool.query(`
    SELECT g.*,
      ARRAY(SELECT t.target_part_id FROM compatibility_targets t WHERE t.group_id = g.id ORDER BY t.target_part_id) AS target_ids,
      ARRAY(SELECT p.part_number FROM compatibility_targets t JOIN parts p ON p.id = t.target_part_id WHERE t.group_id = g.id ORDER BY t.target_part_id) AS part_numbers,
      ARRAY(SELECT u.source_part_number FROM compatibility_unresolved_targets u WHERE u.group_id = g.id ORDER BY u.source_part_number) AS unresolved
    FROM compatibility_groups g
    WHERE ($1::text IS NULL OR g.parent_part_id = $1)
      AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM compatibility_targets t JOIN parts p ON p.id = t.target_part_id WHERE t.group_id = g.id AND p.part_number = $2))
      AND ($3::text IS NULL OR g.relationship_type = $3)
      AND ($4::text IS NULL OR g.id = $4)
    ORDER BY g.relationship_type, g.parent_part_id, g.id`, [input?.parentPartId ?? null, input?.compatiblePart ?? null, input?.relationshipType ?? null, input?.id ?? null]);
  return result.rows.map(row => normalizePartRelationship({
    id: row.id, parentPartId: row.parent_part_id, targetPartIds: row.target_ids, compatibleParts: row.part_numbers,
    relationshipType: row.relationship_type, positionType: row.position_type ?? undefined,
    parentPositions: row.parent_positions_json, status: row.status, isExhaustive: row.is_exhaustive,
    source: row.source ?? undefined, sourceStatus: row.source_status ?? undefined, notes: row.notes ?? undefined,
    extra: row.extra_json, legacyPairKey: row.legacy_pair_key ?? undefined,
    unresolvedParts: row.unresolved.length ? row.unresolved : undefined
  }));
}

/** Caller owns the transaction; shared with the transactional workbook importer. */
export async function writeRelationship(client: Pick<PoolClient, "query">, row: PartRelationship): Promise<string> {
  const existing = await client.query<{ id: string }>(`
    SELECT id FROM compatibility_groups WHERE
      ($6::text IS NOT NULL AND legacy_pair_key = $6) OR
      ($6::text IS NULL AND legacy_pair_key IS NULL AND parent_part_id = $1 AND relationship_type = $2
        AND COALESCE(position_type, '') = COALESCE($3, '') AND parent_positions_json = $4::jsonb AND status = $5)
    FOR UPDATE`, [row.parentPartId, row.relationshipType, row.positionType ?? null, JSON.stringify(row.parentPositions), row.status, row.legacyPairKey ?? null]);
  if (existing.rows[0] && existing.rows[0].id !== row.id) {
    const edited = await client.query("SELECT id FROM compatibility_groups WHERE id = $1", [row.id]);
    if (edited.rows.length) throw new CatalogError("COMPATIBILITY_GROUP_CONFLICT: A group already exists for this scope and status.", 409);
  }
  const id = existing.rows[0]?.id ?? row.id;
  await client.query("DELETE FROM compatibility_targets WHERE group_id = $1", [id]);
  await client.query(`
    INSERT INTO compatibility_groups (id, parent_part_id, relationship_type, position_type, parent_positions_json, status, is_exhaustive, source, source_status, notes, extra_json, legacy_pair_key)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12)
    ON CONFLICT (id) DO UPDATE SET parent_part_id = EXCLUDED.parent_part_id,
      relationship_type = EXCLUDED.relationship_type, position_type = EXCLUDED.position_type,
      parent_positions_json = EXCLUDED.parent_positions_json, status = EXCLUDED.status,
      is_exhaustive = EXCLUDED.is_exhaustive, source = EXCLUDED.source, source_status = EXCLUDED.source_status,
      notes = EXCLUDED.notes, extra_json = EXCLUDED.extra_json, legacy_pair_key = EXCLUDED.legacy_pair_key, updated_at = NOW()`,
  [id, row.parentPartId, row.relationshipType, row.positionType ?? null, JSON.stringify(row.parentPositions), row.status,
    row.isExhaustive ?? false, row.source ?? null, row.sourceStatus ?? null, row.notes ?? null, JSON.stringify(row.extra ?? {}), row.legacyPairKey ?? null]);
  for (const target of row.targetPartIds ?? []) await client.query("INSERT INTO compatibility_targets (group_id, target_part_id) VALUES ($1, $2)", [id, target]);
  await client.query("DELETE FROM compatibility_unresolved_targets WHERE group_id = $1", [id]);
  for (const token of row.unresolvedParts ?? []) await client.query("INSERT INTO compatibility_unresolved_targets (group_id, source_part_number) VALUES ($1, $2)", [id, token]);
  return id;
}

function mapMedia(row: Record<string, unknown>): PartMedia {
  return {
    id: String(row.id), partId: String(row.part_id), url: String(row.url), viewType: String(row.view_type),
    storageKey: row.storage_key as string | undefined ?? undefined,
    orientation: row.orientation as string | undefined ?? undefined,
    mimeType: row.mime_type as string | undefined ?? undefined,
    pixelWidth: row.pixel_width == null ? undefined : Number(row.pixel_width), pixelHeight: row.pixel_height == null ? undefined : Number(row.pixel_height),
    altText: row.alt_text as string | undefined ?? undefined, caption: row.caption as string | undefined ?? undefined,
    sortOrder: Number(row.sort_order), isPrimary: Boolean(row.is_primary),
    source: row.source as string | undefined ?? undefined, revision: row.revision as string | undefined ?? undefined
  };
}

export async function listMedia(pool: Pick<Pool, "query">, input?: { partId?: string }): Promise<PartMedia[]> {
  const rows = await pool.query("SELECT * FROM part_media WHERE ($1::text IS NULL OR part_id = $1) ORDER BY sort_order, id", [input?.partId ?? null]);
  return rows.rows.map(mapMedia);
}

export async function saveMedia(pool: Pool, input: PartMediaInput): Promise<PartMedia> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parent = await client.query("SELECT id FROM parts WHERE id = $1 FOR UPDATE", [input.partId]);
    if (!parent.rows.length) throw new CatalogError("CATALOG_PART_NOT_FOUND");
    const id = input.id ?? `media-${crypto.randomUUID()}`;
    const existing = await client.query<{ part_id: string }>("SELECT part_id FROM part_media WHERE id = $1 FOR UPDATE", [id]);
    if (existing.rows[0] && existing.rows[0].part_id !== input.partId) throw new CatalogError("CATALOG_MEDIA_PART_MISMATCH");
    if (input.isPrimary) await client.query("UPDATE part_media SET is_primary = FALSE WHERE part_id = $1 AND view_type = $2 AND COALESCE(orientation, '') = COALESCE($3, '')", [input.partId, input.viewType, input.orientation ?? null]);
    const result = await client.query(`
      INSERT INTO part_media (id, part_id, url, storage_key, view_type, orientation, mime_type, pixel_width, pixel_height, alt_text, caption, sort_order, is_primary, source, revision)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, storage_key = EXCLUDED.storage_key, view_type = EXCLUDED.view_type,
        orientation = EXCLUDED.orientation, mime_type = EXCLUDED.mime_type, pixel_width = EXCLUDED.pixel_width, pixel_height = EXCLUDED.pixel_height,
        alt_text = EXCLUDED.alt_text, caption = EXCLUDED.caption, sort_order = EXCLUDED.sort_order, is_primary = EXCLUDED.is_primary, source = EXCLUDED.source, revision = EXCLUDED.revision
      RETURNING *`,
    [id, input.partId, input.url, input.storageKey ?? null, input.viewType, input.orientation ?? null, input.mimeType ?? null,
      input.pixelWidth ?? null, input.pixelHeight ?? null, input.altText ?? null, input.caption ?? null, input.sortOrder ?? 0, input.isPrimary ?? false, input.source ?? null, input.revision ?? null]);
    await client.query("COMMIT");
    return mapMedia(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
