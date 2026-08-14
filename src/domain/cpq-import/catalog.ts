import type { AwgCmaReference, ContactWireCompat, ModuleContactCompat } from "../library.js";
import { buildBackshells } from "./backshells.js";
import { buildContacts } from "./contacts.js";
import { buildContactWireCompat, buildModuleContactCompat } from "./compat.js";
import { buildLabels } from "./labels.js";
import { buildModules } from "./modules.js";
import { buildSleeves } from "./sleeves.js";
import { buildSplices } from "./splices.js";
import { buildStrainReliefs } from "./strain-reliefs.js";
import { buildWires } from "./wires.js";
import {
  addException,
  createContext,
  initSheet,
  recordOutcome,
  type AliasCandidate,
  type BuildContext,
  type CatalogPart,
  type CpqWorkbook,
  type ImportException,
  type SheetStats
} from "./types.js";

export interface ResolvedAlias {
  codeSystem: string;
  code: string;
  partId: string;
}

export interface CatalogBuild {
  parts: CatalogPart[];
  /** Unique (codeSystem, code) aliases keyed to deterministic part ids. */
  aliases: ResolvedAlias[];
  contactWireCompat: ContactWireCompat[];
  moduleContactCompat: ModuleContactCompat[];
  awgCmaReference: AwgCmaReference[];
  reviewFlaggedPartIds: string[];
  exceptions: ImportException[];
  sheetStats: Map<string, SheetStats>;
  unresolvedCompat: {
    wireCodes: Map<string, number>;
    contactCodes: Map<string, number>;
  };
}

/** Sheets deliberately not loaded (labor, CAD geometry, test fixtures, redundant copies). */
const OUT_OF_SCOPE_SHEETS_PREFIXES = ["2d_"];
const OUT_OF_SCOPE_SHEETS = new Set(
  [
    "Mx.TestingFixture",
    "Mx_Contact_2_TEST",
    "Mx.9500CoaxWireTimes",
    "Mx.9500StandardWireTimes",
    "Mx.CrimpCenterLoosePieceParts",
    "Mx.CrimpCenterReeledParts",
    "Mx.vpc_WireHandlingTime",
    "Mx_CutMachine_RunMachine",
    "Mx.zpc_RtgMaster"
  ].map((name) => name.toLowerCase())
);

