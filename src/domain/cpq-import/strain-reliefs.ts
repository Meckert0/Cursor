import { makePartId } from "./part-id.js";
import { boolOrUndefined, normalizePartNumber, textOrUndefined } from "./normalize.js";
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

const MASTER = "Mx.StrainRelief";

export interface StrainReliefBuildResult {
  parts: CatalogPart[];
  /** Deferred related-module resolution: partId -> related PN candidates. */
  relatedCandidates: Map<string, Set<string>>;
}

export function buildStrainReliefs(workbook: CpqWorkbook, ctx: BuildContext): StrainReliefBuildResult {
  const byPn = new Map<string, { part: CatalogPart; related: Set<string> }>();
  const master = getSheet(workbook, MASTER, ctx);
  initSheet(ctx, MASTER, master.rows.length);

  for (const { row, cells } of master.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, MASTER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.A);
    if (!pn) {
      recordOutcome(ctx, MASTER, "skipped:missing-part-number");
      addException(ctx, MASTER, "missing-part-number", "Row has no usable part number in column A.", row);
      continue;
    }
    const gender = textOrUndefined(cells.C)?.toUpperCase();
    const requiresBackshell = boolOrUndefined(cells.D);

    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("strain-relief", pn),
          category: "strain-relief",
          family: "iSeries",
          partNumber: pn,
          description: "",
          attributes: {},
          flaggedForReview: false,
          sources: [`${MASTER}:${row}`]
        },
        related: new Set()
      };
      byPn.set(pn, draft);
    } else {
      draft.part.sources.push(`${MASTER}:${row}`);
    }
    recordOutcome(ctx, MASTER, isNew ? "produced-part" : "merged-duplicate-pn");

    const attrs = draft.part.attributes;
    if (gender !== undefined) {
      if (attrs.gender === undefined) {
        attrs.gender = gender;
      } else if (attrs.gender !== gender) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting gender (${String(attrs.gender)} vs ${gender}); first value kept.`,
          row
        );
      }
    }
    if (requiresBackshell !== undefined) {
      if (attrs.requiresBackshell === undefined) {
        attrs.requiresBackshell = requiresBackshell;
      } else if (attrs.requiresBackshell !== requiresBackshell) {
        addException(
          ctx,
          MASTER,
          "field-conflict",
          `PN ${pn}: conflicting requiresBackshell; first value kept.`,
          row
        );
      }
    }
    const related = normalizePartNumber(cells.B);
    if (related) {
      draft.related.add(related);
    }
    // Column E (install labor time) is skipped.
  }

  const relatedCandidates = new Map<string, Set<string>>();
  for (const draft of byPn.values()) {
    const attrs = draft.part.attributes;
    const pieces = [`Strain relief ${draft.part.family}`];
    if (attrs.gender) {
      pieces.push(String(attrs.gender));
    }
    if (attrs.requiresBackshell === true) {
      pieces.push("requires backshell");
    }
    draft.part.description = pieces.join(", ");
    if (draft.related.size > 0) {
      relatedCandidates.set(draft.part.id, draft.related);
    }
  }

  return { parts: Array.from(byPn.values()).map((draft) => draft.part), relatedCandidates };
}
