import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

async function main() {
  const sqlitePath = process.env.SQLITE_PATH;
  if (!sqlitePath) {
    throw new Error("SQLITE_PATH is required to run SQLite migrations.");
  }

  const db = new Database(sqlitePath);
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
