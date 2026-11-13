"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { LibraryComponentDto, PartRelationshipDto } from "@/lib/api";
import { getPartFieldsForCategory } from "@/lib/part-fields";
import styles from "./compatible-part-dialog.module.css";

export interface CompatiblePartCreateResult {
  ok: boolean;
  error?: string;
  notice?: string;
  part?: LibraryComponentDto;
  relationship?: PartRelationshipDto;
}

export function CompatiblePartDialog({ parentPartNumber, destination, allowStrainRelief, onCreate, onClose }: {
  parentPartNumber: string;
  destination: string;
  allowStrainRelief: boolean;
  onCreate: (data: FormData) => Promise<CompatiblePartCreateResult>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const partNumberRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [category, setCategory] = useState<"backshell" | "strain-relief">("backshell");
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
      else setError(result.error ?? "Could not create the compatible part.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the compatible part. Please try again.");
    } finally { setPending(false); }
  };
  const fields = getPartFieldsForCategory(category).filter(field => !field.isIdentity && field.showOnAddForm);
  return createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-label="Add compatible part" aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <header className={styles.header}>
      <div><h2>Add compatible part</h2><p id={`${id}-description`}>Create an accessory for {destination} and link it to part {parentPartNumber}.</p></div>
      <button type="button" aria-label="Close add compatible part" disabled={pending} onClick={onClose}>×</button>
    </header>
    <form onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>
        <label>Category<select name="category" value={category} onChange={event => { setCategory(event.target.value as typeof category); setError(null); }}>
          <option value="backshell">Backshell</option>
          <option value="strain-relief" disabled={!allowStrainRelief}>Strain relief</option>
        </select></label>
        {!allowStrainRelief ? <p className={styles.hint}>Blank modules cannot use strain reliefs.</p> : null}
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
      <footer className={styles.actions}><button type="button" onClick={onClose} disabled={pending}>Cancel</button><button className={styles.primary} type="submit" disabled={pending}>{pending ? "Creating part…" : "Create and add part"}</button></footer>
    </form>
  </dialog>, document.body);
}
