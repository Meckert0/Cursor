import type { CatalogBuild } from "./catalog.js";
import type { ImportException } from "./types.js";

const SAMPLE_LIMIT = 20;

/** Exception kinds that are listed in full instead of sampled. */
const FULL_LISTING_KINDS = new Set(["alias-conflict", "unresolved-wire-code", "unresolved-contact-code"]);

export function renderReconciliationReport(build: CatalogBuild, sourceFile: string): string {
  const lines: string[] = [];
  lines.push("# CPQ Workbook Import — Reconciliation Report");
  lines.push("");
  lines.push(`- Source: \`${sourceFile}\``);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push("");

  // --- Summary ---
  const byCategory = new Map<string, number>();
  for (const part of build.parts) {
    byCategory.set(part.category, (byCategory.get(part.category) ?? 0) + 1);
  }
  const byCodeSystem = new Map<string, number>();
  for (const alias of build.aliases) {
    byCodeSystem.set(alias.codeSystem, (byCodeSystem.get(alias.codeSystem) ?? 0) + 1);
  }
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Parts: ${build.parts.length}`);
  for (const [category, count] of Array.from(byCategory.entries()).sort()) {
    lines.push(`  - ${category}: ${count}`);
  }
  lines.push(`- Aliases: ${build.aliases.length}`);
  for (const [codeSystem, count] of Array.from(byCodeSystem.entries()).sort()) {
    lines.push(`  - ${codeSystem}: ${count}`);
  }
  lines.push(`- contact_wire_compat rows: ${build.contactWireCompat.length}`);
  lines.push(`- module_contact_compat rows: ${build.moduleContactCompat.length}`);
  lines.push("- module_backshell_compat rows: 0 (no module join key in the workbook)");
  lines.push("- module_strain_relief_compat rows: 0 (deliberately left empty)");
  lines.push(`- awg_cma_reference rows: ${build.awgCmaReference.length}`);
  lines.push(
    `- Parts flagged for manual review (not auto-approved): ${build.reviewFlaggedPartIds.length}`
  );
  lines.push("");

  // --- Per-sheet reconciliation ---
  lines.push("## Per-sheet reconciliation");
  lines.push("");
  lines.push("Every non-blank row of every sheet is classified exactly once. `data rows` = `sum of outcomes` on each line; any imbalance is flagged.");
  lines.push("");
  lines.push("| Sheet | Data rows | Outcomes |");
  lines.push("| --- | ---: | --- |");
  let imbalance = false;
  for (const [sheet, stats] of Array.from(build.sheetStats.entries()).sort()) {
    const total = Object.values(stats.outcomes).reduce((sum, count) => sum + count, 0);
    const outcomeText = Object.entries(stats.outcomes)
      .sort()
      .map(([outcome, count]) => `${outcome}: ${count}`)
      .join("; ");
    const balanced = total === stats.dataRows;
    if (!balanced) {
      imbalance = true;
    }
    lines.push(
      `| ${sheet}${balanced ? "" : " **(IMBALANCE)**"} | ${stats.dataRows} | ${outcomeText || "(none)"} |`
    );
  }
  lines.push("");
  lines.push(imbalance ? "**WARNING: at least one sheet does not balance.**" : "All sheets balance.");
  lines.push("");

  // --- Unresolvable compat codes ---
  lines.push("## Unresolvable contact-wire compatibility codes");
  lines.push("");
  const wireRows = Array.from(build.unresolvedCompat.wireCodes.values()).reduce((a, b) => a + b, 0);
  const contactRows = Array.from(build.unresolvedCompat.contactCodes.values()).reduce((a, b) => a + b, 0);
  lines.push(
    `${build.unresolvedCompat.wireCodes.size} wire codes (${wireRows} row references) and ${build.unresolvedCompat.contactCodes.size} contact codes (${contactRows} row references) in Mx.ContactWireCompatability do not resolve to any part built from the workbook. Per decision, no placeholder parts are created; these rows are dropped.`
  );
  lines.push("");
  lines.push(
    `Unresolved wire codes: ${Array.from(build.unresolvedCompat.wireCodes.keys())
      .sort((a, b) => Number(a) - Number(b))
      .join(", ") || "(none)"}`
  );
  lines.push("");
  lines.push(
    `Unresolved contact codes: ${Array.from(build.unresolvedCompat.contactCodes.keys())
      .sort((a, b) => Number(a) - Number(b))
      .join(", ") || "(none)"}`
  );
  lines.push("");

  // --- Exceptions ---
  lines.push("## Exceptions");
  lines.push("");
  const grouped = new Map<string, ImportException[]>();
  for (const exception of build.exceptions) {
    const key = `${exception.sheet} / ${exception.kind}`;
    const list = grouped.get(key) ?? [];
    list.push(exception);
    grouped.set(key, list);
  }
  for (const [key, exceptions] of Array.from(grouped.entries()).sort()) {
    const kind = exceptions[0].kind;
    lines.push(`### ${key} (${exceptions.length})`);
    lines.push("");
    const listAll = FULL_LISTING_KINDS.has(kind);
    const shown = listAll ? exceptions : exceptions.slice(0, SAMPLE_LIMIT);
    for (const exception of shown) {
      lines.push(`- ${exception.row !== undefined ? `row ${exception.row}: ` : ""}${exception.detail}`);
    }
    if (!listAll && exceptions.length > SAMPLE_LIMIT) {
      lines.push(`- ... and ${exceptions.length - SAMPLE_LIMIT} more`);
    }
    lines.push("");
  }

  // --- Review queue ---
  lines.push("## Parts left unreviewed for manual follow-up");
  lines.push("");
  lines.push(
    "These modules carry information that could not be mapped structurally (protective cover PN and/or a second contact group folded into the description). They are loaded as drafts and appear in the admin review queue."
  );
  lines.push("");
  const flagged = new Set(build.reviewFlaggedPartIds);
  for (const part of build.parts.filter((candidate) => flagged.has(candidate.id))) {
    lines.push(`- ${part.id} (${part.partNumber}): ${part.description}`);
  }
  lines.push("");

  return lines.join("\n");
}
