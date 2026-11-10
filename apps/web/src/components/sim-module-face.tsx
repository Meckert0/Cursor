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
  return <FaceTag className={`${onSelect ? styles.moduleFace : styles.thumbnail} ${layout.portrait ? onSelect ? styles.moduleFacePortrait : styles.thumbnailPortrait : ""}`} style={onSelect ? { width: layout.displayWidth, aspectRatio: `${width} / ${height}` } : undefined}>
    <svg viewBox={`0 0 ${width} ${height}`} role={onSelect ? undefined : "img"} aria-hidden={onSelect ? true : undefined} aria-label={onSelect ? undefined : `${reference} SIM slot layout`}>
      {layout.portrait ? <IconMatingFace layout={layout} assignments={assignments} valid={valid} clipId={id} /> : <>
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
      </>}
    </svg>
    {onSelect ? slots.map((bank, row) => <div key={row} role="group" aria-label={`SIM section ${row + 1}`}>
      {bank.map(slot => {
        const assignment = simInsertAt(assignments, slot.slotId);
        const descriptionId = `${id}-${row}-${slot.column}`;
        const position: CSSProperties = { left: `${slot.x / width * 100}%`, top: `${slot.y / height * 100}%`, width: `${slot.width / width * 100}%`, height: `${slot.height / height * 100}%` };
        return <button type="button" key={slot.slotId} style={position} className={`${styles.slot} ${state(assignment)} ${selected && assignment === selected ? styles.related : ""}`} aria-label={`${reference} SIM slot ${slot.slotId}${layout.portrait ? ` (${slot.label})` : ""}`} aria-describedby={descriptionId} aria-pressed={sameSlot(selectedSlot ?? "", slot.slotId)} onClick={() => onSelect(slot.slotId)}>
          <strong>{slot.label}</strong>
          <span id={descriptionId} className={styles.srOnly}>{layout.portrait ? `Mating-face position ${slot.label}. ` : ""}{assignment ? `${assignment.partNumber}. Slots ${assignment.occupiedSlotIds.join(", ")}.${!valid.includes(assignment) ? " Needs attention." : ""}` : "Empty slot"}</span>
        </button>;
      })}
    </div>) : null}
  </FaceTag>;
}

function openingPath(top: number) {
  let path = `M 20 ${top}`;
  for (let column = 0; column < 8; column++) {
    const left = 20 + column * 27 + 6.5;
    path += ` H ${left} V ${top - 20} H ${left + 14} V ${top}`;
  }
  path += ` H 236 V ${top + 90}`;
  for (let column = 7; column >= 0; column--) {
    const left = 20 + column * 27 + 6.5;
    path += ` H ${left + 14} V ${top + 110} H ${left} V ${top + 90}`;
  }
  return `${path} H 20 Z`;
}

/** The supplied 510161130 mating-face reference, without its drawing leaders. */
function IconMatingFace({ layout, assignments, valid, clipId }: {
  layout: ReturnType<typeof simModuleLayout>; assignments: SimInsertAssignment[]; valid: SimInsertAssignment[]; clipId: string;
}) {
  return <g transform={`scale(${layout.width / 256} ${layout.height / 480})`}>
    <path className={styles.portraitHousing} d="M 1 25 Q 1 1 25 1 H 40 Q 64 1 64 25 Q 64 44 84 44 H 172 Q 192 44 192 25 Q 192 1 216 1 H 231 Q 255 1 255 25 V 455 Q 255 479 231 479 H 216 Q 192 479 192 455 Q 192 436 172 436 H 84 Q 64 436 64 455 Q 64 479 40 479 H 25 Q 1 479 1 455 Z" />
    <rect className={styles.portraitFrame} x="2" y="50" width="252" height="380" rx="20" />
    <rect className={styles.portraitFrame} x="7" y="56" width="242" height="368" rx="15" />
    {[[31, 28], [225, 28], [31, 452], [225, 452]].map(([x, y], index) => <g key={index} className={styles.portraitMount}>
      <circle cx={x} cy={y} r="17" />
      {index === 0 || index === 3 ? <path d={`M ${x - 2.5} ${y - 12} h 5 v 9.5 h 9.5 v 5 h -9.5 v 9.5 h -5 v -9.5 h -9.5 v -5 h 9.5 Z`} /> : <><circle cx={x} cy={y} r="12" /><circle cx={x} cy={y} r="9" /><circle cx={x} cy={y} r="6.5" /></>}
    </g>)}
    {[116, 268].map((top, bank) => {
      const clip = `${clipId}-opening-${bank}`;
      return <g key={bank}>
        <defs><clipPath id={clip}><path d={openingPath(top)} /></clipPath></defs>
        <path className={styles.portraitOpening} d={openingPath(top)} />
        <g clipPath={`url(#${clip})`}>{layout.slots.flat().filter(slot => slot.bank === bank).map(slot => {
          const assignment = simInsertAt(assignments, slot.slotId);
          return assignment ? <rect key={slot.slotId} className={`${styles.portraitInsert} ${valid.includes(assignment) ? styles.filled : styles.attention}`} x={slot.x / layout.width * 256} y={top - 20} width={slot.width / layout.width * 256} height="130" /> : null;
        })}</g>
        <path className={styles.portraitFrame} d={openingPath(top)} />
        {Array.from({ length: 8 }, (_, column) => {
          const left = 20 + column * 27 + 8.5;
          return <path className={styles.portraitTeeth} key={column} d={`M ${left} ${top} v -16 h 10 v 16 M ${left} ${top + 90} v 16 h 10 v -16 M ${left} ${top - 16} l 5 5 l 5 -5 M ${left} ${top + 106} l 5 -5 l 5 5`} />;
        })}
        <path className={styles.pinIndicator} d={`M 215 ${top + 122} l 7 -11 l 7 11 Z`} />
      </g>;
    })}
    <g className={styles.portraitNumbers} textAnchor="middle"><text x="33.5" y="90">8</text><text x="222.5" y="90">1</text><text x="33.5" y="408">8</text><text x="222.5" y="408">1</text></g>
    <g className={styles.portraitBankLabels} textAnchor="middle"><text x="128" y="82">A</text><text x="128" y="404">B</text></g>
  </g>;
}
