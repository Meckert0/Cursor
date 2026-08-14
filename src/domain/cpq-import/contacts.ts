import { makePartId } from "./part-id.js";
import {
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

const SMART = "Mx.SmartPNCNT";
const ATTRIBUTES = "Mx.ContactAttributes";
const RETURN = "Mx.ContactReturn";
const RETURN_VPC = "Mx.ContactReturnVPC";
const TERMINALS = "Mx.Terminals";
const TIH = "Mx_TIHContacts";

const GENRE_MAP: Record<string, string> = {
  VPCCNTFAMILY: "VPC",
  VENDORCONTACT: "Vendor",
  FLYINGLEAD: "FlyingLead"
};

interface ContactDraft {
  part: CatalogPart;
  acceptedFamilies: Set<string>;
  terminalAwgs: number[];
  /** lengthAdded from Mx.ContactAttributes wins over other sources. */
  lengthFromAttributes: boolean;
}

/** A ContactReturn/VPC row resolved to a contact part, for module-contact compat. */
export interface ContactReturnLink {
  sheet: string;
  row: number;
  typeName: string;
  gender?: string;
  contactPartId: string;
}

export interface ContactBuildResult {
  parts: CatalogPart[];
  aliasCandidates: AliasCandidate[];
  /** contact 3-digit code -> set of normalized PNs (for compat + alias resolution). */
  codeToPns: Map<string, Set<string>>;
  returnLinks: ContactReturnLink[];
}

export function buildContacts(workbook: CpqWorkbook, ctx: BuildContext): ContactBuildResult {
  const byPn = new Map<string, ContactDraft>();
  const codeToPns = new Map<string, Set<string>>();

  const recordCode = (code: string | undefined, pn: string) => {
    if (!code) {
      return;
    }
    const set = codeToPns.get(code) ?? new Set<string>();
    set.add(pn);
    codeToPns.set(code, set);
  };

  const setField = (
    draft: ContactDraft,
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

  const getOrCreate = (pn: string, family: string | undefined, sheet: string, row: number): ContactDraft => {
    const existing = byPn.get(pn);
    if (existing) {
      existing.part.sources.push(`${sheet}:${row}`);
      return existing;
    }
    const draft: ContactDraft = {
      part: {
        id: makePartId("contact", pn),
        category: "contact",
        family: family ?? "UNSPECIFIED",
        partNumber: pn,
        description: "",
        attributes: {},
        flaggedForReview: false,
        sources: [`${sheet}:${row}`]
      },
      acceptedFamilies: new Set(),
      terminalAwgs: [],
      lengthFromAttributes: false
    };
    byPn.set(pn, draft);
    return draft;
  };

  // --- Pass 1: Mx.SmartPNCNT (master) ---
  const smart = getSheet(workbook, SMART, ctx);
  initSheet(ctx, SMART, smart.rows.length);
  for (const { row, cells } of smart.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, SMART, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.H);
    if (!pn) {
      recordOutcome(ctx, SMART, "skipped:missing-part-number");
      addException(ctx, SMART, "missing-part-number", "Row has no usable part number in column H.", row);
      continue;
    }
    const isNew = !byPn.has(pn);
    const family = textOrUndefined(cells.B);
    const draft = getOrCreate(pn, family, SMART, row);
    recordOutcome(ctx, SMART, isNew ? "produced-part" : "merged-duplicate-pn");
    if (family && draft.part.family === "UNSPECIFIED") {
      draft.part.family = family;
    } else if (family && draft.part.family !== family) {
      addException(
        ctx,
        SMART,
        "field-conflict",
        `PN ${pn}: conflicting family (${draft.part.family} vs ${family}); first value kept.`,
        row
      );
    }
    setField(draft, SMART, row, "gender", normalizeGender(cells.C));
    const rawGenre = textOrUndefined(cells.D);
    setField(draft, SMART, row, "genre", rawGenre ? GENRE_MAP[rawGenre.toUpperCase()] ?? rawGenre : undefined);
    setField(draft, SMART, row, "ssCompatible", boolOrUndefined(cells.G));
    // Column E (termination labor time), I (stud size here), J (plating) intentionally skipped.
    const lengthAdded = numberOrUndefined(cells.F, { zeroIsNull: true });
    if (lengthAdded !== undefined && !draft.lengthFromAttributes) {
      setField(draft, SMART, row, "lengthAdded", lengthAdded);
    }
    recordCode(textOrUndefined(cells.A), pn);
  }

  // --- Pass 2: Mx.ContactAttributes (accepted wire families, preferred lengthAdded) ---
  const attributes = getSheet(workbook, ATTRIBUTES, ctx);
  initSheet(ctx, ATTRIBUTES, attributes.rows.length);
  for (const { row, cells } of attributes.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, ATTRIBUTES, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.A);
    if (!pn) {
      recordOutcome(ctx, ATTRIBUTES, "skipped:placeholder-row");
      continue;
    }
    const isNew = !byPn.has(pn);
    const draft = getOrCreate(pn, textOrUndefined(cells.B), ATTRIBUTES, row);
    recordOutcome(ctx, ATTRIBUTES, isNew ? "produced-part" : "enriched-part");
    setField(draft, ATTRIBUTES, row, "gender", normalizeGender(cells.C));
    const acceptedFamily = textOrUndefined(cells.D);
    if (acceptedFamily) {
      draft.acceptedFamilies.add(acceptedFamily);
    }
    const lengthAdded = numberOrUndefined(cells.F, { zeroIsNull: true });
    if (lengthAdded !== undefined) {
      if (
        draft.part.attributes.lengthAdded !== undefined &&
        draft.part.attributes.lengthAdded !== lengthAdded &&
        draft.lengthFromAttributes
      ) {
        addException(
          ctx,
          ATTRIBUTES,
          "field-conflict",
          `PN ${pn}: conflicting lengthAdded within ${ATTRIBUTES} (${String(draft.part.attributes.lengthAdded)} vs ${lengthAdded}); first value kept.`,
          row
        );
      } else {
        draft.part.attributes.lengthAdded = lengthAdded;
        draft.lengthFromAttributes = true;
      }
    }
    recordCode(textOrUndefined(cells.E), pn);
  }

  // --- Pass 3: Mx.Terminals (stud size, accepted AWG range) ---
  const terminals = getSheet(workbook, TERMINALS, ctx);
  initSheet(ctx, TERMINALS, terminals.rows.length);
  for (const { row, cells } of terminals.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, TERMINALS, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.F);
    if (!pn) {
      recordOutcome(ctx, TERMINALS, "skipped:missing-part-number");
      addException(ctx, TERMINALS, "missing-part-number", "Row has no usable part number in column F.", row);
      continue;
    }
    const isNew = !byPn.has(pn);
    const draft = getOrCreate(pn, textOrUndefined(cells.A), TERMINALS, row);
    recordOutcome(ctx, TERMINALS, isNew ? "produced-part" : "enriched-part");
    setField(draft, TERMINALS, row, "studSize", textOrUndefined(cells.B));
    const awg = intOrUndefined(cells.D, { zeroIsNull: true });
    if (awg !== undefined) {
      draft.terminalAwgs.push(awg);
    }
    const lengthAdded = numberOrUndefined(cells.H, { zeroIsNull: true });
    if (lengthAdded !== undefined && draft.part.attributes.lengthAdded === undefined) {
      draft.part.attributes.lengthAdded = lengthAdded;
    }
    recordCode(textOrUndefined(cells.E), pn);
  }

  // --- Pass 4a: collect codes from ContactReturn/VPC rows with a single clean PN ---
  const returnSheets: Array<{ name: string; codeCol: string; pnCol: string; termCol: string }> = [
    { name: RETURN, codeCol: "D", pnCol: "E", termCol: "I" },
    { name: RETURN_VPC, codeCol: "E", pnCol: "F", termCol: "J" }
  ];
  for (const spec of returnSheets) {
    const sheet = getSheet(workbook, spec.name, ctx);
    for (const { cells } of sheet.rows) {
      const rawPn = textOrUndefined(cells[spec.pnCol]);
      if (!rawPn || rawPn.includes("/")) {
        continue;
      }
      const pn = normalizePartNumber(rawPn);
      if (pn) {
        recordCode(textOrUndefined(cells[spec.codeCol]), pn);
      }
    }
  }

  // --- Pass 4b: ContactReturn/VPC term types + module-contact link rows ---
  const returnLinks: ContactReturnLink[] = [];
  for (const spec of returnSheets) {
    const sheet = getSheet(workbook, spec.name, ctx);
    initSheet(ctx, spec.name, sheet.rows.length);
    for (const { row, cells } of sheet.rows) {
      if (isDefaultValueRow({ row, cells })) {
        recordOutcome(ctx, spec.name, "skipped:default-value-row");
        continue;
      }
      const typeName = textOrUndefined(cells.A);
      if (!typeName) {
        recordOutcome(ctx, spec.name, "skipped:placeholder-row");
        continue;
      }
      // Resolve the target contact: direct clean PN first, then unambiguous 3-digit code.
      let target: ContactDraft | undefined;
      const rawPn = textOrUndefined(cells[spec.pnCol]);
      if (rawPn && !rawPn.includes("/")) {
        const pn = normalizePartNumber(rawPn);
        if (pn) {
          target = byPn.get(pn);
        }
      }
      if (!target) {
        const code = textOrUndefined(cells[spec.codeCol]);
        if (code) {
          const pns = codeToPns.get(code);
          if (pns && pns.size === 1) {
            target = byPn.get(Array.from(pns)[0]);
          }
        }
      }
      if (!target) {
        recordOutcome(ctx, spec.name, "skipped:unresolvable-contact");
        addException(
          ctx,
          spec.name,
          "unresolvable-contact",
          `Type "${typeName}": neither PN "${String(cells[spec.pnCol])}" nor code ${String(
            cells[spec.codeCol]
          )} resolves to a single contact.`,
          row
        );
        continue;
      }
      recordOutcome(ctx, spec.name, "used-termtype-and-link");
      target.part.sources.push(`${spec.name}:${row}`);
      setField(target, spec.name, row, "termType", textOrUndefined(cells[spec.termCol]));
      returnLinks.push({
        sheet: spec.name,
        row,
        typeName,
        gender: normalizeGender(cells.B),
        contactPartId: target.part.id
      });
    }
  }

  // --- Pass 5: Mx_TIHContacts ---
  const tih = getSheet(workbook, TIH, ctx);
  initSheet(ctx, TIH, tih.rows.length);
  const tihSeen = new Set<string>();
  for (const { row, cells } of tih.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, TIH, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.A);
    if (!pn) {
      recordOutcome(ctx, TIH, "skipped:placeholder-row");
      continue;
    }
    const draft = byPn.get(pn);
    if (!draft) {
      recordOutcome(ctx, TIH, "skipped:unmatched-part-number");
      addException(ctx, TIH, "unmatched-part-number", `TIH PN ${pn} is not a known contact.`, row);
      continue;
    }
    if (tihSeen.has(pn)) {
      recordOutcome(ctx, TIH, "merged-duplicate-pn");
      continue;
    }
    tihSeen.add(pn);
    recordOutcome(ctx, TIH, "enriched-part");
    draft.part.sources.push(`${TIH}:${row}`);
    draft.part.attributes.tih = boolOrUndefined(cells.B) ?? true;
  }

  // --- Finalize: AWG ranges, accepted families, descriptions, aliases ---
  const aliasCandidates: AliasCandidate[] = [];
  for (const draft of byPn.values()) {
    const attrs = draft.part.attributes;
    if (draft.acceptedFamilies.size > 0) {
      attrs.acceptedFamilies = Array.from(draft.acceptedFamilies).sort();
    }
    if (draft.terminalAwgs.length > 0) {
      const min = Math.min(...draft.terminalAwgs);
      const max = Math.max(...draft.terminalAwgs);
      attrs.acceptedAwgMin = min;
      attrs.acceptedAwgMax = max;
      if (attrs.awg === undefined) {
        attrs.awg = min === max ? String(min) : `${min}-${max}`;
      }
    }
    const pieces = [`Contact ${draft.part.family}`];
    if (attrs.genre) {
      pieces.push(String(attrs.genre));
    }
    if (attrs.gender) {
      pieces.push(String(attrs.gender));
    }
    if (attrs.termType) {
      pieces.push(String(attrs.termType));
    }
    if (attrs.studSize) {
      pieces.push(`stud ${String(attrs.studSize)}`);
    }
    if (attrs.tih === true) {
      pieces.push("TIH");
    }
    draft.part.description = pieces.join(", ");
  }

  for (const [code, pns] of codeToPns.entries()) {
    if (pns.size !== 1) {
      addException(
        ctx,
        SMART,
        "alias-conflict",
        `Contact code ${code} maps to ${pns.size} part numbers (${Array.from(pns).sort().join(", ")}); no alias written.`
      );
      continue;
    }
    const pn = Array.from(pns)[0];
    const draft = byPn.get(pn);
    if (draft) {
      aliasCandidates.push({ codeSystem: "contact_3digit", code, partId: draft.part.id, sheet: SMART, row: 0 });
    }
  }

  return {
    parts: Array.from(byPn.values()).map((draft) => draft.part),
    aliasCandidates,
    codeToPns,
    returnLinks
  };
}
