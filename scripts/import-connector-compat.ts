/**
 * Connector ↔ strain relief and connector ↔ backshell compatibility loader.
 *
 * Usage:
 *   npm run import:connector-compat
 *   npm run import:connector-compat -- --file "C:\path\to\Connector_Compatibility_Only.xlsx"
 *   npx tsx scripts/import-connector-compat.ts --direct --file "..."
 *
 * Environment:
 *   CONNECTOR_COMPAT_DRY_RUN   set to 1/true to stop before writing data
 *   CONNECTOR_COMPAT_DIRECT      set to 1/true to write directly to SQLITE_PATH
 *   CPQ_API_BASE_URL             default http://localhost:3000
 *   CPQ_ADMIN_EMAIL              default meckert@vpc.com
 *   CPQ_ADMIN_PASSWORD           default CpqImport!2026
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildModuleBackshellCompat,
  buildModuleStrainReliefCompat
} from "../src/domain/cpq-import/compat.js";
import { extractWorkbook } from "../src/domain/cpq-import/extract.js";
import { normalizePartNumber } from "../src/domain/cpq-import/normalize.js";
import { createContext } from "../src/domain/cpq-import/types.js";
import type { LibraryCategory } from "../src/domain/library.js";
import { SqliteStore } from "../src/infra/store/sqlite-store.js";

const COMPAT_CHUNK = 1000;
const INGEST_CHUNK = 250;

type StubCategory = "module" | "strain-relief" | "backshell";

const args = process.argv.slice(2);
const dryRunOnly =
  args.includes("--dry-run") ||
  ["1", "true"].includes((process.env.CONNECTOR_COMPAT_DRY_RUN ?? "").toLowerCase());
const useDirectStore =
  args.includes("--direct") ||
  ["1", "true"].includes((process.env.CONNECTOR_COMPAT_DIRECT ?? "").toLowerCase());
const fileArgIndex = args.indexOf("--file");
const workbookPath =
  fileArgIndex >= 0 && args[fileArgIndex + 1]
    ? args[fileArgIndex + 1]
    : path.resolve(process.env.USERPROFILE ?? "", "Downloads", "Connector_Compatibility_Only.xlsx");

const baseUrl = process.env.CPQ_API_BASE_URL ?? "http://localhost:3000";
const adminEmail = process.env.CPQ_ADMIN_EMAIL ?? "meckert@vpc.com";
const adminPassword = process.env.CPQ_ADMIN_PASSWORD ?? "CpqImport!2026";

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function api(
  method: string,
  route: string,
  body: unknown,
  cookie?: string
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

function cookieFromAuthResponse(json: unknown): string {
  const token = (json as { sessionToken?: string; user?: { accountRole?: string } }).sessionToken;
  if (!token) {
    throw new Error(`Auth response missing sessionToken: ${JSON.stringify(json)}`);
  }
  const accountRole = (json as { user?: { accountRole?: string } }).user?.accountRole;
  if (accountRole !== "admin") {
    throw new Error(
      `Authenticated as ${adminEmail} but accountRole is "${accountRole ?? "missing"}" (need admin).`
    );
  }
  console.log(`Authenticated as admin ${adminEmail}.`);
  return `cdt_session=${encodeURIComponent(token)}`;
}

async function acquireAdminSession(): Promise<string> {
  const login = await api("POST", "/v1/auth/login", { email: adminEmail, password: adminPassword });
  if (login.status === 200) {
    return cookieFromAuthResponse(login.json);
  }
  const register = await api("POST", "/v1/auth/register", {
    username: "connector-compat-admin",
    email: adminEmail,
    password: adminPassword
  });
  if (register.status === 201) {
    console.log(`Registered admin account ${adminEmail}.`);
    return cookieFromAuthResponse(register.json);
  }
  throw new Error(
    `Cannot authenticate as ${adminEmail}: login (${login.status}) and register (${register.status}).`
  );
}

interface LibraryPart {
  id: string;
  category: LibraryCategory;
  partNumber: string;
}

async function listAllParts(cookie: string): Promise<LibraryPart[]> {
  const response = await api("GET", "/v1/library/components", undefined, cookie);
  if (response.status !== 200) {
    throw new Error(`list components failed (${response.status}): ${JSON.stringify(response.json)}`);
  }
  return (response.json as { items: LibraryPart[] }).items;
}

function partMaps(parts: LibraryPart[]) {
  const modulePartIdByPn = new Map<string, string>();
  const strainReliefPartIdByPn = new Map<string, string>();
  const backshellPartIdByPn = new Map<string, string>();
  for (const part of parts) {
    const pn = normalizePartNumber(part.partNumber);
    if (!pn) {
      continue;
    }
    if (part.category === "module") {
      modulePartIdByPn.set(pn, part.id);
    }
    if (part.category === "strain-relief") {
      strainReliefPartIdByPn.set(pn, part.id);
    }
    if (part.category === "backshell") {
      backshellPartIdByPn.set(pn, part.id);
    }
  }
  return { modulePartIdByPn, strainReliefPartIdByPn, backshellPartIdByPn };
}

function stubIngestItem(category: StubCategory, id: string, partNumber: string) {
  const family =
    category === "module" ? "VPC" : category === "strain-relief" ? "iSeries" : "iSeries";
  const description =
    category === "module"
      ? `Module ${partNumber} (connector compat import)`
      : category === "strain-relief"
        ? `Strain relief ${partNumber} (connector compat import)`
        : `Backshell ${partNumber} (connector compat import)`;
  return {
    id,
    category,
    family,
    partNumber,
    description,
    isActive: true,
    stockStatus: "unknown" as const,
    isReviewed: true,
    attributes: category === "backshell" ? { fitments: [] } : {}
  };
}

async function ingestStubs(
  stubs: Array<{ id: string; partNumber: string; category: StubCategory }>,
  cookie: string
): Promise<void> {
  if (stubs.length === 0) {
    return;
  }
  const items = stubs.map((stub) => stubIngestItem(stub.category, stub.id, stub.partNumber));
  let processed = 0;
  for (const batch of chunk(items, INGEST_CHUNK)) {
    const response = await api("POST", "/v1/library/components/ingest", { items: batch }, cookie);
    if (response.status !== 201) {
      throw new Error(`ingest failed (${response.status}): ${JSON.stringify(response.json)}`);
    }
    const result = response.json as {
      results: Array<{ status: string; componentId?: string; message?: string }>;
    };
    const rejections = result.results.filter((row) => row.status === "rejected");
    if (rejections.length > 0) {
      for (const rejection of rejections.slice(0, 10)) {
        console.error(`REJECTED ${rejection.componentId}: ${rejection.message}`);
      }
      throw new Error(`${rejections.length} stub parts rejected during ingest.`);
    }
    processed += batch.length;
    console.log(`ingest stubs: ${processed}/${items.length}`);
  }
}

function dedupeStubs(
  stubs: Array<{ id: string; partNumber: string; category: StubCategory }>
): Array<{ id: string; partNumber: string; category: StubCategory }> {
  const byId = new Map<string, { id: string; partNumber: string; category: StubCategory }>();
  for (const stub of stubs) {
    byId.set(stub.id, stub);
  }
  return Array.from(byId.values());
}

async function importViaStore(
  strainReliefBuild: ReturnType<typeof buildModuleStrainReliefCompat>,
  backshellBuild: ReturnType<typeof buildModuleBackshellCompat>,
  stubs: Array<{ id: string; partNumber: string; category: StubCategory }>
): Promise<void> {
  const sqlitePath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.resolve(process.cwd(), "data", "app.db");
  const store = new SqliteStore(sqlitePath);
  try {
    const parts = await store.listLibraryComponents({
      requestingUserId: "connector-compat-import",
      canViewAllUnreviewed: true,
      canViewInactive: true
    });
    const existingIds = new Set(parts.map((part) => part.id));
    const stubItems = stubs
      .filter((stub) => !existingIds.has(stub.id))
      .map((stub) => stubIngestItem(stub.category, stub.id, stub.partNumber));
    if (stubItems.length > 0) {
      const ingest = await store.ingestLibraryComponents({
        items: stubItems,
        requestedByUserId: "connector-compat-import",
        dryRun: false
      });
      const rejections = ingest.results.filter((row) => row.status === "rejected");
      if (rejections.length > 0) {
        throw new Error(`${rejections.length} stub parts rejected: ${rejections[0].message}`);
      }
      console.log(`ingest stubs (direct): ${stubItems.length}`);
    }
    const srResult = await store.bulkUpsertModuleStrainReliefCompat({ rows: strainReliefBuild.rows });
    console.log(`module-strain-relief compat (direct): ${srResult.upserted} rows upserted`);
    const bsResult = await store.bulkUpsertModuleBackshellCompat({ rows: backshellBuild.rows });
    console.log(`module-backshell compat (direct): ${bsResult.upserted} rows upserted`);
  } finally {
    store.close();
  }
}

async function bulkUpsertViaApi(
  route: string,
  rows: Array<Record<string, unknown>>,
  cookie: string,
  label: string
): Promise<void> {
  for (const batch of chunk(rows, COMPAT_CHUNK)) {
    const response = await api("POST", route, { rows: batch }, cookie);
    if (response.status !== 200) {
      throw new Error(`${label} bulk failed (${response.status}): ${JSON.stringify(response.json)}`);
    }
  }
  console.log(`${label}: ${rows.length} rows upserted`);
}

async function main() {
  console.log(`Reading workbook: ${workbookPath}`);
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found at ${workbookPath}`);
  }

  const workbook = extractWorkbook(workbookPath);
  const ctx = createContext();

  let modulePartIdByPn = new Map<string, string>();
  let strainReliefPartIdByPn = new Map<string, string>();
  let backshellPartIdByPn = new Map<string, string>();
  if (!useDirectStore) {
    const cookie = await acquireAdminSession();
    const maps = partMaps(await listAllParts(cookie));
    modulePartIdByPn = maps.modulePartIdByPn;
    strainReliefPartIdByPn = maps.strainReliefPartIdByPn;
    backshellPartIdByPn = maps.backshellPartIdByPn;
  }

  const buildOptions = {
    modulePartIdByPn,
    useDeterministicIds: true
  };
  const strainReliefBuild = buildModuleStrainReliefCompat(workbook, ctx, {
    ...buildOptions,
    strainReliefPartIdByPn
  });
  const backshellBuild = buildModuleBackshellCompat(workbook, ctx, {
    ...buildOptions,
    backshellPartIdByPn
  });

  const allStubs = dedupeStubs([
    ...strainReliefBuild.stubModules.map((stub) => ({ ...stub, category: "module" as const })),
    ...strainReliefBuild.stubStrainReliefs.map((stub) => ({ ...stub, category: "strain-relief" as const })),
    ...backshellBuild.stubModules.map((stub) => ({ ...stub, category: "module" as const })),
    ...backshellBuild.stubBackshells.map((stub) => ({ ...stub, category: "backshell" as const }))
  ]);

  console.log(
    `Strain relief compat: ${strainReliefBuild.rows.length} rows; stub modules: ${strainReliefBuild.stubModules.length}; ` +
      `stub strain reliefs: ${strainReliefBuild.stubStrainReliefs.length}`
  );
  console.log(
    `Backshell compat: ${backshellBuild.rows.length} rows; stub modules: ${backshellBuild.stubModules.length}; ` +
      `stub backshells: ${backshellBuild.stubBackshells.length}`
  );

  if (ctx.exceptions.length > 0) {
    for (const exception of ctx.exceptions) {
      console.warn(`EXCEPTION [${exception.sheet}/${exception.kind}]: ${exception.detail}`);
    }
  }

  if (dryRunOnly) {
    console.log("--dry-run: stopping before any data is written.");
    return;
  }

  if (useDirectStore) {
    await importViaStore(strainReliefBuild, backshellBuild, allStubs);
  } else {
    const cookie = await acquireAdminSession();
    await ingestStubs(allStubs, cookie);
    await bulkUpsertViaApi(
      "/v1/library/compat/module-strain-relief/bulk",
      strainReliefBuild.rows,
      cookie,
      "module-strain-relief compat"
    );
    await bulkUpsertViaApi(
      "/v1/library/compat/module-backshell/bulk",
      backshellBuild.rows,
      cookie,
      "module-backshell compat"
    );
  }
  console.log("Connector compatibility import completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
