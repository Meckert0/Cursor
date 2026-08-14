import { makePartId } from "./part-id.js";
import { intOrUndefined, normalizePartNumber, numberOrUndefined, textOrUndefined } from "./normalize.js";
import {
  addException,
  getSheet,
  initSheet,
  isDefaultValueRow,
  recordOutcome,
  type BuildContext,
  type CatalogPart,
  type CpqWorkbook
} from "./types.js";
import type { AwgCmaReference } from "../library.js";

const MASTER = "Mx.Splice";
const SOLDER = "Mx.SolderSplice_PartNumber";
const CMA = "Mx.Splice_CMA";

export interface SpliceBuildResult {
  parts: CatalogPart[];
  awgCmaReference: AwgCmaReference[];
}

export function buildSplices(workbook: CpqWorkbook, ctx: BuildContext): SpliceBuildResult {
  const byPn = new Map<
    string,
    { part: CatalogPart; awgs: number[]; variants: Set<string> }
  >();

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
    const family = textOrUndefined(cells.A) ?? "UNSPECIFIED";
    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("splice", pn),
          category: "splice",
          family,
          partNumber: pn,
          description: "",
          attributes: {},
          flaggedForReview: false,
          sources: [`${MASTER}:${row}`]
        },
        awgs: [],
        variants: new Set()
      };
      byPn.set(pn, draft);
    } else {
      draft.part.sources.push(`${MASTER}:${row}`);
      if (draft.part.family !== family) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting family (${draft.part.family} vs ${family}); first value kept.`,
          row
        );
      }
    }
    recordOutcome(ctx, MASTER, isNew ? "produced-part" : "merged-into-existing-part");

    const conductorCount = intOrUndefined(cells.B, { zeroIsNull: true });
    const attrs = draft.part.attributes;
    if (conductorCount !== undefined) {
      if (attrs.conductorCount === undefined) {
        attrs.conductorCount = conductorCount;
      } else if (attrs.conductorCount !== conductorCount) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting conductorCount (${String(attrs.conductorCount)} vs ${conductorCount}); first value kept.`,
          row
        );
      }
    }
    const awg = intOrUndefined(cells.C, { zeroIsNull: true });
    if (awg !== undefined) {
      draft.awgs.push(awg);
    }
    const variant = textOrUndefined(cells.D);
    if (variant) {
      draft.variants.add(variant);
    }
    const manufacturerPn = textOrUndefined(cells.G);
    if (manufacturerPn !== undefined) {
      if (attrs.manufacturerPn === undefined) {
        attrs.manufacturerPn = manufacturerPn;
      } else if (attrs.manufacturerPn !== manufacturerPn) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting manufacturerPn (${String(attrs.manufacturerPn)} vs ${manufacturerPn}); first value kept.`,
          row
        );
      }
    }
    // Column E is a placeholder name ("ExampleSplice") -> skipped.
  }

  for (const draft of byPn.values()) {
    const attrs = draft.part.attributes;
    if (draft.awgs.length > 0) {
      const min = Math.min(...draft.awgs);
      const max = Math.max(...draft.awgs);
      attrs.awg = min === max ? String(min) : `${min}-${max}`;
    }
    if (draft.variants.size > 0) {
      attrs.variant = Array.from(draft.variants)
        .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right))
        .join(",");
    }
    const pieces = [`Splice ${draft.part.family}`];
    if (attrs.manufacturerPn) {
      pieces.push(String(attrs.manufacturerPn));
    }
    if (attrs.awg) {
      pieces.push(`AWG ${String(attrs.awg)}`);
    }
    if (attrs.variant) {
      pieces.push(`variant ${String(attrs.variant)}`);
    }
    draft.part.description = pieces.join(", ");
  }

  // --- Mx.SolderSplice_PartNumber: solder sleeve splices with CMA bands ---
  const solder = getSheet(workbook, SOLDER, ctx);
  initSheet(ctx, SOLDER, solder.rows.length);
  for (const { row, cells } of solder.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, SOLDER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.C);
    if (!pn) {
      recordOutcome(ctx, SOLDER, "skipped:sentinel-band");
      continue;
    }
    if (byPn.has(pn)) {
      recordOutcome(ctx, SOLDER, "merged-into-existing-part");
      addException(ctx, SOLDER, "duplicate-pn", `Solder splice PN ${pn} already exists.`, row);
      continue;
    }
    const cmaMin = numberOrUndefined(cells.A);
    const cmaMax = numberOrUndefined(cells.B);
    recordOutcome(ctx, SOLDER, "produced-part");
    byPn.set(pn, {
      part: {
        id: makePartId("splice", pn),
        category: "splice",
        family: "SolderSleeve",
        partNumber: pn,
        description: `Solder sleeve splice, CMA ${String(cmaMin ?? "?")}-${String(cmaMax ?? "?")}`,
        attributes: {
          ...(cmaMin !== undefined ? { cmaMin } : {}),
          ...(cmaMax !== undefined ? { cmaMax } : {})
        },
        flaggedForReview: false,
        sources: [`${SOLDER}:${row}`]
      },
      awgs: [],
      variants: new Set()
    });
  }

  // --- Mx.Splice_CMA: AWG -> CMA reference table ---
  const cmaSheet = getSheet(workbook, CMA, ctx);
  initSheet(ctx, CMA, cmaSheet.rows.length);
  const awgCmaReference: AwgCmaReference[] = [];
  for (const { row, cells } of cmaSheet.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, CMA, "skipped:default-value-row");
      continue;
    }
    const awg = textOrUndefined(cells.A);
    const cma = numberOrUndefined(cells.B, { zeroIsNull: true });
    if (!awg || cma === undefined) {
      recordOutcome(ctx, CMA, "skipped:placeholder-row");
      continue;
    }
    recordOutcome(ctx, CMA, "produced-reference-row");
    awgCmaReference.push({ awg, cma });
  }
  awgCmaReference.sort((left, right) => Number(left.awg) - Number(right.awg));

  return { parts: Array.from(byPn.values()).map((draft) => draft.part), awgCmaReference };
}
