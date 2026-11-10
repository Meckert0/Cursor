"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LibraryComponentDto } from "@/lib/api";
import { isSimHost, simAssignmentValid, simSlotCapacity, type SimInsertAssignment, type SimRelationship } from "@/lib/sim-modules";
import { simModuleLayout } from "@/lib/sim-module-layout";
import { SimModuleFace, simInsertAt } from "./sim-module-face";
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
function moduleLayout({ host, assignments = [], catalog, relationships }: Props) {
  const layout = simModuleLayout(host);
  const valid = assignments.filter(item => simAssignmentValid(host, item, assignments, catalog, relationships));
  return { layout, sections: layout.sections, valid, filled: new Set(valid.flatMap(item => item.occupiedSlotIds)).size, capacity: simSlotCapacity(host), invalid: assignments.length - valid.length };
}

export function SimInsertControls(props: Props) {
  const { host, assignments = [], reference, open, onOpen } = props;
  if (!isSimHost(host) && !assignments.length && !open) return null;
  const { layout, valid, filled, capacity, invalid } = moduleLayout(props);
  return <div className={styles.controls}>
    <button className={styles.preview} type="button" aria-haspopup="dialog" aria-label={`Configure SIM inserts for ${reference}`} onClick={onOpen}>
      <SimModuleFace layout={layout} assignments={assignments} valid={valid} reference={reference} />
      <span className={styles.previewText}><strong>SIM inserts <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M 5 3 H 13 V 11 M 13 3 L 3 13" /></svg></strong><span>{filled}/{capacity} filled{invalid ? ` · ${invalid} need attention` : ""}</span></span>
    </button>
    {open ? <SimModuleDialog {...props} /> : null}
  </div>;
}

function SimModuleDialog(props: Props) {
  const { host, assignments = [], reference, catalog, onClose, onChoose, onRemove, readOnly } = props;
  const { layout, sections, valid, filled, capacity, invalid } = moduleLayout(props);
  const slots = sections.flat();
  const [selectedSlot, setSelectedSlot] = useState(slots[0] ?? "");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId(), helpId = useId();
  const selected = simInsertAt(assignments, selectedSlot);
  const displaySlot = (slotId: string) => layout.slots.flat().find(slot => sameSlot(slot.slotId, slotId))?.label ?? slotId;
  const part = catalog.find(item => item.id === selected?.libraryComponentId);
  const orphaned = assignments.filter(item => !slots.some(slot => sameSlot(slot, item.slotId)));
  const hasCatalogLayout = !!layout.profile || (Array.isArray(host?.attributes?.simSlotSections) && host.attributes.simSlotSections.some(section => Array.isArray(section) && section.length > 0));

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
      <div className={`${styles.workspace} ${layout.portrait ? styles.workspacePortrait : ""}`}>
        <section className={styles.layoutPanel} aria-label={`${reference} SIM slots`}>
          <div className={styles.layoutScroll} tabIndex={0} aria-label="Slot layout, scroll if needed">
            {slots.length ? <SimModuleFace layout={layout} assignments={assignments} valid={valid} reference={reference} selectedSlot={selectedSlot} onSelect={setSelectedSlot} /> : <p className={styles.help}>No slots defined</p>}
          </div>
          <p className={styles.faceCaption}><span>{layout.profile ? "Mating face · schematic" : "Catalog slot order"}</span>{layout.profile ? <a href={layout.profile.drawingUrl} target="_blank" rel="noreferrer">VPC drawing ↗</a> : null}</p>
          <div className={styles.legend}><span><i className={styles.empty} />Empty</span><span><i className={styles.filled} />Filled</span><span><i className={styles.attention} />Needs attention</span></div>
        </section>
        <section className={styles.selection} aria-label="Selected SIM slot">
          {selectedSlot ? <>
            <p className={styles.eyebrow}>{selected ? "INSTALLED INSERT" : "EMPTY SLOT"}</p>
            <h2>{selected && selected.occupiedSlotIds.length > 1 ? `Slots ${selected.occupiedSlotIds.map(displaySlot).join(", ")}` : `Slot ${displaySlot(selectedSlot)}`}</h2>
            {layout.portrait && displaySlot(selected?.slotId ?? selectedSlot) !== (selected?.slotId ?? selectedSlot) ? <p className={styles.help}>Slot ID {selected?.slotId ?? selectedSlot}</p> : null}
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
