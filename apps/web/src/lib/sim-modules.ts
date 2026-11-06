import type { LibraryComponentDto, RevisionDto } from "./api";
import { flattenFramePins } from "./connector-frames";
import { isSimHost, usableSimPins, type SimRelationship } from "../../../../src/domain/sim-modules";

export * from "../../../../src/domain/sim-modules";
export type { SimInsertAssignment } from "../../../../src/domain/types";

/** Upgrade legacy nominal host pins without changing insert assignments or wirelist rows. */
export function normalizeCanvasSimModules(connectors: RevisionDto["snapshot"]["connectors"], catalog: LibraryComponentDto[], relationships: SimRelationship[]): RevisionDto["snapshot"]["connectors"] {
  const normalize = <T extends { libraryComponentId?: string; partNumber?: string; pins: Array<{ id: string; number: string }>; simInserts?: import("./api").SimInsertAssignmentDto[] }>(carrier: T): T => {
    const host = catalog.find(part => carrier.libraryComponentId ? part.id === carrier.libraryComponentId : part.category === "module" && part.partNumber === carrier.partNumber);
    if (!host || !isSimHost(host)) return carrier;
    const simInserts = carrier.simInserts ?? [];
    const pins = usableSimPins(host, simInserts, catalog, relationships);
    if (carrier.simInserts !== undefined && JSON.stringify(pins) === JSON.stringify(carrier.pins)) return carrier;
    return { ...carrier, simInserts, pins };
  };
  let changed = false;
  const result = connectors.map(connector => {
    let next = connector;
    if (Array.isArray(connector.slots)) {
      const slots = connector.slots.map(normalize);
      if (slots.some((slot, index) => slot !== connector.slots![index]) || slots.some(slot => slot.simInserts !== undefined)) {
        const pins = flattenFramePins(slots);
        if (slots.some((slot, index) => slot !== connector.slots![index]) || JSON.stringify(pins) !== JSON.stringify(connector.pins)) next = { ...connector, slots, pins };
      }
    } else next = normalize(connector);
    if (next !== connector) changed = true;
    return next;
  });
  return changed ? result : connectors;
}
