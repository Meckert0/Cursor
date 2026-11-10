"use client";

import { useId, type CSSProperties } from "react";
import type { simModuleLayout } from "@/lib/sim-module-layout";
import type { SimInsertAssignment } from "@/lib/sim-modules";
import styles from "./sim-insert-controls.module.css";

const sameSlot = (left: string, right: string) => left.trim().toUpperCase() === right.trim().toUpperCase();
export const simInsertAt = (assignments: SimInsertAssignment[], slot: string) =>
  assignments.find(item => sameSlot(item.slotId, slot)) ?? assignments.find(item => item.occupiedSlotIds.some(id => sameSlot(id, slot)));

export function SimModuleFace({ layout, assignments, valid, reference, selectedSlot, onSelect }: {
  layout: ReturnType<typeof simModuleLayout>;
  assignments: SimInsertAssignment[];
  valid: SimInsertAssignment[];
  reference: string;
  selectedSlot?: string;
  onSelect?: (slotId: string) => void;
}) {
  const id = useId();
  const { width, height, end, slots } = layout;
  const selected = simInsertAt(assignments, selectedSlot ?? "");
  const state = (assignment: SimInsertAssignment | undefined) => assignment ? valid.includes(assignment) ? styles.filled : styles.attention : styles.empty;
  const notch = .6;
  const FaceTag = onSelect ? "div" : "span";
  return <FaceTag className={onSelect ? styles.moduleFace : styles.thumbnail} style={onSelect ? { width: layout.displayWidth, aspectRatio: `${width} / ${height}` } : undefined}>
    <svg viewBox={`0 0 ${width} ${height}`} role={onSelect ? undefined : "img"} aria-hidden={onSelect ? true : undefined} aria-label={onSelect ? undefined : `${reference} SIM slot layout`}>
      <path className={styles.housing} d={`M .3 ${height * .25} H ${end * .55} V .3 H ${width - end * .55} V ${height * .25} H ${width - .3} V ${height * .75} H ${width - end * .55} V ${height - .3} H ${end * .55} V ${height * .75} H .3 Z`} />
      {[end, width - end].map(x => <g key={x} className={styles.mount}>
        <circle cx={x} cy={height / 2} r="1.2" /><path d={`M ${x - .65} ${height / 2} h 1.3 M ${x} ${height / 2 - .65} v 1.3`} />
      </g>)}
      {slots.flat().map(slot => {
        const assignment = simInsertAt(assignments, slot.slotId);
        return <g key={slot.slotId} className={state(assignment)}>
          <path className={styles.cavity} d={`M ${slot.x + notch} ${slot.y} H ${slot.x + slot.width} V ${slot.y + slot.height} H ${slot.x} V ${slot.y + notch} H ${slot.x + notch} Z`} />
          {!onSelect ? <text x={slot.x + slot.width / 2} y={slot.y + slot.height / 2} dominantBaseline="central" textAnchor="middle">{slot.slotId}</text> : null}
        </g>;
      })}
      {layout.profile?.layout === "rows" ? slots.map((bank, index) => bank[0] ? <text key={index} className={styles.bankLabel} x={bank[0].x - 1.6} y={bank[0].y + bank[0].height / 2} dominantBaseline="central" textAnchor="end">{String.fromCharCode(65 + index)}</text> : null) : null}
    </svg>
    {onSelect ? slots.map((bank, row) => <div key={row} role="group" aria-label={`SIM section ${row + 1}`}>
      {bank.map(slot => {
        const assignment = simInsertAt(assignments, slot.slotId);
        const descriptionId = `${id}-${row}-${slot.column}`;
        const position: CSSProperties = { left: `${slot.x / width * 100}%`, top: `${slot.y / height * 100}%`, width: `${slot.width / width * 100}%`, height: `${slot.height / height * 100}%` };
        return <button type="button" key={slot.slotId} style={position} className={`${styles.slot} ${state(assignment)} ${selected && assignment === selected ? styles.related : ""}`} aria-label={`${reference} SIM slot ${slot.slotId}`} aria-describedby={descriptionId} aria-pressed={sameSlot(selectedSlot ?? "", slot.slotId)} onClick={() => onSelect(slot.slotId)}>
          <strong>{slot.slotId}</strong>
          <span id={descriptionId} className={styles.srOnly}>{assignment ? `${assignment.partNumber}. Slots ${assignment.occupiedSlotIds.join(", ")}.${!valid.includes(assignment) ? " Needs attention." : ""}` : "Empty slot"}</span>
        </button>;
      })}
    </div>) : null}
  </FaceTag>;
}
