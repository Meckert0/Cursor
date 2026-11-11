import { Pool } from "pg";
import { loadDotEnv } from "../src/infra/env/load-dotenv.js";
import { resolveDatabaseUrl } from "../src/infra/env/hosted-config.js";
import { assertCatalogSchemaReady } from "../src/infra/store/catalog-schema.js";

async function main() {
  loadDotEnv();
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("A PostgreSQL connection is required to check the catalog schema. Set DATABASE_URL or POSTGRES_URL.");
  }
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
  try {
    await assertCatalogSchemaReady(pool);
    console.log("Catalog database schema is ready.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Catalog schema check failed.");
  process.exitCode = 1;
});
