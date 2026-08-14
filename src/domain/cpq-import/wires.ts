import { makePartId } from "./part-id.js";
import {
  intOrUndefined,
  normalizePartNumber,
  normalizeWireType,
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

const MASTER = "Mx_WireReturnV2";
const ATTRIBUTES = "Mx.WireAttributes";
const SMART = "Mx.SmartPNWRE";
const TYPES = "Mx_WireTypes";

interface WireDraft {
  part: CatalogPart;
  codes: Set<string>;
}

export interface WireBuildResult {
  parts: CatalogPart[];
  aliasCandidates: AliasCandidate[];
  /** wire 3-digit code -> set of normalized PNs (for compat resolution). */
  codeToPns: Map<string, Set<string>>;
}

export function buildWires(workbook: CpqWorkbook, ctx: BuildContext): WireBuildResult {
  const byPn = new Map<string, WireDraft>();
  const codeToPns = new Map<string, Set<string>>();
  const aliasCandidates: AliasCandidate[] = [];

  const recordCode = (code: string | undefined, pn: string) => {
    if (!code) {
      return;
    }
    const set = codeToPns.get(code) ?? new Set<string>();
    set.add(pn);
    codeToPns.set(code, set);
  };

  const master = getSheet(workbook, MASTER, ctx);
  initSheet(ctx, MASTER, master.rows.length);
  for (const { row, cells } of master.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, MASTER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.F);
    if (!pn) {
      recordOutcome(ctx, MASTER, "skipped:missing-part-number");
      addException(ctx, MASTER, "missing-part-number", "Row has no usable part number in column F.", row);
      continue;
    }
    const awg = textOrUndefined(cells.A);
    const color = textOrUndefined(cells.B);
    if (!awg || !color) {
      recordOutcome(ctx, MASTER, "skipped:missing-awg-or-color");
      addException(ctx, MASTER, "missing-awg-or-color", `PN ${pn}: wire requires AWG and color.`, row);
      continue;
    }
    const insulation = textOrUndefined(cells.C);
    const wireType = normalizeWireType(cells.D);
    const code = textOrUndefined(cells.E);
    const conductors = intOrUndefined(cells.G, { zeroIsNull: true });

    const existing = byPn.get(pn);
    if (existing) {
      recordOutcome(ctx, MASTER, "merged-duplicate-pn");
      existing.part.sources.push(`${MASTER}:${row}`);
      if (code) {
        existing.codes.add(code);
        recordCode(code, pn);
      }
      const attrs = existing.part.attributes;
      for (const [key, value] of Object.entries({
        awg,
        color,
        insulationMaterial: insulation,
        wireType,
        numberOfConductors: conductors
      })) {
        if (value === undefined) {
          continue;
        }
        if (attrs[key] === undefined) {
          attrs[key] = value;
        } else if (attrs[key] !== value) {
          addException(
            ctx,
            MASTER,
            "duplicate-pn-conflict",
            `PN ${pn}: conflicting ${key} (${String(attrs[key])} vs ${String(value)}); first value kept.`,
            row
          );
        }
      }
      continue;
    }

    const part: CatalogPart = {
      id: makePartId("wire", pn),
      category: "wire",
      family: wireType ?? "UNSPECIFIED",
      partNumber: pn,
      description: "",
      attributes: {
        awg,
        color,
        insulationMaterial: insulation,
        wireType,
        numberOfConductors: conductors
      },
      flaggedForReview: false,
      sources: [`${MASTER}:${row}`]
    };
    const draft: WireDraft = { part, codes: new Set(code ? [code] : []) };
    byPn.set(pn, draft);
    recordCode(code, pn);
    recordOutcome(ctx, MASTER, "produced-part");
  }

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
    const draft = byPn.get(pn);
    if (!draft) {
      recordOutcome(ctx, ATTRIBUTES, "skipped:unmatched-part-number");
      addException(ctx, ATTRIBUTES, "unmatched-part-number", `PN ${pn} not present in ${MASTER}.`, row);
      continue;
    }
    recordOutcome(ctx, ATTRIBUTES, "enriched-part");
    draft.part.sources.push(`${ATTRIBUTES}:${row}`);
    const attrs = draft.part.attributes;
    const overallDia = numberOrUndefined(cells.B, { zeroIsNull: true });
    const conductorDia = numberOrUndefined(cells.C, { zeroIsNull: true });
    const tempMax = numberOrUndefined(cells.D, { zeroIsNull: true });
    const conductors = intOrUndefined(cells.E, { zeroIsNull: true });
    const milSpec = textOrUndefined(cells.F);
    const weightPerFt = numberOrUndefined(cells.G, { zeroIsNull: true });
    if (overallDia !== undefined) {
      attrs.overallDia = overallDia;
    }
    if (conductorDia !== undefined) {
      attrs.conductorDia = conductorDia;
    }
    if (tempMax !== undefined) {
      attrs.tempMax = tempMax;
    }
    if (conductors !== undefined) {
      if (attrs.numberOfConductors !== undefined && attrs.numberOfConductors !== conductors) {
        addException(
          ctx,
          ATTRIBUTES,
          "cross-check-mismatch",
          `PN ${pn}: conductor count ${conductors} here vs ${String(attrs.numberOfConductors)} in ${MASTER}; ${ATTRIBUTES} wins.`,
          row
        );
      }
      attrs.numberOfConductors = conductors;
    }
    if (milSpec !== undefined) {
      attrs.milSpec = milSpec;
    }
    if (weightPerFt !== undefined) {
      attrs.weightPerFt = weightPerFt;
    }
  }

  const smart = getSheet(workbook, SMART, ctx);
  initSheet(ctx, SMART, smart.rows.length);
  for (const { row, cells } of smart.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, SMART, "skipped:default-value-row");
      continue;
    }
    const code = textOrUndefined(cells.A);
    const pn = normalizePartNumber(cells.G);
    if (!code || !pn) {
      recordOutcome(ctx, SMART, "skipped:placeholder-row");
      continue;
    }
    recordOutcome(ctx, SMART, "cross-check");
    recordCode(code, pn);
    const draft = byPn.get(pn);
    if (!draft) {
      addException(ctx, SMART, "unmatched-part-number", `PN ${pn} (code ${code}) not present in ${MASTER}.`, row);
      continue;
    }
    const awg = textOrUndefined(cells.B);
    if (awg && draft.part.attributes.awg !== awg) {
      addException(
        ctx,
        SMART,
        "cross-check-mismatch",
        `PN ${pn}: AWG ${awg} here vs ${String(draft.part.attributes.awg)} in ${MASTER}.`,
        row
      );
    }
  }

  const types = getSheet(workbook, TYPES, ctx);
  initSheet(ctx, TYPES, types.rows.length);
  for (const { row, cells } of types.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, TYPES, "skipped:default-value-row");
      continue;
    }
    const code = textOrUndefined(cells.A);
    const wireType = normalizeWireType(cells.B);
    if (!code || !wireType) {
      recordOutcome(ctx, TYPES, "skipped:placeholder-row");
      continue;
    }
    recordOutcome(ctx, TYPES, "cross-check");
    const pns = codeToPns.get(code);
    if (!pns) {
      addException(ctx, TYPES, "unmatched-code", `Wire code ${code} has no part number in ${MASTER}/${SMART}.`, row);
      continue;
    }
    for (const pn of pns) {
      const draft = byPn.get(pn);
      if (draft && draft.part.attributes.wireType !== undefined && draft.part.attributes.wireType !== wireType) {
        addException(
          ctx,
          TYPES,
          "cross-check-mismatch",
          `Code ${code} (PN ${pn}): wire type ${wireType} here vs ${String(draft.part.attributes.wireType)}.`,
          row
        );
      }
    }
  }

  for (const draft of byPn.values()) {
    const attrs = draft.part.attributes;
    const pieces = [`Wire ${String(attrs.awg)} AWG ${String(attrs.color)}`];
    if (attrs.insulationMaterial) {
      pieces.push(String(attrs.insulationMaterial));
    }
    if (attrs.wireType) {
      pieces.push(String(attrs.wireType));
    }
    if (attrs.milSpec) {
      pieces.push(String(attrs.milSpec));
    }
    draft.part.description = pieces.join(", ");
    for (const code of Array.from(draft.codes).sort()) {
      aliasCandidates.push({
        codeSystem: "wire_3digit",
        code,
        partId: draft.part.id,
        sheet: MASTER,
        row: 0
      });
    }
  }

  return { parts: Array.from(byPn.values()).map((draft) => draft.part), aliasCandidates, codeToPns };
}
