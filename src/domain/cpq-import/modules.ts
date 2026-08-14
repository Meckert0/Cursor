import { makePartId } from "./part-id.js";
import {
  compactName,
  boolOrUndefined,
  intOrUndefined,
  normalizeGender,
  normalizePartNumber,
  numberOrUndefined,
  textOrUndefined
} from "./normalize.js";
import {
  addException,
  getSheet,
  initSheet,
  isDefaultValueRow,
  recordOutcome,
  type AliasCandidate,
  type BuildContext,
  type CatalogPart,
  type CpqWorkbook
} from "./types.js";

const MASTER = "Mx_Module2";
const CIRCULAR = "MX.CircularPinCount";
const PRETERM = "Mx.PreTerm_Wire_AWGs";
const ZPC_DSUB = "Mx.zpc_VendorConnectorDSUB";

interface ModuleDraft {
  part: CatalogPart;
  /** Extra description fragments (cover PN, second contact family, pigtail info). */
  extras: string[];
  vendorNames: Set<string>;
}

/** Index entry used later for module-contact compat name matching. */
export interface ModuleMatchEntry {
  partId: string;
  compactVendorNames: string[];
  family: string;
  gender?: string;
  pinCount?: number;
}

export interface ModuleBuildResult {
  parts: CatalogPart[];
  aliasCandidates: AliasCandidate[];
  matchIndex: ModuleMatchEntry[];
}

function deriveFamily(genre: string | undefined, vendorName: string | undefined): string | undefined {
  if (vendorName?.toUpperCase().startsWith("D38999")) {
    return "D38999";
  }
  if (genre === "VPC") {
    return "iSeries";
  }
  return undefined;
}

function looksLikeVendorPn(value: string): boolean {
  if (/\s/.test(value) || !/\d/.test(value)) {
    return false;
  }
  return value.includes("/") || value.includes("-") || value.length >= 6;
}

