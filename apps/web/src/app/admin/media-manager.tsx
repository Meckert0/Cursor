"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type { PartDto, PartMediaDto } from "@/lib/api";
import styles from "./page.module.css";

const TEXT_FIELDS = [
  ["url", "Hosted file URL"], ["orientation", "View direction (e.g. looking into mating face)"],
  ["altText", "Image description"], ["caption", "Caption"], ["source", "Source drawing or reference"],
  ["revision", "Drawing revision"], ["storageKey", "File reference (optional)"], ["mimeType", "File type (optional, e.g. image/png)"]
] as const;

function SaveMediaButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save image or file"}</button>;
}

export function MediaManager({ items, media, defaultPartId, upsertAction, deleteAction }: {
  items: PartDto[];
  media: PartMediaDto[];
  defaultPartId?: string;
  upsertAction: (data: FormData) => void | Promise<void>;
  deleteAction: (data: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState<PartMediaDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parts = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);

  async function save(data: FormData) {
    setError(null);
    try { await upsertAction(data); setEditing(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The image or file could not be saved."); }
  }

  return <div className={styles.sectionContent}>
    <p>Add hosted images and documents to an item. Side profiles and mating faces can each have several views and a primary image.</p>
    <form key={editing?.id ?? `new-${defaultPartId ?? ""}`} action={save} className={styles.compatAddForm}>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <label>Item
        <select name="partId" required defaultValue={editing?.partId ?? defaultPartId ?? ""}>
          <option value="" disabled>Select an item…</option>
          {items.map(part => <option key={part.id} value={part.id}>{part.partNumber} · {part.category}</option>)}
        </select>
      </label>
      <label>View
        <input name="viewType" list="catalog-media-views" defaultValue={editing?.viewType ?? "side_profile"} required />
        <datalist id="catalog-media-views">{["side_profile", "mating_face", "wire_entry", "drawing", "datasheet"].map(view => <option key={view} value={view} />)}</datalist>
      </label>
      {TEXT_FIELDS.map(([name, label]) => <label key={name}>{label}
        <input name={name} type={name === "url" ? "url" : "text"} required={name === "url"} defaultValue={editing?.[name] ?? ""} />
      </label>)}
      <label>Display order<input name="sortOrder" type="number" min="0" step="1" defaultValue={editing?.sortOrder ?? 0} /></label>
      <label>Pixel width<input name="pixelWidth" type="number" min="1" step="1" defaultValue={editing?.pixelWidth ?? ""} /></label>
      <label>Pixel height<input name="pixelHeight" type="number" min="1" step="1" defaultValue={editing?.pixelHeight ?? ""} /></label>
      <label><input name="isPrimary" type="checkbox" defaultChecked={editing?.isPrimary ?? false} /> Primary for this view and direction</label>
      <SaveMediaButton />
      {editing ? <button type="button" onClick={() => { setEditing(null); setError(null); }}>Cancel edit</button> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th>Preview</th><th>Item</th><th>View and direction</th><th>Reference</th><th>Actions</th></tr></thead>
      <tbody>{media.length ? media.map(row => <tr key={row.id}>
        <td>{row.mimeType?.startsWith("image/") || /\.(png|jpe?g|webp)(?:\?|$)/i.test(row.url)
          ? <Image unoptimized src={row.url} alt={row.altText ?? row.caption ?? `${row.viewType} of ${parts.get(row.partId)?.partNumber ?? row.partId}`} width={140} height={95} style={{ objectFit: "contain" }} />
          : <a href={row.url} target="_blank" rel="noreferrer">Open file</a>}</td>
        <td>{parts.get(row.partId)?.partNumber ?? row.partId}</td>
        <td>{row.viewType}{row.orientation ? ` · ${row.orientation}` : ""}{row.isPrimary ? " · primary" : ""}</td>
        <td>{row.caption}<br />{row.source}{row.revision ? ` · ${row.revision}` : ""}</td>
        <td><button type="button" onClick={() => { setEditing(row); setError(null); }}>Edit</button>
          <form action={deleteAction} className={styles.inlineAction}>
            <input type="hidden" name="id" value={row.id} /><input type="hidden" name="partId" value={row.partId} />
            <ConfirmSubmitButton type="submit" confirmMessage="Remove this image or file from the item?">Remove</ConfirmSubmitButton>
          </form>
        </td>
      </tr>) : <tr><td colSpan={5}>No images or files found.</td></tr>}</tbody>
    </table></div>
  </div>;
}
