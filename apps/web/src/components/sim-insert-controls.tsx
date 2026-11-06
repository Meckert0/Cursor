"use client";

import { useId } from "react";
import type { LibraryComponentDto } from "@/lib/api";
import { isSimHost, simAssignmentValid, simSlotIds, simSlotCapacity, type SimInsertAssignment, type SimRelationship } from "@/lib/sim-modules";
import styles from "./cable-canvas.module.css";

export function SimInsertControls({ host, assignments = [], catalog, relationships, reference, expanded, onToggle, onChoose, onRemove, readOnly }: {
  host?: LibraryComponentDto;
  assignments?: SimInsertAssignment[];
  catalog: LibraryComponentDto[];
  relationships: SimRelationship[];
  reference: string;
  expanded: boolean;
  onToggle: () => void;
  onChoose: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  readOnly: boolean;
}) {
  const listId = useId();
  const sameSlot = (left: string, right: string) => left.trim().toUpperCase() === right.trim().toUpperCase();
  if (!isSimHost(host) && !assignments.length) return null;
  const slots = simSlotIds(host);
  const valid = assignments.filter(item => simAssignmentValid(host, item, assignments, catalog, relationships));
  const filled = new Set(valid.flatMap(item => item.occupiedSlotIds)).size;
  const invalid = assignments.length - valid.length;
  const rows = [...slots, ...assignments.map(item => item.slotId).filter(id => !slots.some(slot => sameSlot(slot, id)))];
  return <div className={styles.simControls}>
    <button className={styles.simToggle} type="button" aria-expanded={expanded} aria-controls={listId} aria-label={`Configure SIM inserts for ${reference}`} onClick={onToggle}>
      SIM slots · {filled}/{simSlotCapacity(host)} filled{invalid ? ` · ${invalid} need attention` : ""} <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
    </button>
    {expanded ? <div id={listId} className={styles.simSlots} role="region" aria-label={`${reference} SIM slots`}>
      {slots.length !== simSlotCapacity(host) || !slots.length ? <p className={styles.quickAddError}>{isSimHost(host) ? "Complete this module’s SIM slot layout in the library." : "Choose a SIM module or remove these inserts."}</p> : null}
      {Array.from(new Set(rows)).map(slotId => {
        const assignment = assignments.find(item => sameSlot(item.slotId, slotId));
        const covering = assignments.find(item => item.occupiedSlotIds.some(slot => sameSlot(slot, slotId)));
        const part = catalog.find(item => item.id === assignment?.libraryComponentId);
        const problem = assignment && !valid.includes(assignment);
        return <div className={styles.simSlotRow} key={slotId} role="group" aria-label={`${reference} SIM slot ${slotId}`}>
          <strong>{slotId}</strong>
          {assignment ? <>
            <div className={styles.partSummary}><button type="button" className={styles.changeConnectorButton} disabled={readOnly} aria-label={`Change SIM insert ${slotId} for ${reference}`} onClick={() => onChoose(slotId)}>{assignment.partNumber}</button>
              {part?.description ? <span className={styles.partDescription}> · {part.description}</span> : null}
              {assignment.occupiedSlotIds.length > 1 ? <span className={styles.partDescription}> · Slots {assignment.occupiedSlotIds.join(", ")}</span> : null}
              {problem ? <p className={styles.quickAddError}>This insert no longer fits or is not compatible.</p> : null}
            </div>
            <button type="button" disabled={readOnly} aria-label={`Remove SIM insert ${slotId} for ${reference}`} onClick={() => onRemove(slotId)}>Remove</button>
          </> : covering ? <span className={styles.partDescription}>Occupied by {covering.partNumber} at {covering.slotId}</span> : <button type="button" disabled={readOnly} aria-label={`Select SIM insert ${slotId} for ${reference}`} onClick={() => onChoose(slotId)}>Select SIM insert</button>}
        </div>;
      })}
    </div> : null}
  </div>;
}
