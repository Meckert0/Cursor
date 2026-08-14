import type {
  ContactWireCompat,
  ModuleBackshellCompat,
  ModuleContactCompat,
  ModuleStrainReliefCompat
} from "../library.js";
import { compactName, normalizePartNumber, textOrUndefined } from "./normalize.js";
import { makePartId } from "./part-id.js";
import type { ContactReturnLink } from "./contacts.js";
import type { ModuleMatchEntry } from "./modules.js";
import {
  addException,
  getSheet,
  initSheet,
  isDefaultValueRow,
  recordOutcome,
  type BuildContext,
  type CpqWorkbook
} from "./types.js";

const COMPAT_SHEET = "Mx.ContactWireCompatability";
const CONNECTOR_STRAIN_RELIEF_SHEET = "Connector-Strain Relief";
const CONNECTOR_BACKSHELL_SHEET = "Connector-Backshell";

type ConnectorCompatAccessoryCategory = "strain-relief" | "backshell";

/** Resolve a 3-digit code to a part id when the code maps to exactly one built part. */
function resolveCode(
  code: string,
  codeToPns: Map<string, Set<string>>,
  partIdByPn: Map<string, string>
): string | undefined {
  const pns = codeToPns.get(code);
  if (!pns || pns.size !== 1) {
    return undefined;
  }
  return partIdByPn.get(Array.from(pns)[0]);
}

export interface ContactWireCompatResult {
  rows: ContactWireCompat[];
  unresolvedWireCodes: Map<string, number>;
  unresolvedContactCodes: Map<string, number>;
}

export function buildContactWireCompat(
  workbook: CpqWorkbook,
  ctx: BuildContext,
  wireCodeToPns: Map<string, Set<string>>,
  wirePartIdByPn: Map<string, string>,
  contactCodeToPns: Map<string, Set<string>>,
  contactPartIdByPn: Map<string, string>
): ContactWireCompatResult {
  const sheet = getSheet(workbook, COMPAT_SHEET, ctx);
  initSheet(ctx, COMPAT_SHEET, sheet.rows.length);
  const byPair = new Map<string, ContactWireCompat>();
  const unresolvedWireCodes = new Map<string, number>();
  const unresolvedContactCodes = new Map<string, number>();

  for (const { row, cells } of sheet.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, COMPAT_SHEET, "skipped:default-value-row");
      continue;
    }
    const wireCode = textOrUndefined(cells.A);
    const contactCode = textOrUndefined(cells.B);
    if (!wireCode || !contactCode) {
      recordOutcome(ctx, COMPAT_SHEET, "skipped:placeholder-row");
      continue;
    }
    const statusText = textOrUndefined(cells.D)?.toLowerCase();
    const status =
      statusText === "valid" ? "allowed" : statusText === "notvalid" ? "forbidden" : undefined;
    if (!status) {
      recordOutcome(ctx, COMPAT_SHEET, "skipped:unknown-status");
      addException(ctx, COMPAT_SHEET, "unknown-status", `Status "${String(cells.D)}" is not Valid/NotValid.`, row);
      continue;
    }
    const wirePartId = resolveCode(wireCode, wireCodeToPns, wirePartIdByPn);
    const contactPartId = resolveCode(contactCode, contactCodeToPns, contactPartIdByPn);
    if (!wirePartId || !contactPartId) {
      recordOutcome(ctx, COMPAT_SHEET, "skipped:unresolvable-code");
      if (!wirePartId) {
        unresolvedWireCodes.set(wireCode, (unresolvedWireCodes.get(wireCode) ?? 0) + 1);
      }
      if (!contactPartId) {
        unresolvedContactCodes.set(contactCode, (unresolvedContactCodes.get(contactCode) ?? 0) + 1);
      }
      continue;
    }
    const crimpClass = textOrUndefined(cells.C);
    const key = `${contactPartId}:${wirePartId}`;
    const existing = byPair.get(key);
    if (!existing) {
      recordOutcome(ctx, COMPAT_SHEET, "produced-compat-row");
      byPair.set(key, {
        contactPartId,
        wirePartId,
        status,
        ...(crimpClass !== undefined ? { crimpClass } : {})
      });
      continue;
    }
    recordOutcome(ctx, COMPAT_SHEET, "merged-duplicate-pair");
    if (existing.status !== status) {
      addException(
        ctx,
        COMPAT_SHEET,
        "status-conflict",
        `Pair ${contactPartId} x ${wirePartId}: conflicting statuses (${existing.status} vs ${status}); set to review.`,
        row
      );
      existing.status = "review";
    }
    if (crimpClass !== undefined && existing.crimpClass !== undefined && existing.crimpClass !== crimpClass) {
      addException(
        ctx,
        COMPAT_SHEET,
        "crimp-class-conflict",
        `Pair ${contactPartId} x ${wirePartId}: crimp class ${existing.crimpClass} vs ${crimpClass}; first kept.`,
        row
      );
    } else if (crimpClass !== undefined && existing.crimpClass === undefined) {
      existing.crimpClass = crimpClass;
    }
  }

  for (const [code, count] of unresolvedWireCodes.entries()) {
    addException(
      ctx,
      COMPAT_SHEET,
      "unresolved-wire-code",
      `Wire code ${code} (${count} rows) does not resolve to a wire part.`
    );
  }
  for (const [code, count] of unresolvedContactCodes.entries()) {
    addException(
      ctx,
      COMPAT_SHEET,
      "unresolved-contact-code",
      `Contact code ${code} (${count} rows) does not resolve to a contact part.`
    );
  }

  return { rows: Array.from(byPair.values()), unresolvedWireCodes, unresolvedContactCodes };
}

