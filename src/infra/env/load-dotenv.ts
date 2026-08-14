import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads KEY=VALUE pairs from a .env file into process.env.
 * Does not override variables already set in the environment.
 * Returns the number of keys applied from the file.
 */
export function loadDotEnv(filePath = path.resolve(process.cwd(), ".env")): number {
  if (!existsSync(filePath)) {
    return 0;
  }

  const contents = readFileSync(filePath, "utf8");
  let applied = 0;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, eq).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
    applied += 1;
  }

  return applied;
}
