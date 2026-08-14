/**
 * CPQ workbook -> item database loader.
 *
 * Usage:
 *   npm run import:cpq                 # full load (dry-run ingest first, then commit)
 *   npm run import:cpq -- --dry-run    # stop after the ingest dry-run + report
 *   npm run import:cpq -- --file "C:\path\to\CPQMatricesInfo.xlsx"
 *
 * PowerShell strips the standalone "--" token, which makes npm swallow --dry-run
 * as its own flag instead of forwarding it. From PowerShell either quote it
 * (npm run import:cpq '--' --dry-run) or set CPQ_DRY_RUN=1.
 *
 * Environment:
 *   CPQ_DRY_RUN          set to 1/true to stop after the ingest dry-run + report
 *   CPQ_API_BASE_URL     default http://localhost:3000
 *   CPQ_ADMIN_EMAIL      default meckert@vpc.com (must be in ADMIN_EMAILS)
 *   CPQ_ADMIN_PASSWORD   default CpqImport!2026 (account is registered if missing)
 *   CPQ_XLSX_PATH        default ..\New project Info\CPQMatricesInfo.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { buildCatalog, type CatalogBuild } from "../src/domain/cpq-import/catalog.js";
import { extractWorkbook } from "../src/domain/cpq-import/extract.js";
import { renderReconciliationReport } from "../src/domain/cpq-import/report.js";

const INGEST_CHUNK = 250;
const COMPAT_CHUNK = 1000;
const REVIEW_CHUNK = 1000;

const args = process.argv.slice(2);
const dryRunOnly =
  args.includes("--dry-run") || ["1", "true"].includes((process.env.CPQ_DRY_RUN ?? "").toLowerCase());
const fileArgIndex = args.indexOf("--file");
const workbookPath =
  fileArgIndex >= 0 && args[fileArgIndex + 1]
    ? args[fileArgIndex + 1]
    : process.env.CPQ_XLSX_PATH ??
      path.resolve(process.cwd(), "..", "New project Info", "CPQMatricesInfo.xlsx");

const baseUrl = process.env.CPQ_API_BASE_URL ?? "http://localhost:3000";
const adminEmail = process.env.CPQ_ADMIN_EMAIL ?? "meckert@vpc.com";
const adminPassword = process.env.CPQ_ADMIN_PASSWORD ?? "CpqImport!2026";
const reportPath = path.resolve(process.cwd(), "docs", "cpq-import-report.md");

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
  const token = (json as { sessionToken?: string; user?: { accountRole?: string; email?: string } }).sessionToken;
  if (!token) {
    throw new Error(`Auth response missing sessionToken: ${JSON.stringify(json)}`);
  }
  const accountRole = (json as { user?: { accountRole?: string } }).user?.accountRole;
  if (accountRole !== "admin") {
    throw new Error(
      `Authenticated as ${adminEmail} but accountRole is "${accountRole ?? "missing"}" (need admin). ` +
        `Add this email to ADMIN_EMAILS and restart the API server.`
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
  // No account (or wrong password): try to register the admin account.
  const register = await api("POST", "/v1/auth/register", {
    username: "cpq-import-admin",
    email: adminEmail,
    password: adminPassword
  });
  if (register.status === 201) {
    console.log(`Registered admin account ${adminEmail}.`);
    return cookieFromAuthResponse(register.json);
  }
  throw new Error(
    `Cannot authenticate as ${adminEmail}: login failed (${login.status}) and register failed (${register.status}: ${JSON.stringify(
      register.json
    )}). Set CPQ_ADMIN_EMAIL / CPQ_ADMIN_PASSWORD to valid admin credentials.`
  );
}

interface IngestResult {
  summary: { received: number; accepted: number; rejected: number; committed: number };
  results: Array<{ rowNumber: number; status: string; componentId?: string; message?: string }>;
}

function toIngestItems(build: CatalogBuild) {
  const aliasesByPartId = new Map<string, Array<{ codeSystem: string; code: string }>>();
  for (const alias of build.aliases) {
    const list = aliasesByPartId.get(alias.partId) ?? [];
    list.push({ codeSystem: alias.codeSystem, code: alias.code });
    aliasesByPartId.set(alias.partId, list);
  }
  return build.parts.map((part) => ({
    id: part.id,
    category: part.category,
    family: part.family,
    partNumber: part.partNumber,
    description: part.description,
    isActive: true,
    stockStatus: "unknown" as const,
    isReviewed: false,
    attributes: part.attributes,
    ...(aliasesByPartId.has(part.id) ? { aliases: aliasesByPartId.get(part.id) } : {})
  }));
}

async function runIngest(
  items: ReturnType<typeof toIngestItems>,
  cookie: string,
  dryRun: boolean
): Promise<void> {
  const route = dryRun ? "/v1/library/components/ingest/dry-run" : "/v1/library/components/ingest";
  const expectedStatus = dryRun ? 200 : 201;
  let processed = 0;
  const rejections: Array<{ componentId?: string; message?: string }> = [];
  for (const batch of chunk(items, INGEST_CHUNK)) {
    const response = await api("POST", route, { items: batch }, cookie);
    if (response.status !== expectedStatus) {
      throw new Error(`${route} returned ${response.status}: ${JSON.stringify(response.json)}`);
    }
    const result = response.json as IngestResult;
    for (const row of result.results) {
      if (row.status === "rejected") {
        rejections.push({ componentId: row.componentId, message: row.message });
      }
    }
    processed += batch.length;
    console.log(`${dryRun ? "dry-run" : "ingest"}: ${processed}/${items.length} items processed`);
  }
  if (rejections.length > 0) {
    for (const rejection of rejections.slice(0, 25)) {
      console.error(`REJECTED ${rejection.componentId}: ${rejection.message}`);
    }
    throw new Error(`${rejections.length} items rejected during ${dryRun ? "dry-run" : "ingest"}; aborting.`);
  }
}

async function main() {
  console.log(`Reading workbook: ${workbookPath}`);
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found at ${workbookPath}`);
  }
  const workbook = extractWorkbook(workbookPath);
  const build = buildCatalog(workbook);

  // Reconciliation must balance before anything is written.
  const imbalanced: string[] = [];
  for (const [sheet, stats] of build.sheetStats.entries()) {
    const total = Object.values(stats.outcomes).reduce((sum, count) => sum + count, 0);
    if (total !== stats.dataRows) {
      imbalanced.push(`${sheet}: ${total} outcomes vs ${stats.dataRows} data rows`);
    }
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, renderReconciliationReport(build, workbookPath), "utf8");
  console.log(`Reconciliation report written to ${reportPath}`);
  if (imbalanced.length > 0) {
    throw new Error(`Reconciliation does not balance:\n${imbalanced.join("\n")}`);
  }

  console.log(
    `Catalog: ${build.parts.length} parts, ${build.aliases.length} aliases, ` +
      `${build.contactWireCompat.length} contact-wire compat, ${build.moduleContactCompat.length} module-contact compat, ` +
      `${build.awgCmaReference.length} awg-cma rows, ${build.reviewFlaggedPartIds.length} parts flagged for review, ` +
      `${build.exceptions.length} exceptions (see report).`
  );

  const cookie = await acquireAdminSession();
  const items = toIngestItems(build);

  await runIngest(items, cookie, true);
  console.log("Dry-run ingest passed with zero rejections.");
  if (dryRunOnly) {
    console.log("--dry-run: stopping before any data is written.");
    return;
  }

  await runIngest(items, cookie, false);

  for (const batch of chunk(build.contactWireCompat, COMPAT_CHUNK)) {
    const response = await api("POST", "/v1/library/compat/contact-wire/bulk", { rows: batch }, cookie);
    if (response.status !== 200) {
      throw new Error(`contact-wire bulk failed (${response.status}): ${JSON.stringify(response.json)}`);
    }
  }
  console.log(`contact-wire compat: ${build.contactWireCompat.length} rows upserted`);

  if (build.moduleContactCompat.length > 0) {
    for (const batch of chunk(build.moduleContactCompat, COMPAT_CHUNK)) {
      const response = await api("POST", "/v1/library/compat/module-contact/bulk", { rows: batch }, cookie);
      if (response.status !== 200) {
        throw new Error(`module-contact bulk failed (${response.status}): ${JSON.stringify(response.json)}`);
      }
    }
  }
  console.log(`module-contact compat: ${build.moduleContactCompat.length} rows upserted`);

  if (build.awgCmaReference.length > 0) {
    const response = await api("PUT", "/v1/library/awg-cma-reference", { rows: build.awgCmaReference }, cookie);
    if (response.status !== 200) {
      throw new Error(`awg-cma-reference failed (${response.status}): ${JSON.stringify(response.json)}`);
    }
  }
  console.log(`awg_cma_reference: ${build.awgCmaReference.length} rows upserted`);

  const flagged = new Set(build.reviewFlaggedPartIds);
  const toReview = build.parts.filter((part) => !flagged.has(part.id)).map((part) => part.id);
  let reviewed = 0;
  for (const batch of chunk(toReview, REVIEW_CHUNK)) {
    const response = await api("POST", "/v1/library/components/review/bulk", { componentIds: batch }, cookie);
    if (response.status !== 200) {
      throw new Error(`bulk review failed (${response.status}): ${JSON.stringify(response.json)}`);
    }
    const result = response.json as { reviewed: number; missing: string[] };
    reviewed += result.reviewed;
    if (result.missing.length > 0) {
      throw new Error(`bulk review reported missing ids: ${result.missing.join(", ")}`);
    }
  }
  console.log(
    `Review: ${reviewed} parts auto-approved; ${build.reviewFlaggedPartIds.length} left as drafts for manual review.`
  );
  console.log("CPQ import completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
