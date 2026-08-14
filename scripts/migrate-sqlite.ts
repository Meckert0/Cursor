import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { loadDotEnv } from "../src/infra/env/load-dotenv.js";

async function main() {
  loadDotEnv();
  const sqlitePath = process.env.SQLITE_PATH?.trim() || "./data/app.db";
  const resolvedPath = path.resolve(sqlitePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  console.log(`Migrating SQLite database at ${resolvedPath}`);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(scriptDir, "../db/sqlite-migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = db.prepare<[], { id: string }>(`SELECT id FROM schema_migrations`).all();
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const tx = db.transaction((migrationSql: string, migrationId: string) => {
      if (migrationId === "002_auth_account_roles.sql") {
        const columns = db.prepare(`PRAGMA table_info(auth_users)`).all() as Array<{ name: string }>;
        const hasAccountRole = columns.some((column) => column.name === "account_role");
        if (!hasAccountRole) {
          db.exec(`ALTER TABLE auth_users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'regular'`);
        }
      }
      db.exec(migrationSql);
      db.prepare(`INSERT INTO schema_migrations (id) VALUES (?)`).run(migrationId);
    });
    tx(sql, file);
    console.log(`Applied SQLite migration: ${file}`);
  }

  db.close();
  console.log("SQLite migration run complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