const DSUB_PATTERN = /^(\d+)pindb(female|male)$/;

export interface ModuleContactCompatResult {
  rows: ModuleContactCompat[];
  matchedLinks: number;
  unmatchedTypeNames: Map<string, number>;
}

/**
 * ContactReturn type names refer to modules only by loose display names, so
 * matches are heuristic: exact compact-name equality against Module2 vendor
 * names -> allowed; "<n>PinDB(Male|Female)" resolved by DSUB family, pin count
 * and gender -> review. Everything else is reported, not guessed.
 */
export function buildModuleContactCompat(
  ctx: BuildContext,
  links: ContactReturnLink[],
  modules: ModuleMatchEntry[]
): ModuleContactCompatResult {
  const byPair = new Map<string, ModuleContactCompat>();
  const unmatchedTypeNames = new Map<string, number>();
  let matchedLinks = 0;

  for (const link of links) {
    const compact = compactName(link.typeName);
    if (!compact) {
      continue;
    }
    let matches: Array<{ entry: ModuleMatchEntry; status: "allowed" | "review" }> = [];
    for (const entry of modules) {
      const genderOk = link.gender === undefined || entry.gender === undefined || entry.gender === link.gender;
      if (genderOk && entry.compactVendorNames.includes(compact)) {
        matches.push({ entry, status: "allowed" });
      }
    }
    if (matches.length === 0) {
      const dsub = DSUB_PATTERN.exec(compact);
      if (dsub) {
        const pins = Number(dsub[1]);
        const gender = dsub[2] === "female" ? "FML" : "ML";
        matches = modules
          .filter(
            (entry) =>
              entry.family.toUpperCase().includes("DSUB") &&
              entry.pinCount === pins &&
              (entry.gender === undefined || entry.gender === gender)
          )
          .map((entry) => ({ entry, status: "review" as const }));
      }
    }
    if (matches.length === 0) {
      unmatchedTypeNames.set(link.typeName, (unmatchedTypeNames.get(link.typeName) ?? 0) + 1);
      continue;
    }
    matchedLinks += 1;
    for (const match of matches) {
      const key = `${match.entry.partId}:${link.contactPartId}`;
      const existing = byPair.get(key);
      if (!existing) {
        byPair.set(key, {
          modulePartId: match.entry.partId,
          contactPartId: link.contactPartId,
          status: match.status,
          notes: `matched by type name "${link.typeName}" (${link.sheet}:${link.row})`,
          source: "cpq-import"
        });
      } else if (existing.status === "review" && match.status === "allowed") {
        existing.status = "allowed";
      }
    }
  }

  for (const [typeName, count] of unmatchedTypeNames.entries()) {
    addException(
      ctx,
      "Mx.ContactReturn",
      "module-name-unmatched",
      `Type name "${typeName}" (${count} rows) does not match any module; no module-contact compat written.`
    );
  }

  return { rows: Array.from(byPair.values()), matchedLinks, unmatchedTypeNames };
}

export interface ModuleStrainReliefCompatResult {
  rows: ModuleStrainReliefCompat[];
  unresolvedModulePns: Map<string, number>;
  unresolvedStrainReliefPns: Map<string, number>;
  stubModules: Array<{ id: string; partNumber: string }>;
  stubStrainReliefs: Array<{ id: string; partNumber: string }>;
}

function resolvePnToPartId(
  pn: string,
  category: "module" | ConnectorCompatAccessoryCategory,
  partIdByPn: Map<string, string>,
  useDeterministicIds: boolean
): string | undefined {
  const fromMap = partIdByPn.get(pn);
  if (fromMap) {
    return fromMap;
  }
  if (useDeterministicIds) {
    return makePartId(category, pn);
  }
  return undefined;
}

