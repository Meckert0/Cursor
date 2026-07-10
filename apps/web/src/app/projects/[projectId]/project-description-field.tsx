"use client";

import { useState, useTransition } from "react";
import styles from "./project-description-field.module.css";

export function ProjectDescriptionField({
  initialDescription,
  saveDescriptionAction
}: {
  initialDescription: string;
  saveDescriptionAction: (description: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialDescription);
  const [savedValue, setSavedValue] = useState(initialDescription);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const saveOnBlur = () => {
    const normalized = value.trim();
    if (normalized === savedValue) {
      return;
    }
    startTransition(async () => {
      try {
        await saveDescriptionAction(normalized);
        setSavedValue(normalized);
        setValue(normalized);
        setError(null);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Failed to save description.");
      }
    });
  };

  return (
    <div className={styles.wrapper}>
      <textarea
        value={value}
        rows={3}
        placeholder="Description"
        onChange={(event) => setValue(event.target.value)}
        onBlur={saveOnBlur}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
