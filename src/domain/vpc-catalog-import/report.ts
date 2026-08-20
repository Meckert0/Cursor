import type { VpcCatalogBuild } from "./types.js";

export function renderVpcCatalogReport(build: VpcCatalogBuild, sourceFile: string): string {
  const lines: string[] = [];
  lines.push("# VPC i1/iCon catalog import — reconciliation");
  lines.push("");
  lines.push(`- Source: \`${sourceFile}\``);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Parts");
  lines.push("");
  lines.push(`- Source PARTS rows: ${build.stats.sourcePartRows}`);
  lines.push(`- Parsed parts: ${build.parts.length}`);
  for (const [partType, count] of Object.entries(build.stats.partsByType).sort()) {
    lines.push(`  - ${partType}: ${count}`);
  }
  const byCategory = new Map<string, number>();
  for (const part of build.parts) {
    byCategory.set(part.category, (byCategory.get(part.category) ?? 0) + 1);
  }
  lines.push("- By category:");
  for (const [category, count] of [...byCategory.entries()].sort()) {
    lines.push(`  - ${category}: ${count}`);
  }
  lines.push("");
  lines.push("## Compatibility");
  lines.push("");
  lines.push(`- Source COMPATIBILITY rows: ${build.stats.sourceCompatRows}`);
  lines.push(`- Exploded parent/child rows: ${build.stats.explodedCompatRows}`);
  lines.push(`- Stored part_relationships: ${build.relationships.length}`);
  for (const [type, count] of Object.entries(build.stats.relationshipsByType).sort()) {
    lines.push(`  - ${type}: ${count}`);
  }
  lines.push(`- Dual-write module_contact_compat: ${build.moduleContactCompat.length}`);
  lines.push("- Workbook status values:");
  for (const [status, count] of Object.entries(build.stats.statusMapped).sort()) {
    lines.push(`  - ${status}: ${count}`);
  }
  lines.push("");
  lines.push("## Unmapped columns");
  lines.push("");
  lines.push(
    `- PARTS: ${build.unmappedColumns.PARTS.length ? build.unmappedColumns.PARTS.join(", ") : "(none)"}`
  );
  lines.push(
    `- COMPATIBILITY: ${
      build.unmappedColumns.COMPATIBILITY.length ? build.unmappedColumns.COMPATIBILITY.join(", ") : "(none)"
    }`
  );
  lines.push("");
  lines.push("## Issues");
  lines.push("");
  if (build.issues.length === 0) {
    lines.push("- None");
  } else {
    const byKind = new Map<string, number>();
    for (const issue of build.issues) {
      byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
    }
    for (const [kind, count] of [...byKind.entries()].sort()) {
      lines.push(`- ${kind}: ${count}`);
    }
    const listed = build.issues.filter((issue) => issue.kind !== "merged-relationship").slice(0, 40);
    if (listed.length > 0) {
      lines.push("");
      lines.push("Sample:");
      for (const issue of listed) {
        lines.push(`- ${issue.kind} ${issue.sheet}${issue.row ? ` r${issue.row}` : ""}: ${issue.detail}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
