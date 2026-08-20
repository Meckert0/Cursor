/**
 * VPC i1/iCon workbook -> Postgres catalog loader.
 *
 * Writes directly with the pg client (not HTTP ingest).
 *
 * Usage:
 *   npm run import:vpc-catalog
 *   npm run import:vpc-catalog -- --dry-run
 *   npm run import:vpc-catalog -- --file "C:\path\to\vpc_i1_icon_complete_database.xlsx"
 *
 * PowerShell strips the standalone "--" token. From PowerShell either quote it
 * (npm run import:vpc-catalog '--' --dry-run) or set VPC_CATALOG_DRY_RUN=1.
 *
 * Environment:
 *   DATABASE_URL              required for commit (loaded from .env)
 *   VPC_CATALOG_DRY_RUN       set to 1/true to skip SQL writes
 *   VPC_CATALOG_XLSX_PATH     default Desktop File Folder workbook
 */
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { extractVpcWorkbook } from "../src/domain/vpc-catalog-import/extract.js";
import { parseVpcCatalog } from "../src/domain/vpc-catalog-import/parse.js";
import { renderVpcCatalogReport } from "../src/domain/vpc-catalog-import/report.js";
import type { VpcCatalogPart } from "../src/domain/vpc-catalog-import/types.js";
import type {
  ContactAttributes,
  FrameAttributes,
  ModuleAttributes,
  ModuleContactCompat,
  PartImportProvenance,
  PartRelationshipInput
} from "../src/domain/library.js";
import { loadDotEnv } from "../src/infra/env/load-dotenv.js";

const DEFAULT_XLSX = path.resolve(
  "C:\\Users\\meckert\\Desktop\\File Folder\\vpc_i1_icon_complete_database.xlsx"
);
const IMPORT_USER_ID = "vpc-catalog-import";
const IMPORT_BATCH_ID = "vpc-i1-icon-complete-database";

const args = process.argv.slice(2);
const dryRunOnly =
  args.includes("--dry-run") || ["1", "true"].includes((process.env.VPC_CATALOG_DRY_RUN ?? "").toLowerCase());
const fileArgIndex = args.indexOf("--file");
const workbookPath =
  fileArgIndex >= 0 && args[fileArgIndex + 1]
    ? args[fileArgIndex + 1]
    : process.env.VPC_CATALOG_XLSX_PATH ?? DEFAULT_XLSX;

