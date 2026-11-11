"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminSectionKey, AdminSectionTitles } from "@/lib/api";
import styles from "./page.module.css";

const FIELDS: Array<{ key: AdminSectionKey; label: string }> = [
  { key: "pageDescriptions", label: "Page descriptions section" },
  { key: "userAccess", label: "Users and projects section" },
  { key: "database", label: "Database section" },
  { key: "items", label: "Item viewer tab" },
  { key: "compatibility", label: "Compatibility tab" },
  { key: "media", label: "Images and files tab" }
];

function SaveNamesButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save section names"}</button>;
}

export function SectionNameEditor({ titles, saveAction }: {
  titles: AdminSectionTitles;
  saveAction: (data: FormData) => Promise<void>;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(data: FormData) {
    setError(null);
    try {
      await saveAction(data);
      if (details.current) details.current.open = false;
    } catch {
      setError("Section names could not be saved. Please try again.");
    }
  }

  return (
    <details ref={details} className={styles.sectionNameEditor}>
      <summary className={styles.smallActionButton}>Edit section names</summary>
      <form key={JSON.stringify(titles)} action={save} className={styles.sectionNamesForm}>
        {FIELDS.map(({ key, label }) => (
          <label key={key}>
            {label}
            <input name={key} defaultValue={titles[key]} required maxLength={80} />
          </label>
        ))}
        <div className={styles.sectionNamesActions}>
          <SaveNamesButton />
          <button type="button" onClick={() => { if (details.current) details.current.open = false; }}>Cancel</button>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </form>
    </details>
  );
}
