"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { formatPageHeaderText } from "../../../../src/domain/ui-settings";
import type { PageHeaderCopy, PageKey } from "@/lib/api";
import styles from "./page-header.module.css";

type SaveAction = (key: PageKey, copy: Partial<PageHeaderCopy>) => Promise<{ ok: true; copy: PageHeaderCopy } | { ok: false; error: string }>;

function EditorActions({ cancel }: { cancel: () => void }) {
  const { pending } = useFormStatus();
  return <div className={styles.actions}>
    <button type="button" onClick={cancel} disabled={pending}>Cancel</button>
    <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
  </div>;
}

export function EditablePageHeader({ pageKey, copy, values = {}, canEdit, saveAction }: {
  pageKey: PageKey;
  copy: PageHeaderCopy;
  values?: Record<string, string | number>;
  canEdit: boolean;
  saveAction: SaveAction;
}) {
  const router = useRouter();
  const [text, setText] = useState({ source: copy, value: copy });
  if (text.source !== copy) setText({ source: copy, value: copy });
  const pageCopy = text.source === copy ? text.value : copy;
  const [editing, setEditing] = useState<"title" | "description" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const saving = useRef(false);
  const dialogTitleId = useId();
  const displayDescription = formatPageHeaderText(pageCopy.description, values);

  useEffect(() => {
    if (!editing) return;
    dialog.current?.showModal();
    const input = editing === "title" ? titleInput.current : descriptionInput.current;
    input?.focus();
    input?.select();
  }, [editing]);

  function open(field: "title" | "description", target: HTMLElement) {
    if (!canEdit) return;
    trigger.current = target;
    setTitleDraft(pageCopy.title);
    setDescriptionDraft(pageCopy.description);
    setError(null);
    setEditing(field);
  }

  function keyboardOpen(event: KeyboardEvent<HTMLElement>, field: "title" | "description") {
    if (!canEdit || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
    event.preventDefault();
    event.stopPropagation();
    open(field, event.currentTarget);
  }

  function close() {
    if (saving.current) return;
    dialog.current?.close();
    setEditing(null);
    setError(null);
    trigger.current?.focus();
  }

  async function save(data: FormData) {
    const title = String(data.get("title") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    if (!title || title.length > 120 || description.length > 600) {
      setError("Enter a title of 1–120 characters and a description of up to 600 characters.");
      return;
    }
    const changes: Partial<PageHeaderCopy> = {};
    if (title !== pageCopy.title) changes.title = title;
    if (description !== pageCopy.description) changes.description = description;
    if (!Object.keys(changes).length) { close(); return; }
    saving.current = true;
    try {
      const result = await saveAction(pageKey, changes);
      saving.current = false;
      if (result.ok) {
        setText(current => ({ ...current, value: result.copy }));
        close();
        router.refresh();
      }
      else setError(result.error);
    } catch {
      setError("The page header could not be saved. Please try again.");
    } finally {
      saving.current = false;
    }
  }

  return <>
    <h1 data-page-title={pageKey} tabIndex={canEdit ? 0 : undefined}
      className={canEdit ? styles.editable : undefined} title={canEdit ? "Right-click to rename this page" : undefined}
      onContextMenu={canEdit ? event => { event.preventDefault(); event.stopPropagation(); open("title", event.currentTarget); } : undefined}
      onKeyDown={event => keyboardOpen(event, "title")}>
      {formatPageHeaderText(pageCopy.title, values)}
    </h1>
    {displayDescription ? <p data-page-description={pageKey} tabIndex={canEdit ? 0 : undefined}
      className={canEdit ? styles.editable : undefined} title={canEdit ? "Right-click to edit this description" : undefined}
      onContextMenu={canEdit ? event => { event.preventDefault(); event.stopPropagation(); open("description", event.currentTarget); } : undefined}
      onKeyDown={event => keyboardOpen(event, "description")}>{displayDescription}</p> : null}
    {canEdit && editing ? createPortal(
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={dialogTitleId} onCancel={event => { event.preventDefault(); close(); }}>
        <h2 id={dialogTitleId}>Rename page header</h2>
        <p>Changes apply to this page for all users.</p>
        <form action={save} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor={`${dialogTitleId}-title`}>Page title</label>
            <input id={`${dialogTitleId}-title`} ref={titleInput} name="title" value={titleDraft} onChange={event => setTitleDraft(event.target.value)} required maxLength={120} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${dialogTitleId}-description`}>Page description</label>
            <textarea id={`${dialogTitleId}-description`} ref={descriptionInput} name="description" value={descriptionDraft} onChange={event => setDescriptionDraft(event.target.value)} rows={4} maxLength={600} />
          </div>
          {Object.keys(values).length ? <p className={styles.hint}>Available fields: {Object.keys(values).map(key => `{${key}}`).join(", ")}. These show the current item’s information.</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <EditorActions cancel={close} />
        </form>
      </dialog>, document.body
    ) : null}
  </>;
}
