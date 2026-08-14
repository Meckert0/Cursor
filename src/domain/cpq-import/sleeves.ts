import { makePartId } from "./part-id.js";
import { normalizePartNumber, numberOrUndefined, textOrUndefined } from "./normalize.js";
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

const MASTER = "Mx.SleeveTubeBraid";

interface SizeRangeDraft {
  minDia: number;
  maxDia: number;
  relatedPn?: string;
}

export interface SleeveBuildResult {
  parts: CatalogPart[];
  /** Deferred related-part resolution: partId -> ordered size ranges with raw related PNs. */
  sizeRangeDrafts: Map<string, SizeRangeDraft[]>;
}

export function buildSleeves(workbook: CpqWorkbook, ctx: BuildContext): SleeveBuildResult {
  const byPn = new Map<string, { part: CatalogPart; ranges: SizeRangeDraft[] }>();
  const master = getSheet(workbook, MASTER, ctx);
  initSheet(ctx, MASTER, master.rows.length);

  for (const { row, cells } of master.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, MASTER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.D) ?? normalizePartNumber(cells.E) ?? normalizePartNumber(cells.G);
    if (!pn) {
      recordOutcome(ctx, MASTER, "skipped:missing-part-number");
      addException(ctx, MASTER, "missing-part-number", "Row has no part number in columns D, E, or G.", row);
      continue;
    }
    const family = textOrUndefined(cells.C) ?? "UNSPECIFIED";
    const minDia = numberOrUndefined(cells.A);
    const maxDia = numberOrUndefined(cells.B);

    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("sleeve-tube-braid", pn),
          category: "sleeve-tube-braid",
          family,
          partNumber: pn,
          description: "",
          attributes: {},
          flaggedForReview: false,
          sources: [`${MASTER}:${row}`]
        },
        ranges: []
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

    if (minDia === undefined || maxDia === undefined) {
      addException(ctx, MASTER, "missing-size-range", `PN ${pn}: missing min or max diameter.`, row);
      continue;
    }
    const relatedPn = normalizePartNumber(cells.F);
    if (!draft.ranges.some((r) => r.minDia === minDia && r.maxDia === maxDia && r.relatedPn === relatedPn)) {
      draft.ranges.push({ minDia, maxDia, relatedPn });
    }
  }

  const sizeRangeDrafts = new Map<string, SizeRangeDraft[]>();
  for (const draft of byPn.values()) {
    draft.ranges.sort((left, right) => left.minDia - right.minDia || left.maxDia - right.maxDia);
    sizeRangeDrafts.set(draft.part.id, draft.ranges);
    const min = draft.ranges.length > 0 ? Math.min(...draft.ranges.map((r) => r.minDia)) : undefined;
    const max = draft.ranges.length > 0 ? Math.max(...draft.ranges.map((r) => r.maxDia)) : undefined;
    const pieces = [`Sleeve/tube/braid ${draft.part.family}`];
    if (min !== undefined && max !== undefined) {
      pieces.push(`dia ${min}-${max} in`);
    }
    draft.part.description = pieces.join(", ");
  }

  return { parts: Array.from(byPn.values()).map((draft) => draft.part), sizeRangeDrafts };
}