export function buildCatalog(workbook: CpqWorkbook): CatalogBuild {
  const ctx: BuildContext = createContext();

  const wires = buildWires(workbook, ctx);
  const contacts = buildContacts(workbook, ctx);
  const modules = buildModules(workbook, ctx);
  const backshells = buildBackshells(workbook, ctx);
  const strainReliefs = buildStrainReliefs(workbook, ctx);
  const labels = buildLabels(workbook, ctx);
  const sleeves = buildSleeves(workbook, ctx);
  const splices = buildSplices(workbook, ctx);

  const parts: CatalogPart[] = [
    ...modules.parts,
    ...contacts.parts,
    ...wires.parts,
    ...backshells.parts,
    ...strainReliefs.parts,
    ...labels.parts,
    ...sleeves.parts,
    ...splices.parts
  ];

  // Global PN -> part id map for deferred cross-references. Ambiguous PNs
  // (same PN in two categories) resolve to nothing rather than a guess.
  const partIdsByPn = new Map<string, Set<string>>();
  for (const part of parts) {
    const set = partIdsByPn.get(part.partNumber) ?? new Set<string>();
    set.add(part.id);
    partIdsByPn.set(part.partNumber, set);
  }
  const resolvePn = (pn: string): string | undefined => {
    const ids = partIdsByPn.get(pn);
    return ids && ids.size === 1 ? Array.from(ids)[0] : undefined;
  };

  // Backshell keying part links.
  for (const part of backshells.parts) {
    const candidates = backshells.keyingCandidates.get(part.id);
    if (!candidates) {
      continue;
    }
    for (const keyingPn of candidates) {
      const resolved = resolvePn(keyingPn);
      if (resolved) {
        part.attributes.keyingPartId = resolved;
      } else {
        addException(
          ctx,
          "Mx.Backshell",
          "unresolvable-reference",
          `PN ${part.partNumber}: keying PN ${keyingPn} is not a catalog part; keyingPartId left empty.`
        );
      }
    }
  }

  // Strain relief related-module hints.
  for (const part of strainReliefs.parts) {
    const candidates = strainReliefs.relatedCandidates.get(part.id);
    if (!candidates) {
      continue;
    }
    for (const relatedPn of candidates) {
      const resolved = resolvePn(relatedPn);
      if (resolved) {
        part.attributes.relatedModuleHintPartId = resolved;
      } else {
        addException(
          ctx,
          "Mx.StrainRelief",
          "unresolvable-reference",
          `PN ${part.partNumber}: related PN ${relatedPn} is not a catalog part; hint left empty.`
        );
      }
    }
  }

  // Sleeve size-range related parts.
  for (const part of sleeves.parts) {
    const ranges = sleeves.sizeRangeDrafts.get(part.id) ?? [];
    const unresolved = new Set<string>();
    part.attributes.sizeRanges = ranges.map((range) => {
      const resolved = range.relatedPn ? resolvePn(range.relatedPn) : undefined;
      if (range.relatedPn && !resolved) {
        unresolved.add(range.relatedPn);
      }
      return {
        minDia: range.minDia,
        maxDia: range.maxDia,
        ...(resolved ? { relatedPartId: resolved } : {})
      };
    });
    for (const pn of unresolved) {
      addException(
        ctx,
        "Mx.SleeveTubeBraid",
        "unresolvable-reference",
        `PN ${part.partNumber}: related PN ${pn} is not a catalog part; relatedPartId left empty.`
      );
    }
  }

  // Alias uniqueness: (codeSystem, code) is globally unique in part_aliases.
  const aliasCandidates: AliasCandidate[] = [
    ...wires.aliasCandidates,
    ...contacts.aliasCandidates,
    ...modules.aliasCandidates
  ];
  const aliasByKey = new Map<string, ResolvedAlias>();
  for (const candidate of aliasCandidates) {
    const key = `${candidate.codeSystem}:${candidate.code}`;
    const existing = aliasByKey.get(key);
    if (!existing) {
      aliasByKey.set(key, {
        codeSystem: candidate.codeSystem,
        code: candidate.code,
        partId: candidate.partId
      });
    } else if (existing.partId !== candidate.partId) {
      addException(
        ctx,
        candidate.sheet,
        "alias-conflict",
        `Alias ${key} maps to both ${existing.partId} and ${candidate.partId}; alias dropped.`
      );
      aliasByKey.delete(key);
    }
  }
  const aliases = Array.from(aliasByKey.values()).sort((left, right) =>
    `${left.codeSystem}:${left.code}`.localeCompare(`${right.codeSystem}:${right.code}`)
  );

  // Compatibility junctions.
  const wirePartIdByPn = new Map(wires.parts.map((part) => [part.partNumber, part.id]));
  const contactPartIdByPn = new Map(contacts.parts.map((part) => [part.partNumber, part.id]));
  const contactWire = buildContactWireCompat(
    workbook,
    ctx,
    wires.codeToPns,
    wirePartIdByPn,
    contacts.codeToPns,
    contactPartIdByPn
  );
  const moduleContact = buildModuleContactCompat(ctx, contacts.returnLinks, modules.matchIndex);
  addException(
    ctx,
    "Mx.Backshell",
    "module-backshell-note",
    "module_backshell_compat is left empty: the workbook's backshell family rules (i1/i2/i2MX/iCon + gender) have no join key to specific modules, and Module2 column K holds protective covers, not backshells."
  );

  // Out-of-scope sheets, counted so the reconciliation covers the whole workbook.
  for (const [name, sheet] of workbook.entries()) {
    if (ctx.stats.has(name)) {
      continue;
    }
    const lower = name.toLowerCase();
    const outOfScope =
      OUT_OF_SCOPE_SHEETS.has(lower) ||
      OUT_OF_SCOPE_SHEETS_PREFIXES.some((prefix) => lower.startsWith(prefix));
    initSheet(ctx, name, sheet.rows.length);
    recordOutcome(ctx, name, outOfScope ? "skipped:out-of-scope" : "skipped:not-mapped", sheet.rows.length);
    if (!outOfScope && sheet.rows.length > 0) {
      addException(ctx, name, "sheet-not-mapped", `Sheet "${name}" was not consumed by any builder.`);
    }
  }

  const reviewFlaggedPartIds = parts.filter((part) => part.flaggedForReview).map((part) => part.id);

  return {
    parts,
    aliases,
    contactWireCompat: contactWire.rows,
    moduleContactCompat: moduleContact.rows,
    awgCmaReference: splices.awgCmaReference,
    reviewFlaggedPartIds,
    exceptions: ctx.exceptions,
    sheetStats: ctx.stats,
    unresolvedCompat: {
      wireCodes: contactWire.unresolvedWireCodes,
      contactCodes: contactWire.unresolvedContactCodes
    }
  };
}
