import { makePartId } from "./part-id.js";
import { boolOrUndefined, normalizePartNumber, numberOrUndefined, textOrUndefined } from "./normalize.js";
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

const MASTER = "Mx.Backshell";

interface Fitment {
  familyType: string;
  gender?: string;
  backshellSize?: string;
  emi?: boolean;
}

interface BackshellDraft {
  part: CatalogPart;
  fitments: Fitment[];
  fitmentKeys: Set<string>;
  keyingPns: Set<string>;
}

export interface BackshellBuildResult {
  parts: CatalogPart[];
  /** Deferred keying-part resolution: partId -> keying PN candidates. */
  keyingCandidates: Map<string, Set<string>>;
}

export function buildBackshells(workbook: CpqWorkbook, ctx: BuildContext): BackshellBuildResult {
  const byPn = new Map<string, BackshellDraft>();
  const master = getSheet(workbook, MASTER, ctx);
  initSheet(ctx, MASTER, master.rows.length);

  for (const { row, cells } of master.rows) {
    if (isDefaultValueRow({ row, cells })) {
      recordOutcome(ctx, MASTER, "skipped:default-value-row");
      continue;
    }
    const pn = normalizePartNumber(cells.E);
    if (!pn) {
      recordOutcome(ctx, MASTER, "skipped:missing-part-number");
      addException(ctx, MASTER, "missing-part-number", "Row has no usable part number in column E.", row);
      continue;
    }
    const familyType = textOrUndefined(cells.A) ?? "UNSPECIFIED";
    const gender = textOrUndefined(cells.B)?.toUpperCase();
    const size = textOrUndefined(cells.C);
    const emi = boolOrUndefined(cells.D);

    const isNew = !byPn.has(pn);
    let draft = byPn.get(pn);
    if (!draft) {
      draft = {
        part: {
          id: makePartId("backshell", pn),
          category: "backshell",
          family: familyType,
          partNumber: pn,
          description: "",
          attributes: {},
          flaggedForReview: false,
          sources: [`${MASTER}:${row}`]
        },
        fitments: [],
        fitmentKeys: new Set(),
        keyingPns: new Set()
      };
      byPn.set(pn, draft);
    } else {
      draft.part.sources.push(`${MASTER}:${row}`);
      if (familyType < draft.part.family) {
        draft.part.family = familyType;
      }
    }
    recordOutcome(ctx, MASTER, isNew ? "produced-part" : "merged-into-existing-part");

    const fitmentKey = `${familyType}|${gender ?? ""}|${size ?? ""}|${String(emi)}`;
    if (!draft.fitmentKeys.has(fitmentKey)) {
      draft.fitmentKeys.add(fitmentKey);
      draft.fitments.push({ familyType, gender, backshellSize: size, emi });
    }

    const keyingPn = normalizePartNumber(cells.F);
    if (keyingPn) {
      draft.keyingPns.add(keyingPn);
    }

    // Column G (install labor) and column H (constant per family) are skipped.
    // Column I is lengthAdded, except on RCV rows where the 0/5 pair is a sentinel.
    if (gender !== "RCV") {
      const lengthAdded = numberOrUndefined(cells.I, { zeroIsNull: true });
      if (lengthAdded !== undefined) {
        if (draft.part.attributes.lengthAdded === undefined) {
          draft.part.attributes.lengthAdded = lengthAdded;
        } else if (draft.part.attributes.lengthAdded !== lengthAdded) {
          addException(
            ctx,
            MASTER,
            "field-conflict",
            `PN ${pn}: conflicting lengthAdded (${String(draft.part.attributes.lengthAdded)} vs ${lengthAdded}); first value kept.`,
            row
          );
        }
      }
    }
  }

  const keyingCandidates = new Map<string, Set<string>>();
  for (const draft of byPn.values()) {
    draft.part.attributes.fitments = draft.fitments.map((fitment) => ({
      familyType: fitment.familyType,
      ...(fitment.gender !== undefined ? { gender: fitment.gender } : {}),
      ...(fitment.backshellSize !== undefined ? { backshellSize: fitment.backshellSize } : {}),
      ...(fitment.emi !== undefined ? { emi: fitment.emi } : {})
    }));
    const genders = Array.from(new Set(draft.fitments.map((f) => f.gender).filter(Boolean))).sort();
    const pieces = [`Backshell ${draft.part.family}`];
    if (genders.length > 0) {
      pieces.push(genders.join("/") as string);
    }
    if (draft.fitments.some((f) => f.emi === true)) {
      pieces.push("EMI variants");
    }
    draft.part.description = pieces.join(", ");
    if (draft.keyingPns.size > 0) {
      keyingCandidates.set(draft.part.id, draft.keyingPns);
    }
    // Only RCV fitments means the sentinel skip left no lengthAdded; note it once.
    if (
      draft.part.attributes.lengthAdded === undefined &&
      draft.fitments.every((f) => f.gender === "RCV")
    ) {
      addException(
        ctx,
        MASTER,
        "length-not-loaded",
        `PN ${draft.part.partNumber}: only RCV rows exist and their H/I values (0/5) are sentinels, so lengthAdded stays empty.`
      );
    }
  }

  return { parts: Array.from(byPn.values()).map((draft) => draft.part), keyingCandidates };
}
