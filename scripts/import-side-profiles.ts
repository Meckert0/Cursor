import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Pool } from "pg";
import { z } from "zod";
import { planSideProfileImport } from "../src/domain/side-profile-import.js";
import { inspectTransparentPng } from "../src/domain/transparent-png.js";
import { loadDotEnv } from "../src/infra/env/load-dotenv.js";
import { resolveDatabaseUrl, resolveStoreBackend } from "../src/infra/env/hosted-config.js";
import { MemoryStore, type MemoryStoreState } from "../src/infra/store/memory-store.js";
import { PostgresStore } from "../src/infra/store/postgres-store.js";
import { SqliteStore } from "../src/infra/store/sqlite-store.js";
import type { Store } from "../src/infra/store/store.js";

const args = process.argv.slice(2);
let baseUrl: string | undefined;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--base-url" && args[index + 1]) { baseUrl = args[++index]; continue; }
  if (args[index] !== "--apply" && args[index] !== "--dry-run") throw new Error("Usage: npm run import:side-profiles -- [--apply | --dry-run] [--base-url https://app.example.com]");
}
if (args.includes("--apply") && args.includes("--dry-run")) throw new Error("Choose --apply or --dry-run.");
const apply = args.includes("--apply");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "apps/web/public/part-media/vpc-side-profiles");
const schema = z.object({
  source: z.string().min(1),
  images: z.array(z.object({
    partNumber: z.string().regex(/^\d{9}$/),
    fileName: z.string().regex(/^\d{9}\.png$/),
    pixelWidth: z.number().int().positive(),
    pixelHeight: z.number().int().positive(),
    page: z.number().int().positive(),
    altText: z.string().optional(),
    caption: z.string().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
  }))
});

loadDotEnv();
const manifest = schema.parse(JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")));
for (const image of manifest.images) {
  if (image.fileName !== `${image.partNumber}.png`) throw new Error(`File name does not match ${image.partNumber}.`);
  const png = await readFile(path.join(directory, image.fileName));
  const size = inspectTransparentPng(png);
  if (size.pixelWidth !== image.pixelWidth || size.pixelHeight !== image.pixelHeight) throw new Error(`PNG dimensions differ from manifest: ${image.fileName}`);
  const digest = createHash("sha256").update(png).digest("hex");
  if (image.sha256 && image.sha256 !== digest) throw new Error(`PNG checksum differs from manifest: ${image.fileName}`);
  image.sha256 = digest;
}
// Reject invalid hosting overrides before an --apply run can open a writable store.
planSideProfileImport({ ...manifest, images: [] }, [], [], { baseUrl });

let store: Store;
let pool: Pool | undefined;
let sqlite: SqliteStore | undefined;
const backend = resolveStoreBackend();
if (backend === "postgres") {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required for PostgreSQL.");
  pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  store = new PostgresStore(pool);
} else if (backend === "sqlite") {
  const databasePath = path.resolve(process.env.SQLITE_PATH ?? path.join(root, "data/app.db"));
  await stat(databasePath); // An import must never silently create a new database.
  if (apply) {
    const backupPath = `${databasePath}.before-side-profiles-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    const database = new Database(databasePath, { readonly: true });
    try { await database.backup(backupPath); } finally { database.close(); }
    console.info(`SQLite backup saved to ${backupPath}`);
    sqlite = new SqliteStore(databasePath);
    store = sqlite;
  } else {
    const database = new Database(databasePath, { readonly: true });
    try {
      const row = database.prepare("SELECT payload FROM app_state WHERE id = ?").get("memory_store") as { payload: string } | undefined;
      if (!row) throw new Error("SQLite catalog state is missing.");
      store = new MemoryStore({ state: JSON.parse(row.payload) as MemoryStoreState });
    } finally { database.close(); }
  }
} else throw new Error("Side-profile import requires a durable sqlite or postgres database.");

try {
  const parts = await store.listLibraryComponents({ requestingUserId: "side-profile-import", canViewAllUnreviewed: true, canViewInactive: true });
  const existing = await store.listPartMedia();
  const plan = planSideProfileImport(manifest, parts, existing, { baseUrl });
  console.info(JSON.stringify({ mode: apply ? "apply" : "dry-run", backend, assets: manifest.images.length, updates: plan.updates.map(row => ({ partId: row.partId, url: row.url })), unchanged: plan.unchanged, skipped: plan.skipped }, null, 2));
  if (apply) {
    for (const input of plan.updates) await store.upsertPartMedia(input);
    console.info(`Saved ${plan.updates.length} transparent side-profile media records.`);
  }
} finally {
  sqlite?.close();
  await pool?.end();
}