function isSkippableConnectorCompatRow(modulePn: string, accessoryPn: string): boolean {
  if (modulePn.startsWith("#") || accessoryPn.startsWith("#")) {
    return true;
  }
  return !/\d/.test(modulePn) || !/\d/.test(accessoryPn);
}

/**
 * Module ↔ strain relief pairs from the Connector_Compatibility_Only workbook
 * (sheet "Connector-Strain Relief", columns A=Connector, B=Strain Relief).
 */
export function buildModuleStrainReliefCompat(
  workbook: CpqWorkbook,
  ctx: BuildContext,
  options?: {
    modulePartIdByPn?: Map<string, string>;
    strainReliefPartIdByPn?: Map<string, string>;
    /** When true, unresolved PNs use deterministic prt-<category>-<pn> ids (import creates stubs). */
    useDeterministicIds?: boolean;
  }
): ModuleStrainReliefCompatResult {
  const sheet = getSheet(workbook, CONNECTOR_STRAIN_RELIEF_SHEET, ctx);
  initSheet(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, sheet.rows.length);
  const modulePartIdByPn = options?.modulePartIdByPn ?? new Map<string, string>();
  const strainReliefPartIdByPn = options?.strainReliefPartIdByPn ?? new Map<string, string>();
  const useDeterministicIds = options?.useDeterministicIds ?? false;
  const byPair = new Map<string, ModuleStrainReliefCompat>();
  const unresolvedModulePns = new Map<string, number>();
  const unresolvedStrainReliefPns = new Map<string, number>();
  const stubModules = new Map<string, { id: string; partNumber: string }>();
  const stubStrainReliefs = new Map<string, { id: string; partNumber: string }>();

  for (const { row, cells } of sheet.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "skipped:default-value-row");
      continue;
    }
    const modulePn = normalizePartNumber(cells.A);
    const strainReliefPn = normalizePartNumber(cells.B);
    if (!modulePn || !strainReliefPn) {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "skipped:placeholder-row");
      continue;
    }
    if (isSkippableConnectorCompatRow(modulePn, strainReliefPn)) {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "skipped:header-or-text-row");
      continue;
    }
    const modulePartId = resolvePnToPartId(modulePn, "module", modulePartIdByPn, useDeterministicIds);
    const strainReliefPartId = resolvePnToPartId(
      strainReliefPn,
      "strain-relief",
      strainReliefPartIdByPn,
      useDeterministicIds
    );
    if (!modulePartId) {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "skipped:unresolvable-module");
      unresolvedModulePns.set(modulePn, (unresolvedModulePns.get(modulePn) ?? 0) + 1);
      continue;
    }
    if (!strainReliefPartId) {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "skipped:unresolvable-strain-relief");
      unresolvedStrainReliefPns.set(strainReliefPn, (unresolvedStrainReliefPns.get(strainReliefPn) ?? 0) + 1);
      continue;
    }
    if (useDeterministicIds && !modulePartIdByPn.has(modulePn)) {
      stubModules.set(modulePartId, { id: modulePartId, partNumber: modulePn });
    }
    if (useDeterministicIds && !strainReliefPartIdByPn.has(strainReliefPn)) {
      stubStrainReliefs.set(strainReliefPartId, { id: strainReliefPartId, partNumber: strainReliefPn });
    }
    const key = `${modulePartId}:${strainReliefPartId}`;
    if (!byPair.has(key)) {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "produced-compat-row");
      byPair.set(key, {
        modulePartId,
        strainReliefPartId,
        status: "allowed",
        source: "connector-compat-import"
      });
    } else {
      recordOutcome(ctx, CONNECTOR_STRAIN_RELIEF_SHEET, "merged-duplicate-pair");
    }
  }

  for (const [pn, count] of unresolvedModulePns.entries()) {
    addException(
      ctx,
      CONNECTOR_STRAIN_RELIEF_SHEET,
      "unresolved-module-pn",
      `Connector PN ${pn} (${count} rows) does not resolve to a module part.`
    );
  }
  for (const [pn, count] of unresolvedStrainReliefPns.entries()) {
    addException(
      ctx,
      CONNECTOR_STRAIN_RELIEF_SHEET,
      "unresolved-strain-relief-pn",
      `Strain relief PN ${pn} (${count} rows) does not resolve to a strain-relief part.`
    );
  }

  return {
    rows: Array.from(byPair.values()),
    unresolvedModulePns,
    unresolvedStrainReliefPns,
    stubModules: Array.from(stubModules.values()),
    stubStrainReliefs: Array.from(stubStrainReliefs.values())
  };
}