export function buildModules(workbook: CpqWorkbook, ctx: BuildContext): ModuleBuildResult {
  const byPn = new Map<string, ModuleDraft>();

  const setField = (
    draft: ModuleDraft,
    sheet: string,
    row: number,
    key: string,
    value: string | number | boolean | undefined
  ) => {
    if (value === undefined) {
      return;
    }
    const attrs = draft.part.attributes;
    if (attrs[key] === undefined) {
      attrs[key] = value;
    } else if (attrs[key] !== value) {
      addException(
        ctx,
        sheet,
        "field-conflict",
        `PN ${draft.part.partNumber}: conflicting ${key} (${String(attrs[key])} vs ${String(value)}); first value kept.`,
        row
      );
    }
  };

  // --- Pass 1: Mx_Module2 (master) ---
  const master = getSheet(workbook, MASTER, ctx);
  initSheet(ctx, MASTER, master.rows.length);
  for (const { row, cells } of master.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, MASTER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.I);
    if (!pn) {
      recordOutcome(ctx, MASTER, "skipped:missing-part-number");
      addException(ctx, MASTER, "missing-part-number", "Row has no usable part number in column I.", row);
      continue;
    }
    const genre = textOrUndefined(cells.A)?.toUpperCase();
    const vendorOrFamily1 = textOrUndefined(cells.D);
    const family = textOrUndefined(cells.B) ?? deriveFamily(genre, genre === "VENDOR" ? vendorOrFamily1 : undefined);

    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("module", pn),
          category: "module",
          family: family ?? "UNSPECIFIED",
          partNumber: pn,
          description: "",
          attributes: {},
          flaggedForReview: false,
          sources: [`${MASTER}:${row}`]
        },
        extras: [],
        vendorNames: new Set()
      };
      byPn.set(pn, draft);
      if (!family) {
        addException(ctx, MASTER, "missing-family", `PN ${pn}: no family in column B and none derivable.`, row);
      }
    } else {
      draft.part.sources.push(`${MASTER}:${row}`);
      if (family && draft.part.family === "UNSPECIFIED") {
        draft.part.family = family;
      } else if (family && draft.part.family !== family) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting family (${draft.part.family} vs ${family}); first value kept.`,
          row
        );
      }
    }
    recordOutcome(ctx, MASTER, isNew ? "produced-part" : "merged-duplicate-pn");

    setField(draft, MASTER, row, "genre", genre);
    setField(draft, MASTER, row, "gender", normalizeGender(cells.C));
    const emi = boolOrUndefined(cells.H);
    setField(draft, MASTER, row, "emi", emi);

    const pinCount = intOrUndefined(cells.E, { zeroIsNull: true });
    if (genre === "VPC") {
      // For VPC rows column D is the primary contact family, E its position count.
      setField(draft, MASTER, row, "contactFamily1", vendorOrFamily1);
      if (pinCount !== undefined) {
        setField(draft, MASTER, row, "pinCount", pinCount);
      }
    } else {
      if (vendorOrFamily1) {
        draft.vendorNames.add(vendorOrFamily1);
      }
      if (pinCount !== undefined) {
        setField(draft, MASTER, row, "pinCount", pinCount);
      }
    }

    // Columns F/G (second contact family + count): per decision they go into the
    // description and the module is left for manual review.
    const family2 = textOrUndefined(cells.F);
    const family2Count = textOrUndefined(cells.G);
    if (family2 || family2Count) {
      const note = `second contact group: ${family2 ?? "?"} x ${family2Count ?? "?"}`;
      if (!draft.extras.includes(note)) {
        draft.extras.push(note);
      }
      draft.part.flaggedForReview = true;
    }

    // Column K (default protective cover PN): description + review flag, no link.
    const cover = textOrUndefined(cells.K);
    if (cover) {
      const note = `default protective cover PN ${cover}`;
      if (!draft.extras.includes(note)) {
        draft.extras.push(note);
      }
      draft.part.flaggedForReview = true;
    }
    // Columns J, L, M, N intentionally dropped.
  }

  // --- Pass 2: MX.CircularPinCount (insert arrangement + pin count for D38999) ---
  const circular = getSheet(workbook, CIRCULAR, ctx);
  initSheet(ctx, CIRCULAR, circular.rows.length);
  const arrangementPinCount = new Map<string, { pinCount: number; row: number }>();
  for (const { row, cells } of circular.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, CIRCULAR, "skipped:default-value-row");
      continue;
    }
    const key = textOrUndefined(cells.A)?.toUpperCase();
    const pinCount = intOrUndefined(cells.B, { zeroIsNull: true });
    if (!key || pinCount === undefined) {
      recordOutcome(ctx, CIRCULAR, "skipped:placeholder-row");
      continue;
    }
    arrangementPinCount.set(key, { pinCount, row });
  }
  addException(
    ctx,
    CIRCULAR,
    "unlabeled-columns",
    "Per-contact-size columns C-I carry no header labels in the workbook, so contact-size groups are not loaded; only the total pin count (column B) is used."
  );
  const usedArrangements = new Set<string>();
  for (const draft of byPn.values()) {
    for (const vendorName of draft.vendorNames) {
      const upper = vendorName.toUpperCase();
      if (!upper.startsWith("D38999/")) {
        continue;
      }
      const matches: string[] = [];
      for (const key of arrangementPinCount.keys()) {
        if (upper.includes(`${key}P`) || upper.includes(`${key}S`)) {
          matches.push(key);
        }
      }
      // Prefer the longest key so B35 is not shadowed by a shorter partial match.
      matches.sort((left, right) => right.length - left.length);
      const key = matches[0];
      if (!key) {
        addException(
          ctx,
          CIRCULAR,
          "arrangement-not-found",
          `Vendor PN ${vendorName} (module ${draft.part.partNumber}) has no matching insert arrangement.`
        );
        continue;
      }
      usedArrangements.add(key);
      setField(draft, CIRCULAR, arrangementPinCount.get(key)?.row ?? 0, "insertArrangement", key);
      const pinCount = arrangementPinCount.get(key)?.pinCount;
      if (pinCount !== undefined) {
        if (draft.part.attributes.pinCount === undefined) {
          draft.part.attributes.pinCount = pinCount;
        } else if (draft.part.attributes.pinCount !== pinCount) {
          addException(
            ctx,
            CIRCULAR,
            "cross-check-mismatch",
            `Module ${draft.part.partNumber}: arrangement ${key} implies ${pinCount} positions but ${String(
              draft.part.attributes.pinCount
            )} already recorded; existing value kept.`
          );
        }
      }
    }
  }
  for (const [key, value] of arrangementPinCount.entries()) {
    recordOutcome(ctx, CIRCULAR, usedArrangements.has(key) ? "used-enrichment" : "skipped:no-module-reference");
    if (!usedArrangements.has(key)) {
      addException(
        ctx,
        CIRCULAR,
        "no-module-reference",
        `Insert arrangement ${key} (${value.pinCount} positions) is not referenced by any module vendor PN.`,
        value.row
      );
    }
  }

  // --- Pass 3: Mx.PreTerm_Wire_AWGs ("<FAMILY> <GENDER> <vendor name>" -> AWG + pins) ---
  const preterm = getSheet(workbook, PRETERM, ctx);
  initSheet(ctx, PRETERM, preterm.rows.length);
  for (const { row, cells } of preterm.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, PRETERM, "skipped:default-value-row");
      continue;
    }
    const label = textOrUndefined(cells.A);
    if (!label) {
      recordOutcome(ctx, PRETERM, "skipped:placeholder-row");
      continue;
    }
    const awg = intOrUndefined(cells.B, { zeroIsNull: true });
    const pinCount = intOrUndefined(cells.C, { zeroIsNull: true });
    const tokens = label.split(" ");
    const gender = tokens[1]?.toUpperCase() === "ML" || tokens[1]?.toUpperCase() === "FML" ? tokens[1].toUpperCase() : undefined;
    const rest = compactName(gender ? tokens.slice(2).join(" ") : tokens.slice(1).join(" "));
    const matches: ModuleDraft[] = [];
    if (rest) {
      for (const draft of byPn.values()) {
        const genderOk =
          gender === undefined ||
          draft.part.attributes.gender === undefined ||
          draft.part.attributes.gender === gender;
        if (!genderOk) {
          continue;
        }
        for (const vendorName of draft.vendorNames) {
          if (compactName(vendorName) === rest) {
            matches.push(draft);
            break;
          }
        }
      }
    }
    if (matches.length === 0) {
      recordOutcome(ctx, PRETERM, "skipped:unmatched-module");
      addException(ctx, PRETERM, "unmatched-module", `"${label}" does not match any module vendor name.`, row);
      continue;
    }
    recordOutcome(ctx, PRETERM, "used-enrichment");
    for (const draft of matches) {
      draft.part.sources.push(`${PRETERM}:${row}`);
      if (pinCount !== undefined && draft.part.attributes.pinCount === undefined) {
        draft.part.attributes.pinCount = pinCount;
      }
      if (awg !== undefined) {
        const note = `pre-terminated wire ${awg} AWG`;
        if (!draft.extras.includes(note)) {
          draft.extras.push(note);
        }
      }
    }
  }

  // --- Pass 4: Mx.zpc_VendorConnectorDSUB (pigtail DSUB modules) ---
  const zpc = getSheet(workbook, ZPC_DSUB, ctx);
  initSheet(ctx, ZPC_DSUB, zpc.rows.length);
  for (const { row, cells } of zpc.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, ZPC_DSUB, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.G);
    if (!pn) {
      recordOutcome(ctx, ZPC_DSUB, "skipped:missing-part-number");
      addException(ctx, ZPC_DSUB, "missing-part-number", "Row has no usable part number in column G.", row);
      continue;
    }
    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("module", pn),
          category: "module",
          family: "DSUB",
          partNumber: pn,
          description: "",
          attributes: { genre: "VENDOR" },
          flaggedForReview: false,
          sources: [`${ZPC_DSUB}:${row}`]
        },
        extras: [],
        vendorNames: new Set()
      };
      byPn.set(pn, draft);
    } else {
      draft.part.sources.push(`${ZPC_DSUB}:${row}`);
    }
    recordOutcome(ctx, ZPC_DSUB, isNew ? "produced-part" : "enriched-part");
    setField(draft, ZPC_DSUB, row, "gender", normalizeGender(cells.A));
    const pinCount = intOrUndefined(cells.C, { zeroIsNull: true });
    if (pinCount !== undefined && draft.part.attributes.pinCount === undefined) {
      draft.part.attributes.pinCount = pinCount;
    }
    const wireDescription = textOrUndefined(cells.B);
    const length = numberOrUndefined(cells.D, { zeroIsNull: true });
    if (wireDescription) {
      const note = `pigtail: ${wireDescription}${length !== undefined ? `, ${length} in` : ""}`;
      if (!draft.extras.includes(note)) {
        draft.extras.push(note);
      }
    }
  }

  // --- Finalize: descriptions, aliases, match index ---
  const aliasCandidates: AliasCandidate[] = [];
  const vendorPnToPartIds = new Map<string, Set<string>>();
  const matchIndex: ModuleMatchEntry[] = [];
  for (const draft of byPn.values()) {
    const attrs = draft.part.attributes;
    const pieces = [`Module ${draft.part.family}`];
    if (attrs.genre) {
      pieces.push(String(attrs.genre));
    }
    if (attrs.gender) {
      pieces.push(String(attrs.gender));
    }
    for (const vendorName of Array.from(draft.vendorNames).sort()) {
      pieces.push(vendorName);
    }
    if (attrs.contactFamily1) {
      pieces.push(`contacts ${String(attrs.contactFamily1)}`);
    }
    if (attrs.pinCount !== undefined) {
      pieces.push(`${String(attrs.pinCount)} pos`);
    }
    pieces.push(...draft.extras);
    draft.part.description = pieces.join(", ");

    for (const vendorName of draft.vendorNames) {
      if (looksLikeVendorPn(vendorName)) {
        const set = vendorPnToPartIds.get(vendorName) ?? new Set<string>();
        set.add(draft.part.id);
        vendorPnToPartIds.set(vendorName, set);
      }
    }

    matchIndex.push({
      partId: draft.part.id,
      compactVendorNames: Array.from(draft.vendorNames)
        .map((name) => compactName(name))
        .filter((name): name is string => name !== undefined),
      family: draft.part.family,
      gender: attrs.gender as string | undefined,
      pinCount: attrs.pinCount as number | undefined
    });
  }

  for (const [code, partIds] of vendorPnToPartIds.entries()) {
    if (partIds.size !== 1) {
      addException(
        ctx,
        MASTER,
        "alias-conflict",
        `Vendor PN "${code}" maps to ${partIds.size} modules; no alias written.`
      );
      continue;
    }
    aliasCandidates.push({
      codeSystem: "vendor_pn",
      code,
      partId: Array.from(partIds)[0],
      sheet: MASTER,
      row: 0
    });
  }

  return { parts: Array.from(byPn.values()).map((draft) => draft.part), aliasCandidates, matchIndex };
}
