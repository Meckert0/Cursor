"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { ADMIN_SECTION_KEYS, type AdminSectionKey, type AdminSectionTitles } from "@/lib/api";
import styles from "./page.module.css";

interface SectionNamesContextValue {
  titles: AdminSectionTitles;
  openMenu: (key: AdminSectionKey, target: HTMLElement, x: number, y: number) => void;
}

const SectionNamesContext = createContext<SectionNamesContextValue | null>(null);

export function SectionName({ name, className }: { name: AdminSectionKey; className?: string }) {
  const context = useContext(SectionNamesContext);
  if (!context) throw new Error("SectionName requires SectionNamesProvider.");
  return (
    <span
      className={`${styles.sectionNameTarget} ${className ?? ""}`}
      data-section-name={name}
      title="Right-click to rename"
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        context.openMenu(name, event.currentTarget, event.clientX, event.clientY);
      }}
    >
      {context.titles[name]}
    </span>
  );
}

function RenameActions({ cancel }: { cancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className={styles.renameActions}>
      <button type="button" onClick={cancel} disabled={pending}>Cancel</button>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save name"}</button>
    </div>
  );
}

export function SectionNamesProvider({ children, titles, saveAction }: {
  children: ReactNode;
  titles: AdminSectionTitles;
  saveAction: (data: FormData) => Promise<void>;
}) {
  const [menu, setMenu] = useState<{ key: AdminSectionKey; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<AdminSectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openMenu = useCallback((key: AdminSectionKey, target: HTMLElement, x: number, y: number) => {
    trigger.current = target.closest<HTMLElement>("button, summary") ?? target;
    setMenu({ key, x: Math.max(8, Math.min(x, window.innerWidth - 176)), y: Math.max(8, Math.min(y, window.innerHeight - 60)) });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const name = target.closest<HTMLElement>("[data-section-name]") ?? target.querySelector<HTMLElement>(":scope > [data-section-name]");
      const key = name?.dataset.sectionName as AdminSectionKey | undefined;
      if (!name || !key || !ADMIN_SECTION_KEYS.includes(key)) return;
      event.preventDefault();
      const bounds = name.getBoundingClientRect();
      openMenu(key, name, bounds.left, bounds.bottom);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openMenu]);

  useEffect(() => {
    if (!menu) return;
    const item = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    item?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        trigger.current?.focus();
      } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        item?.focus();
      } else if (event.key === "Tab") setMenu(null);
    }
    const dismiss = () => setMenu(null);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);

  useEffect(() => {
    if (!editing) return;
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function closeEditor() {
    dialogRef.current?.close();
    setEditing(null);
    setError(null);
    trigger.current?.focus();
  }

  async function save(data: FormData) {
    const name = String(data.get("title") ?? "").trim();
    if (!name || name.length > 80) {
      setError("Enter a name between 1 and 80 characters.");
      return;
    }
    setError(null);
    try {
      await saveAction(data);
      closeEditor();
    } catch {
      setError("The section name could not be saved. Please try again.");
    }
  }

  return (
    <SectionNamesContext.Provider value={{ titles, openMenu }}>
      {children}
      {menu ? createPortal(
        <div ref={menuRef} role="menu" aria-label="Section name actions" className={styles.renameMenu} style={{ left: menu.x, top: menu.y }}>
          <button type="button" role="menuitem" onClick={() => { setEditing(menu.key); setError(null); setMenu(null); }}>Rename</button>
        </div>, document.body
      ) : null}
      {editing ? createPortal(
        <dialog ref={dialogRef} aria-labelledby="rename-section-title" className={styles.renameDialog} onCancel={event => { event.preventDefault(); closeEditor(); }}>
          <h2 id="rename-section-title">Rename section</h2>
          <form action={save} className={styles.renameForm}>
            <input type="hidden" name="sectionKey" value={editing} />
            <label>
              Section name
              <input ref={inputRef} name="title" defaultValue={titles[editing]} required maxLength={80} />
            </label>
            {error ? <p role="alert" className={styles.renameError}>{error}</p> : null}
            <RenameActions cancel={closeEditor} />
          </form>
        </dialog>, document.body
      ) : null}
    </SectionNamesContext.Provider>
  );
}