export interface ModuleBackshellCompatResult {
  rows: ModuleBackshellCompat[];
  unresolvedModulePns: Map<string, number>;
  unresolvedBackshellPns: Map<string, number>;
  stubModules: Array<{ id: string; partNumber: string }>;
  stubBackshells: Array<{ id: string; partNumber: string }>;
}

/**
 * Module ↔ backshell pairs from the Connector_Compatibility_Only workbook
 * (sheet "Connector-Backshell", columns A=Connector, B=Backshell).
 */
export function buildModuleBackshellCompat(
  workbook: CpqWorkbook,
  ctx: BuildContext,
  options?: {
    modulePartIdByPn?: Map<string, string>;
    backshellPartIdByPn?: Map<string, string>;
    /** When true, unresolved PNs use deterministic prt-<category>-<pn> ids (import creates stubs). */
    useDeterministicIds?: boolean;
  }
): ModuleBackshellCompatResult {
  const sheet = getSheet(workbook, CONNECTOR_BACKSHELL_SHEET, ctx);
  initSheet(ctx, CONNECTOR_BACKSHELL_SHEET, sheet.rows.length);
  const modulePartIdByPn = options?.modulePartIdByPn ?? new Map<string, string>();
  const backshellPartIdByPn = options?.backshellPartIdByPn ?? new Map<string, string>();
  const useDeterministicIds = options?.useDeterministicIds ?? false;
  const byPair = new Map<string, ModuleBackshellCompat>();
  const unresolvedModulePns = new Map<string, number>();
  const unresolvedBackshellPns = new Map<string, number>();
  const stubModules = new Map<string, { id: string; partNumber: string }>();
  const stubBackshells = new Map<string, { id: string; partNumber: string }>();

  for (const { row, cells } of sheet.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "skipped:default-value-row");
      continue;
    }
    const modulePn = normalizePartNumber(cells.A);
    const backshellPn = normalizePartNumber(cells.B);
    if (!modulePn || !backshellPn) {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "skipped:placeholder-row");
      continue;
    }
    if (isSkippableConnectorCompatRow(modulePn, backshellPn)) {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "skipped:header-or-text-row");
      continue;
    }
    const modulePartId = resolvePnToPartId(modulePn, "module", modulePartIdByPn, useDeterministicIds);
    const backshellPartId = resolvePnToPartId(
      backshellPn,
      "backshell",
      backshellPartIdByPn,
      useDeterministicIds
    );
    if (!modulePartId) {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "skipped:unresolvable-module");
      unresolvedModulePns.set(modulePn, (unresolvedModulePns.get(modulePn) ?? 0) + 1);
      continue;
    }
    if (!backshellPartId) {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "skipped:unresolvable-backshell");
      unresolvedBackshellPns.set(backshellPn, (unresolvedBackshellPns.get(backshellPn) ?? 0) + 1);
      continue;
    }
    if (useDeterministicIds && !modulePartIdByPn.has(modulePn)) {
      stubModules.set(modulePartId, { id: modulePartId, partNumber: modulePn });
    }
    if (useDeterministicIds && !backshellPartIdByPn.has(backshellPn)) {
      stubBackshells.set(backshellPartId, { id: backshellPartId, partNumber: backshellPn });
    }
    const key = `${modulePartId}:${backshellPartId}`;
    if (!byPair.has(key)) {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "produced-compat-row");
      byPair.set(key, {
        modulePartId,
        backshellPartId,
        status: "allowed",
        source: "connector-compat-import"
      });
    } else {
      recordOutcome(ctx, CONNECTOR_BACKSHELL_SHEET, "merged-duplicate-pair");
    }
  }

  for (const [pn, count] of unresolvedModulePns.entries()) {
    addException(
      ctx,
      CONNECTOR_BACKSHELL_SHEET,
      "unresolved-module-pn",
      `Connector PN ${pn} (${count} rows) does not resolve to a module part.`
    );
  }
  for (const [pn, count] of unresolvedBackshellPns.entries()) {
    addException(
      ctx,
      CONNECTOR_BACKSHELL_SHEET,
      "unresolved-backshell-pn",
      `Backshell PN ${pn} (${count} rows) does not resolve to a backshell part.`
    );
  }

  return {
    rows: Array.from(byPair.values()),
    unresolvedModulePns,
    unresolvedBackshellPns,
    stubModules: Array.from(stubModules.values()),
    stubBackshells: Array.from(stubBackshells.values())
  };
}
