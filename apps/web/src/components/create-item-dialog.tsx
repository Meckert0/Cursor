"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { LibraryComponentDto, PartRelationshipDto } from "@/lib/api";
import { getPartFieldsForCategory } from "@/lib/part-fields";
import styles from "./create-item-dialog.module.css";

export interface CreateItemResult {
  ok: boolean;
  error?: string;
  notice?: string;
  part?: LibraryComponentDto;
  relationship?: PartRelationshipDto;
}

export function CreateItemDialog({ parentPartNumber, destination, allowStrainRelief, onCreate, onClose }: {
  parentPartNumber?: string;
  destination?: string;
  allowStrainRelief: boolean;
  onCreate: (data: FormData) => Promise<CreateItemResult>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const partNumberRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [category, setCategory] = useState<"module" | "frame" | "backshell" | "strain-relief">("module");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    partNumberRef.current?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await onCreate(data);
      if (result.ok) onClose();
      else setError(result.error ?? "Could not create the item.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the item. Please try again.");
    } finally { setPending(false); }
  };
  const isAccessory = category === "backshell" || category === "strain-relief";
  const fields = getPartFieldsForCategory(category).filter(field => !field.isIdentity && field.showOnAddForm && !(category === "frame" && field.key === "moduleCapacity"));
  return createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-label="Create new Item" aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <header className={styles.header}>
      <div><h2>Create new Item</h2><p id={`${id}-description`}>{isAccessory
        ? `Create an accessory for ${destination} and link it to part ${parentPartNumber}.`
        : `Create a library item and add a new ${category === "frame" ? "frame" : "connector"} to the canvas.`}</p></div>
      <button type="button" aria-label="Close create new Item" disabled={pending} onClick={onClose}>×</button>
    </header>
    <form onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <label>Category<select name="category" value={category} onChange={event => { setCategory(event.target.value as typeof category); setError(null); }}>
          <option value="module">Module / connector</option>
          <option value="frame">Frame</option>
          <option value="backshell" disabled={!parentPartNumber}>Backshell</option>
          <option value="strain-relief" disabled={!parentPartNumber || !allowStrainRelief}>Strain relief</option>
        </select></label>
        {!parentPartNumber ? <p className={styles.hint}>Select a defined connector or frame module to create compatible accessories.</p> : isAccessory && !allowStrainRelief ? <p className={styles.hint}>Blank modules cannot use strain reliefs.</p> : null}
        {category === "frame" ? <>
          <label>Housing type<select name="partType" defaultValue="ITA" required><option value="ITA">ITA housing</option><option value="RECEIVER">Receiver housing</option></select></label>
          <label>Module capacity<input name="attr:moduleCapacity" type="number" defaultValue={2} min={1} step={1} required /></label>
        </> : null}
        <label>Part number<input ref={partNumberRef} name="partNumber" required maxLength={200} /></label>
        <label>Family<input name="family" placeholder="e.g. iSeries" maxLength={200} /></label>
        <label>Description<textarea name="description" rows={2} maxLength={2000} /></label>
        {fields.length ? <details key={category} className={styles.specifications}><summary>Part specifications (optional)</summary>
          <div className={styles.specificationFields}>{fields.map(field => <label key={field.key}>{field.label}
            {field.inputType === "boolean" ? <select name={`attr:${field.key}`} defaultValue=""><option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option></select>
              : <input name={`attr:${field.key}`} type={field.inputType === "number" ? "number" : "text"} step={field.inputType === "number" ? "any" : undefined} />}
          </label>)}</div>
        </details> : null}
      </fieldset>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <footer className={styles.actions}><button type="button" onClick={onClose} disabled={pending}>Cancel</button><button className={styles.primary} type="submit" disabled={pending}>{pending ? "Creating item…" : "Create item"}</button></footer>
    </form>
  </dialog>, document.body);
}