loadDotEnv();

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function upsertParts(client: import("pg").PoolClient, parts: VpcCatalogPart[], now: Date): Promise<void> {
  for (const part of parts) {
    await client.query(
      `INSERT INTO parts (
         id, category, family, part_number, description, is_active, stock_status,
         created_by_user_id, created_at, last_edited_by_user_id, last_edited_at,
         is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at,
         import_batch_id, part_type, side, notes, electrical_mode, extra_attributes
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $8, $9,
         TRUE, $8, $9, FALSE, $9,
         $10, $11, $12, $13, $14, $15::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         family = EXCLUDED.family,
         part_number = EXCLUDED.part_number,
         description = EXCLUDED.description,
         is_active = EXCLUDED.is_active,
         stock_status = EXCLUDED.stock_status,
         is_reviewed = TRUE,
         reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
         reviewed_at = EXCLUDED.reviewed_at,
         last_edited_by_user_id = EXCLUDED.last_edited_by_user_id,
         last_edited_at = EXCLUDED.last_edited_at,
         updated_at = EXCLUDED.updated_at,
         import_batch_id = EXCLUDED.import_batch_id,
         part_type = EXCLUDED.part_type,
         side = EXCLUDED.side,
         notes = EXCLUDED.notes,
         electrical_mode = EXCLUDED.electrical_mode,
         extra_attributes = EXCLUDED.extra_attributes`,
      [
        part.id,
        part.category,
        part.family,
        part.partNumber,
        part.description,
        part.isActive,
        part.stockStatus,
        IMPORT_USER_ID,
        now,
        IMPORT_BATCH_ID,
        part.partType ?? null,
        part.side ?? null,
        part.notes ?? null,
        part.electricalMode ?? null,
        json(part.extraAttributes ?? {})
      ]
    );

    if (part.category === "frame") {
      const attrs = part.attributes as FrameAttributes;
      await client.query(
        `INSERT INTO frames (part_id, module_capacity, slot_ids_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (part_id) DO UPDATE SET
           module_capacity = EXCLUDED.module_capacity,
           slot_ids_json = EXCLUDED.slot_ids_json`,
        [part.id, attrs.moduleCapacity ?? null, json(attrs.slotIds ?? [])]
      );
    } else if (part.category === "module") {
      const attrs = part.attributes as ModuleAttributes;
      await client.query(
        `INSERT INTO modules (
           part_id, genre, gender, contact_family_1, pin_count, contact_family_2, pin_count_2,
           emi, crimp_gauge, contact_size, amp_rating, operating_voltage, operating_temp,
           default_protective_cover_part_id, insert_arrangement, pin_ids_json,
           position_count, sim_slot_count, sim_slot_sections_json, slot_occupancy
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13,
           $14, $15, $16::jsonb,
           $17, $18, $19::jsonb, $20
         )
         ON CONFLICT (part_id) DO UPDATE SET
           genre = EXCLUDED.genre,
           gender = EXCLUDED.gender,
           contact_family_1 = EXCLUDED.contact_family_1,
           pin_count = EXCLUDED.pin_count,
           contact_family_2 = EXCLUDED.contact_family_2,
           pin_count_2 = EXCLUDED.pin_count_2,
           emi = EXCLUDED.emi,
           crimp_gauge = EXCLUDED.crimp_gauge,
           contact_size = EXCLUDED.contact_size,
           amp_rating = EXCLUDED.amp_rating,
           operating_voltage = EXCLUDED.operating_voltage,
           operating_temp = EXCLUDED.operating_temp,
           default_protective_cover_part_id = EXCLUDED.default_protective_cover_part_id,
           insert_arrangement = EXCLUDED.insert_arrangement,
           pin_ids_json = EXCLUDED.pin_ids_json,
           position_count = EXCLUDED.position_count,
           sim_slot_count = EXCLUDED.sim_slot_count,
           sim_slot_sections_json = EXCLUDED.sim_slot_sections_json,
           slot_occupancy = EXCLUDED.slot_occupancy`,
        [
          part.id,
          attrs.genre ?? null,
          attrs.gender ?? null,
          attrs.contactFamily1 ?? null,
          attrs.pinCount ?? null,
          attrs.contactFamily2 ?? null,
          attrs.pinCount2 ?? null,
          attrs.emi ?? null,
          attrs.crimpGauge ?? null,
          attrs.contactSize ?? null,
          attrs.ampRating ?? null,
          attrs.operatingVoltage ?? null,
          attrs.operatingTemp ?? null,
          attrs.defaultProtectiveCoverPartId ?? null,
          attrs.insertArrangement ?? null,
          json(attrs.pinIds ?? []),
          attrs.positionCount ?? null,
          attrs.simSlotCount ?? null,
          json(attrs.simSlotSections ?? []),
          attrs.slotOccupancy ?? null
        ]
      );
      await client.query(`DELETE FROM module_contact_positions WHERE module_part_id = $1`, [part.id]);
      for (const position of attrs.contactPositions ?? []) {
        await client.query(
          `INSERT INTO module_contact_positions (module_part_id, contact_size, contact_family, pin_count)
           VALUES ($1, $2, $3, $4)`,
          [part.id, position.contactSize, position.contactFamily ?? null, position.pinCount]
        );
      }
    } else if (part.category === "contact") {
      const attrs = part.attributes as ContactAttributes;
      await client.query(
        `INSERT INTO contacts (
           part_id, genre, gender, awg, plating, term_type, ss_compatible, length_added,
           accepted_awg_min, accepted_awg_max, accepted_families_json, contact_size, stud_size, tih,
           accepted_gauges_json, wire_interface
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11::jsonb, $12, $13, $14,
           $15::jsonb, $16
         )
         ON CONFLICT (part_id) DO UPDATE SET
           genre = EXCLUDED.genre,
           gender = EXCLUDED.gender,
           awg = EXCLUDED.awg,
           plating = EXCLUDED.plating,
           term_type = EXCLUDED.term_type,
           ss_compatible = EXCLUDED.ss_compatible,
           length_added = EXCLUDED.length_added,
           accepted_awg_min = EXCLUDED.accepted_awg_min,
           accepted_awg_max = EXCLUDED.accepted_awg_max,
           accepted_families_json = EXCLUDED.accepted_families_json,
           contact_size = EXCLUDED.contact_size,
           stud_size = EXCLUDED.stud_size,
           tih = EXCLUDED.tih,
           accepted_gauges_json = EXCLUDED.accepted_gauges_json,
           wire_interface = EXCLUDED.wire_interface`,
        [
          part.id,
          attrs.genre ?? null,
          attrs.gender ?? null,
          attrs.awg ?? null,
          attrs.plating ?? null,
          attrs.termType ?? null,
          attrs.ssCompatible ?? null,
          attrs.lengthAdded ?? null,
          attrs.acceptedAwgMin ?? null,
          attrs.acceptedAwgMax ?? null,
          json(attrs.acceptedFamilies ?? []),
          attrs.contactSize ?? null,
          attrs.studSize ?? null,
          attrs.tih ?? null,
          json(attrs.acceptedGauges ?? []),
          attrs.wireInterface ?? null
        ]
      );
    }
  }
}

