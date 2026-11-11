import type { CompatPair, PartRelationshipInput } from "../../domain/library.js";
import type { Store } from "./store.js";

export const PAIR_TYPES = {
  "contact-wire": { type: "WIRE_ALLOWED", left: "contactPartId", right: "wirePartId" },
  "module-contact": { type: "CONTACT_ALLOWED", left: "modulePartId", right: "contactPartId" },
  "module-backshell": { type: "BACKSHELL_ALLOWED", left: "modulePartId", right: "backshellPartId" },
  "module-strain-relief": { type: "STRAIN_RELIEF_ALLOWED", left: "modulePartId", right: "strainReliefPartId" }
} as const;

export type PairKind = keyof typeof PAIR_TYPES;
type PairOf<K extends PairKind> = Omit<Extract<CompatPair, { kind: K }>, "kind">;

export function pairRelationship<K extends PairKind>(kind: K, input: PairOf<K>): PartRelationshipInput {
  const fields = PAIR_TYPES[kind];
  const pair = input as unknown as Record<string, string>;
  const legacyPairKey = `${kind}:${pair[fields.left]}:${pair[fields.right]}`;
  return {
    id: `pair-${legacyPairKey}`, legacyPairKey,
    parentPartId: pair[fields.left], targetPartIds: [pair[fields.right]],
    relationshipType: fields.type, parentPositions: [], isExhaustive: false,
    status: input.status, notes: pair.notes, source: pair.source,
    extra: pair.crimpClass ? { crimpClass: pair.crimpClass } : undefined
  };
}

export async function listPairs<K extends PairKind>(store: Store, kind: K): Promise<PairOf<K>[]> {
  const fields = PAIR_TYPES[kind];
  const rows = await store.listPartRelationships({ relationshipType: fields.type });
  return rows.filter(row => row.legacyPairKey?.startsWith(`${kind}:`)).flatMap(row => (row.targetPartIds ?? []).map(target => ({
    [fields.left]: row.parentPartId, [fields.right]: target, status: row.status,
    ...(row.notes !== undefined ? { notes: row.notes } : {}),
    ...(kind !== "contact-wire" && row.source !== undefined ? { source: row.source } : {}),
    ...(kind === "contact-wire" && row.extra?.crimpClass !== undefined ? { crimpClass: row.extra.crimpClass } : {})
  } as PairOf<K>)));
}

export async function upsertPair<K extends PairKind>(store: Store, kind: K, pair: PairOf<K>): Promise<PairOf<K>> {
  await store.upsertPartRelationship(pairRelationship(kind, pair));
  return pair;
}

export async function deletePair<K extends PairKind>(store: Store, kind: K, pair: Omit<PairOf<K>, "status">): Promise<boolean> {
  const fields = PAIR_TYPES[kind];
  const value = pair as unknown as Record<string, string>;
  const legacyPairKey = `${kind}:${value[fields.left]}:${value[fields.right]}`;
  const rows = await store.listPartRelationships({ parentPartId: value[fields.left] });
  const row = rows.find(row => row.legacyPairKey === legacyPairKey);
  return row ? store.deletePartRelationship({ id: row.id }) : false;
}
