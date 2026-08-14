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

const MASTER = "Mx.Label";

export function buildLabels(workbook: CpqWorkbook, ctx: BuildContext): { parts: CatalogPart[] } {
  const byPn = new Map<string, { part: CatalogPart; awgs: number[] }>();
  const master = getSheet(workbook, MASTER, ctx);
  initSheet(ctx, MASTER, master.rows.length);

  for (const { row, cells } of master.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, MASTER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.C);
    if (!pn) {
      recordOutcome(ctx, MASTER, "skipped:missing-part-number");
      addException(ctx, MASTER, "missing-part-number", "Row has no usable part number in column C.", row);
      continue;
    }
    const family = textOrUndefined(cells.A) ?? "UNSPECIFIED";
    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("label", pn),
          category: "label",
          family,
          partNumber: pn,
          description: "",
          attributes: {},
          flaggedForReview: false,
          sources: [`${MASTER}:${row}`]
        },
        awgs: []
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

    const awg = intOrUndefined(cells.B, { zeroIsNull: true });
    if (awg !== undefined) {
      draft.awgs.push(awg);
    }
    // Column D is application labor time -> skipped.
    const lengthIn = numberOrUndefined(cells.E, { zeroIsNull: true });
    const diaIn = numberOrUndefined(cells.F, { zeroIsNull: true });
    const series = textOrUndefined(cells.G);
    const attrs = draft.part.attributes;
    for (const [key, value] of Object.entries({ lengthIn, diaIn, series })) {
      if (value === undefined) {
        continue;
      }
      if (attrs[key] === undefined) {
        attrs[key] = value;
      } else if (attrs[key] !== value) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting ${key} (${String(attrs[key])} vs ${String(value)}); first value kept.`,
          row
        );
      }
    }
  }

  for (const draft of byPn.values()) {
    const attrs = draft.part.attributes;
    if (draft.awgs.length > 0) {
      attrs.awgMin = Math.min(...draft.awgs);
      attrs.awgMax = Math.max(...draft.awgs);
    }
    const pieces = [`Label ${draft.part.family}`];
    if (attrs.series) {
      pieces.push(String(attrs.series));
    }
    if (attrs.awgMin !== undefined) {
      pieces.push(
        attrs.awgMin === attrs.awgMax
          ? `AWG ${String(attrs.awgMin)}`
          : `AWG ${String(attrs.awgMin)}-${String(attrs.awgMax)}`
      );
    }
    draft.part.description = pieces.join(", ");
  }

  return { parts: Array.from(byPn.values()).map((draft) => draft.part) };
}