async function upsertRelationships(
  client: import("pg").PoolClient,
  rows: PartRelationshipInput[]
): Promise<void> {
  for (const row of rows) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM part_relationships
       WHERE parent_part_id = $1
         AND COALESCE(child_part_id, '') = COALESCE($2, '')
         AND relationship_type = $3
         AND COALESCE(position_type, '') = COALESCE($4, '')`,
      [row.parentPartId, row.childPartId ?? null, row.relationshipType, row.positionType ?? null]
    );
    const id = existing.rows[0]?.id ?? row.id;
    await client.query(
      `INSERT INTO part_relationships (
         id, parent_part_id, child_part_id, relationship_type, position_type,
         parent_positions_json, status, source_status, notes, extra_json
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::jsonb, $7, $8, $9, $10::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         parent_part_id = EXCLUDED.parent_part_id,
         child_part_id = EXCLUDED.child_part_id,
         relationship_type = EXCLUDED.relationship_type,
         position_type = EXCLUDED.position_type,
         parent_positions_json = EXCLUDED.parent_positions_json,
         status = EXCLUDED.status,
         source_status = EXCLUDED.source_status,
         notes = EXCLUDED.notes,
         extra_json = EXCLUDED.extra_json`,
      [
        id,
        row.parentPartId,
        row.childPartId ?? null,
        row.relationshipType,
        row.positionType ?? null,
        json(row.parentPositions),
        row.status,
        row.sourceStatus ?? null,
        row.notes ?? null,
        json(row.extra ?? {})
      ]
    );
  }
}

async function upsertModuleContactCompat(
  client: import("pg").PoolClient,
  rows: ModuleContactCompat[]
): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO module_contact_compat (module_part_id, contact_part_id, status, notes, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (module_part_id, contact_part_id) DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         source = EXCLUDED.source`,
      [row.modulePartId, row.contactPartId, row.status, row.notes ?? null, row.source ?? "vpc-catalog"]
    );
  }
}

async function replaceProvenance(
  client: import("pg").PoolClient,
  partIds: string[],
  rows: PartImportProvenance[]
): Promise<void> {
  if (partIds.length === 0) {
    return;
  }
  await client.query(
    `DELETE FROM part_import_provenance
     WHERE part_id = ANY($1::text[])
       AND source_sheet IN ('PARTS', 'COMPATIBILITY')`,
    [partIds]
  );
  for (const row of rows) {
    await client.query(
      `INSERT INTO part_import_provenance (part_id, source_sheet, source_row, note)
       VALUES ($1, $2, $3, $4)`,
      [row.partId, row.sourceSheet, row.sourceRow ?? null, row.note ?? null]
    );
  }
}

async function commitCatalog(
  databaseUrl: string,
  build: ReturnType<typeof parseVpcCatalog>
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query("BEGIN");
    await upsertParts(client, build.parts, now);
    await upsertRelationships(client, build.relationships);
    await upsertModuleContactCompat(client, build.moduleContactCompat);
    await replaceProvenance(
      client,
      build.parts.map((part) => part.id),
      build.provenance
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }
  const sheets = extractVpcWorkbook(workbookPath);
  const build = parseVpcCatalog(sheets);
  const report = renderVpcCatalogReport(build, workbookPath);
  console.log(report);

  const reportPath = path.resolve(process.cwd(), "docs", "vpc-catalog-import-report.md");
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`Wrote ${reportPath}`);

  if (dryRunOnly) {
    console.log("Dry-run only; no SQL writes.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to commit the catalog (omit --dry-run).");
  }
  await commitCatalog(databaseUrl, build);
  console.log(
    `Committed batch ${IMPORT_BATCH_ID}: ${build.parts.length} parts, ${build.relationships.length} relationships, ${build.moduleContactCompat.length} module-contact pairs.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
