"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LibraryComponentDto } from "@/lib/api";
import { isSimHost, simAssignmentValid, simSlotSections, simSlotCapacity, type SimInsertAssignment, type SimRelationship } from "@/lib/sim-modules";
import styles from "./sim-insert-controls.module.css";

interface Props {
  host?: LibraryComponentDto;
  assignments?: SimInsertAssignment[];
  catalog: LibraryComponentDto[];
  relationships: SimRelationship[];
  reference: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChoose: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  readOnly: boolean;
}

const sameSlot = (left: string, right: string) => left.trim().toUpperCase() === right.trim().toUpperCase();
const insertAt = (assignments: SimInsertAssignment[], slot: string) =>
  assignments.find(item => sameSlot(item.slotId, slot)) ?? assignments.find(item => item.occupiedSlotIds.some(id => sameSlot(id, slot)));

function moduleLayout({ host, assignments = [], catalog, relationships }: Props) {
  const sections = simSlotSections(host);
  const valid = assignments.filter(item => simAssignmentValid(host, item, assignments, catalog, relationships));
  return { sections, valid, filled: new Set(valid.flatMap(item => item.occupiedSlotIds)).size, capacity: simSlotCapacity(host), invalid: assignments.length - valid.length };
}

function SlotThumbnail({ sections, assignments, valid, reference }: {
  sections: string[][]; assignments: SimInsertAssignment[]; valid: SimInsertAssignment[]; reference: string;
}) {
  const columns = Math.max(1, ...sections.map(section => section.length));
  const width = columns * 28 + 12, height = Math.max(1, sections.length) * 26 + 12;
  return <svg className={styles.thumbnail} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${reference} SIM slot layout`}>
    <rect x="1" y="1" width={width - 2} height={height - 2} rx="5" className={styles.housing} />
    {sections.map((section, row) => section.map((slot, column) => {
      const assignment = insertAt(assignments, slot);
      const state = assignment ? valid.includes(assignment) ? styles.filled : styles.attention : styles.empty;
      return <g key={slot} className={state}>
        <rect x={8 + column * 28} y={8 + row * 26} width="24" height="22" rx="2" />
        <text x={20 + column * 28} y={23 + row * 26} textAnchor="middle">{slot}</text>
      </g>;
    }))}
    {!sections.length ? <text x={width / 2} y={height / 2 + 4} textAnchor="middle">?</text> : null}
  </svg>;
}

export function SimInsertControls(props: Props) {
  const { host, assignments = [], reference, open, onOpen } = props;
  if (!isSimHost(host) && !assignments.length && !open) return null;
  const { sections, valid, filled, capacity, invalid } = moduleLayout(props);
  return <div className={styles.controls}>
    <button className={styles.preview} type="button" aria-haspopup="dialog" aria-label={`Configure SIM inserts for ${reference}`} onClick={onOpen}>
      <SlotThumbnail sections={sections} assignments={assignments} valid={valid} reference={reference} />
      <span className={styles.previewText}><strong>SIM inserts <span aria-hidden="true">↗︎</span></strong><span>{filled}/{capacity} filled{invalid ? ` · ${invalid} need attention` : ""}</span></span>
    </button>
    {open ? <SimModuleDialog {...props} /> : null}
  </div>;
}

function SimModuleDialog(props: Props) {
  const { host, assignments = [], reference, catalog, onClose, onChoose, onRemove, readOnly } = props;
  const { sections, valid, filled, capacity, invalid } = moduleLayout(props);
  const slots = sections.flat();
  const [selectedSlot, setSelectedSlot] = useState(slots[0] ?? "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId(), helpId = useId();
  const selected = insertAt(assignments, selectedSlot);
  const part = catalog.find(item => item.id === selected?.libraryComponentId);
  const orphaned = assignments.filter(item => !slots.some(slot => sameSlot(slot, item.slotId)));
  const hasCatalogLayout = Array.isArray(host?.attributes?.simSlotSections) && host.attributes.simSlotSections.some(section => Array.isArray(section) && section.length > 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={helpId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>SIM MODULE</p><h1 id={titleId}>{reference} · SIM inserts</h1><p className={styles.partSummary}>{host?.partNumber ?? "Module unavailable"}{host?.description ? ` · ${host.description}` : ""}</p></div>
      <button ref={closeRef} className={styles.iconButton} type="button" aria-label="Close SIM module" onClick={onClose}>×</button>
    </header>
    <div className={styles.body}>
      <div className={styles.layoutHeading}><h2>Slot layout</h2><span role="status">{filled}/{capacity} filled{invalid ? ` · ${invalid} need attention` : ""}</span></div>
      <p id={helpId} className={styles.help}>Select a slot to add or change its insert.</p>
      {slots.length !== capacity || !slots.length ? <p className={styles.error}>{isSimHost(host) ? "Complete this module’s SIM slot layout in the library." : "Choose a SIM module or remove these inserts."}</p> : !hasCatalogLayout ? <p className={styles.help}>Physical layout unavailable; showing numbered slots.</p> : null}
      <div className={styles.workspace}>
        <section className={styles.layoutPanel} aria-label={`${reference} SIM slots`}>
          <div className={styles.layoutScroll} tabIndex={0} aria-label="Slot layout, scroll if needed">
            <div className={styles.moduleHousing}>
              {sections.map((section, row) => <div key={row} className={styles.slotSection} role="group" aria-label={`SIM section ${row + 1}`}>
                {section.map((slot, column) => {
                  const assignment = insertAt(assignments, slot);
                  const state = assignment ? valid.includes(assignment) ? styles.filled : styles.attention : styles.empty;
                  const related = selected && assignment === selected;
                  const descriptionId = `${titleId}-slot-${row}-${column}`;
                  return <button type="button" key={slot} className={`${styles.slot} ${state} ${related ? styles.related : ""}`} aria-label={`${reference} SIM slot ${slot}`} aria-describedby={descriptionId} aria-pressed={sameSlot(selectedSlot, slot)} title={assignment ? `${assignment.partNumber} · Slots ${assignment.occupiedSlotIds.join(", ")}` : "Empty slot"} onClick={() => setSelectedSlot(slot)}>
                    <strong>{slot}</strong><span>{assignment ? sameSlot(assignment.slotId, slot) ? "Insert" : `↤ ${assignment.slotId}` : "Empty"}</span>
                    <span id={descriptionId} className={styles.srOnly}>{assignment ? `${assignment.partNumber}. Slots ${assignment.occupiedSlotIds.join(", ")}.${!valid.includes(assignment) ? " Needs attention." : ""}` : "Empty slot"}</span>
                  </button>;
                })}
              </div>)}
              {!slots.length ? <p className={styles.help}>No slots defined</p> : null}
            </div>
          </div>
          <div className={styles.legend}><span><i className={styles.empty} />Empty</span><span><i className={styles.filled} />Filled</span><span><i className={styles.attention} />Needs attention</span></div>
        </section>
        <section className={styles.selection} aria-label="Selected SIM slot">
          {selectedSlot ? <>
            <p className={styles.eyebrow}>{selected ? "INSTALLED INSERT" : "EMPTY SLOT"}</p>
            <h2>{selected && selected.occupiedSlotIds.length > 1 ? `Slots ${selected.occupiedSlotIds.join(", ")}` : `Slot ${selectedSlot}`}</h2>
            {selected ? <>
              <p className={styles.selectedPart}>{selected.partNumber}</p>
              {part?.description ? <p className={styles.help}>{part.description}</p> : null}
              {!valid.includes(selected) ? <p className={styles.error}>This insert no longer fits or is not compatible.</p> : null}
            </> : <p className={styles.help}>Choose an insert that fits this slot. Inserts that span multiple slots fill adjacent spaces in the same section.</p>}
            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.primary}`} type="button" disabled={readOnly} aria-label={`${selected ? "Change" : "Select"} SIM insert ${selected?.slotId ?? selectedSlot} for ${reference}`} onClick={() => onChoose(selected?.slotId ?? selectedSlot)}>{selected ? "Change insert" : "Select SIM insert"}</button>
              {selected ? <button className={styles.button} type="button" disabled={readOnly} aria-label={`Remove SIM insert ${selected.slotId} for ${reference}`} onClick={() => onRemove(selected.slotId)}>Remove</button> : null}
            </div>
          </> : <p className={styles.help}>Add a slot layout in the library to configure this module.</p>}
          {readOnly ? <p className={styles.help}>This revision is read-only.</p> : null}
        </section>
      </div>
      {orphaned.length ? <section className={styles.orphaned} aria-label="Inserts outside this layout"><h2>Inserts outside this layout</h2>{orphaned.map(item => <div key={item.slotId}><p><strong>{item.partNumber}</strong><span>Slot {item.slotId} is no longer available.</span></p><button className={styles.button} type="button" disabled={readOnly} aria-label={`Remove SIM insert ${item.slotId} for ${reference}`} onClick={() => onRemove(item.slotId)}>Remove</button></div>)}</section> : null}
    </div>
    <footer className={styles.footer}><span>{readOnly ? "View only" : "Changes save automatically"}</span><button className={`${styles.button} ${styles.primary}`} type="button" onClick={onClose}>Done</button></footer>
  </dialog>, document.body);
}
