"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LibraryComponentDto } from "@/lib/api";
import { getPartFieldsForCategory } from "@/lib/part-fields";
import {
  CONNECTOR_PICKER_COLUMNS, DEFAULT_PICKER_COLUMNS, TOP_PICKER_FILTERS,
  buildPickerIndex, getPickerFacetChoices, getPickerResults, isActivePickerFilter,
  newPickerFilter, pickerColumn, pickerDisplayValue, pickerFilterError, pickerFilterLabel, pickerQueryTokens,
  type PickerColumn, type PickerColumnId, type PickerFilter, type PickerFilters, type PickerRecord, type PickerSort
} from "@/lib/connector-picker";
import styles from "./connector-picker-dialog.module.css";

export interface ConnectorPickerCreateResult {
  ok: boolean;
  notice?: string;
  error?: string;
  newConnectorPartNumber?: string;
  connectorCatalog: LibraryComponentDto[];
}

interface SlotContext {
  slotId: string;
  framePartNumber?: string;
  reverse: boolean;
  onReverseChange: (reverse: boolean) => void;
}

interface Props {
  parts: LibraryComponentDto[];
  destination: string;
  slot?: SlotContext;
  readOnly?: boolean;
  onSelect: (part: LibraryComponentDto) => void;
  onClose: () => void;
  onCreatePart: (formData: FormData) => Promise<ConnectorPickerCreateResult>;
}

type IconName = "search" | "close" | "filter" | "sort" | "asc" | "desc" | "chevron" | "columns" | "module";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="7.5" cy="7.5" r="5" /><path d="m11.5 11.5 4 4" /></>,
    close: <path d="m5 5 8 8M13 5l-8 8" />,
    filter: <path d="M2 4h14l-5.5 6v4l-3 1v-5z" />,
    sort: <path d="m6 3-3 3m3-3 3 3M6 3v12m6 0-3-3m3 3 3-3M12 15V3" />,
    asc: <path d="M9 15V3M4 8l5-5 5 5" />,
    desc: <path d="M9 3v12M4 10l5 5 5-5" />,
    chevron: <path d="m5 7 4 4 4-4" />,
    columns: <><rect x="2.5" y="3" width="13" height="12" rx="1.5" /><path d="M7 3v12m4-12v12" /></>,
    module: <><rect x="3" y="2" width="12" height="14" rx="2" /><path d="M6 6h1m4 0h1m-6 3h1m4 0h1m-6 3h1m4 0h1" /></>
  };
  return <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Highlight({ value, query }: { value: string; query: string }) {
  const tokens = pickerQueryTokens(query).filter(token => value.toLowerCase().includes(token)).sort((a, b) => b.length - a.length);
  if (!tokens.length) return value;
  const expression = new RegExp(`(${tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return value.split(expression).map((piece, index) => index % 2 ? <mark key={index}>{piece}</mark> : piece);
}

function trapMenuFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)")]
    .filter(node => node.getClientRects().length > 0);
  if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
  else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
}

function PickerMenu({ anchor, title, onClose, children }: { anchor: HTMLElement; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current;
    const dialog = menu?.closest("dialog");
    if (!menu || !dialog) return;
    const position = () => {
      const bounds = dialog.getBoundingClientRect();
      const trigger = anchor.getBoundingClientRect();
      const width = Math.min(330, Math.max(0, bounds.width - 24));
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(12, Math.min(trigger.left - bounds.left, bounds.width - width - 12)) + dialog.scrollLeft}px`;
      menu.style.top = `${Math.max(12, Math.min(trigger.bottom - bounds.top + 8, bounds.height - menu.getBoundingClientRect().height - 12)) + dialog.scrollTop}px`;
    };
    position();
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    (menu.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled)") ?? menu.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      if (anchor.isConnected && anchor.closest("dialog")?.open) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !anchor.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("pointerdown", outside); };
  }, [anchor, onClose]);
  return <section ref={ref} role="dialog" aria-label={`${title} options`} className={styles.menu} onKeyDown={trapMenuFocus}>
    <div className={styles.menuHead}><h2>{title}</h2><button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close column options"><Icon name="close" /></button></div>
    {children}
  </section>;
}

function ColumnFilterMenu({ column, index, query, filters, sort, onApply, onClear, onSort }: {
  column: PickerColumn; index: PickerRecord[]; query: string; filters: PickerFilters; sort: PickerSort | null;
  onApply: (filter: PickerFilter) => void; onClear: () => void; onSort: (direction: "asc" | "desc") => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<PickerFilter>(() => structuredClone(filters[column.id] ?? newPickerFilter(column)));
  const [valueSearch, setValueSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(() => getPickerFacetChoices(index, query, filters, column.id), [index, query, filters, column.id]);
  const apply = (event: FormEvent) => { event.preventDefault(); const message = pickerFilterError(draft); setError(message); if (!message) onApply(draft); };
  return <>
    <div className={styles.menuSort}>{(["asc", "desc"] as const).map(direction => <button key={direction} type="button" className={`${styles.button} ${sort?.id === column.id && sort.direction === direction ? styles.active : ""}`} onClick={() => onSort(direction)}><Icon name={direction} />Sort {direction === "asc" ? "ascending" : "descending"}</button>)}</div>
    <form className={styles.menuForm} onSubmit={apply}>
      <div className={styles.menuBody}>
        {draft.kind === "values" ? <>
          <label className={styles.fieldLabel} htmlFor={`${id}-search`}>Filter values</label>
          <input id={`${id}-search`} type="search" placeholder="Find a value…" value={valueSearch} onChange={event => setValueSearch(event.target.value)} />
          <div className={styles.checks}>{choices.filter(choice => choice.value.toLowerCase().includes(valueSearch.toLowerCase())).map(choice => <label className={styles.check} key={choice.value}>
            <input type="checkbox" checked={draft.values.includes(choice.value)} onChange={event => setDraft({ ...draft, values: event.target.checked ? [...draft.values, choice.value] : draft.values.filter(value => value !== choice.value) })} />
            <span>{choice.value}</span><small>{choice.count}</small>
          </label>)}</div>
          <p className={styles.help}>Choose multiple values, or leave all unchecked for any value.</p>
        </> : null}
        {draft.kind === "text" ? <>
          <label className={styles.fieldLabel} htmlFor={`${id}-operator`}>Match rule</label>
          <select id={`${id}-operator`} value={draft.operator} onChange={event => setDraft({ ...draft, operator: event.target.value as "contains" | "equals" | "starts" })}><option value="contains">Contains</option><option value="equals">Equals</option><option value="starts">Starts with</option></select>
          <label className={styles.fieldLabel} htmlFor={`${id}-text`}>{column.label}</label>
          <input id={`${id}-text`} value={draft.value} onChange={event => setDraft({ ...draft, value: event.target.value })} placeholder="Enter text…" />
          <p className={styles.help}>Text matching ignores case.{column.id === "partNumber" ? " Part-number matching also ignores punctuation." : ""}</p>
        </> : null}
        {draft.kind === "number" ? <>
          <label className={styles.fieldLabel} htmlFor={`${id}-mode`}>Filter by</label>
          <select id={`${id}-mode`} value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as "range" | "missing" | "notApplicable" })}><option value="range">Range of values</option><option value="missing">Not supplied only</option><option value="notApplicable">Not applicable only</option></select>
          {draft.mode === "range" ? <div className={styles.range}>
            <label htmlFor={`${id}-min`}>Minimum<input id={`${id}-min`} type="number" min="0" step="1" value={draft.min} placeholder="Any" onChange={event => setDraft({ ...draft, min: event.target.value })} /></label><span>–</span>
            <label htmlFor={`${id}-max`}>Maximum<input id={`${id}-max`} type="number" min="0" step="1" value={draft.max} placeholder="Any" onChange={event => setDraft({ ...draft, max: event.target.value })} /></label>
          </div> : null}
          <p className={styles.help}>{column.id === "positions" ? "Electrical positions on modules. Frame capacity has its own column." : "Number of module slots in a frame."}</p>
        </> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
      <div className={styles.menuFoot}><button className={styles.linkButton} type="button" onClick={onClear}>Clear filter</button><button className={`${styles.button} ${styles.primary}`} type="submit">Apply filter</button></div>
    </form>
  </>;
}

function ColumnsMenu({ visible, onApply }: { visible: PickerColumnId[]; onApply: (ids: PickerColumnId[]) => void }) {
  const [draft, setDraft] = useState(visible);
  return <><div className={styles.menuBody}><p className={styles.help}>Every information column has its own sort and filter controls.</p><div className={styles.checks}>{CONNECTOR_PICKER_COLUMNS.map(column => <label key={column.id} className={styles.check}>
    <input type="checkbox" checked={draft.includes(column.id)} disabled={column.id === "partNumber"} onChange={event => setDraft(event.target.checked ? [...draft, column.id] : draft.filter(id => id !== column.id))} /><span>{column.label}</span>
  </label>)}</div></div><div className={styles.menuFoot}><button className={styles.linkButton} type="button" onClick={() => onApply([...DEFAULT_PICKER_COLUMNS])}>Reset columns</button><button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => onApply(draft)}>Apply columns</button></div></>;
}

function QuickAddForm({ onCreate, onBack, onCreated, onPendingChange }: { onCreate: Props["onCreatePart"]; onBack: () => void; onCreated: (part: LibraryComponentDto | undefined, notice: string) => void; onPendingChange: (pending: boolean) => void }) {
  const fields = useMemo(() => getPartFieldsForCategory("module").filter(field => field.showOnAddForm), []);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>("input")?.focus(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); onPendingChange(true); setError("");
    try {
      const result = await onCreate(data);
      if (!result.ok) { setError(result.error ?? "Connector quick-add failed."); return; }
      onCreated(result.connectorCatalog.find(part => part.partNumber === result.newConnectorPartNumber), result.notice ?? "Connector added as an unreviewed entry. Review it before choosing Use connector.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connector quick-add failed."); }
    finally { setPending(false); onPendingChange(false); }
  };
  return <form ref={formRef} className={styles.createForm} onSubmit={submit}>
    <div className={styles.createFields}>{fields.map(field => <label key={field.key}>
      {field.label}
      {field.inputType === "boolean" ? <select name={field.isIdentity ? field.key : `attr:${field.key}`} defaultValue=""><option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select> : <input name={field.isIdentity ? field.key : `attr:${field.key}`} type={field.inputType === "number" ? "number" : "text"} required={field.required === true || field.key === "partNumber"} placeholder={field.label} />}
    </label>)}</div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.createActions}><button type="button" className={styles.button} disabled={pending} onClick={onBack}>Back to results</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={pending}>{pending ? "Adding…" : "Add connector"}</button></div>
  </form>;
}

type Menu = { kind: "filter"; id: PickerColumnId; anchor: HTMLElement } | { kind: "columns" | "more"; anchor: HTMLElement };
const PAGE_SIZE = 50;

export function ConnectorPickerDialog({ parts, destination, slot, readOnly = false, onSelect, onClose, onCreatePart }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PickerFilters>({});
  const [sort, setSort] = useState<PickerSort | null>(null);
  const [visibleIds, setVisibleIds] = useState<PickerColumnId[]>([...DEFAULT_PICKER_COLUMNS]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [creating, setCreating] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState("");
  const searchId = useId();
  const index = useMemo(() => buildPickerIndex(parts), [parts]);
  const results = useMemo(() => getPickerResults(index, query, filters, sort), [index, query, filters, sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pageResults = results.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const selected = pageResults.find(record => record.part.id === selectedId) ?? null;
  const visibleColumns = CONNECTOR_PICKER_COLUMNS.filter(column => visibleIds.includes(column.id));
  const effectiveSort = sort ?? (!query.trim() ? { id: "partNumber" as const, direction: "asc" as const } : null);
  const activeFilters = Object.entries(filters) as [PickerColumnId, PickerFilter][];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);

  const resetSelection = () => { setSelectedId(null); setReviewing(false); setPage(1); };
  const applyFilter = (id: PickerColumnId, filter?: PickerFilter) => {
    setFilters(previous => { const next = { ...previous }; if (filter && isActivePickerFilter(filter)) next[id] = filter; else delete next[id]; return next; });
    resetSelection(); setMenu(null);
  };
  const applySort = (id: PickerColumnId, direction?: "asc" | "desc") => {
    setSort({ id, direction: direction ?? (effectiveSort?.id === id && effectiveSort.direction === "asc" ? "desc" : "asc") });
    resetSelection(); setMenu(null);
  };
  const backToResults = () => { setCreating(false); setReviewing(false); requestAnimationFrame(() => searchRef.current?.focus()); };
  const cancel = () => { if (createPending) return; if (menu) setMenu(null); else if (creating || reviewing) backToResults(); else onClose(); };
  const changeSide = (reverse: boolean) => { resetSelection(); setMenu(null); slot?.onReverseChange(reverse); };
  const closeMenu = () => setMenu(null);
  const createPart = (part: LibraryComponentDto | undefined, message: string) => {
    setCreating(false); setFilters({}); setQuery(part?.partNumber ?? ""); setPage(1); setSelectedId(part?.id ?? null); setNotice(message);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const confirm = () => {
    if (!selected || readOnly) return;
    if (window.matchMedia("(max-width: 700px), (max-height: 500px)").matches && !reviewing) { setReviewing(true); return; }
    onSelect(selected.part);
  };

  if (typeof document === "undefined") return null;
  return createPortal(<dialog ref={dialogRef} className={`${styles.dialog} ${reviewing && selected ? styles.reviewing : ""}`} aria-label={creating ? "Add new connector" : slot ? `Select slot ${slot.slotId} module` : "Define Connector"} aria-modal="true"
    onCancel={event => { event.preventDefault(); cancel(); }} onKeyDown={event => { if (event.key === "Escape" && menu) { event.preventDefault(); event.stopPropagation(); closeMenu(); } }}>
    <header className={styles.header}><div><div className={styles.eyebrow}>{creating ? "ADD NEW CONNECTOR" : slot ? "SELECT MODULE" : "DEFINE CONNECTOR"} / {destination}{slot ? ` · SLOT ${slot.slotId}` : ""}</div><h1>{creating ? "Add new connector" : slot ? "Choose a slot module" : "Choose a connector"}</h1><p>{creating ? "Create a library entry, then review it before applying it to your design." : "Search, narrow your options, and find the right part."}</p></div><div className={styles.headerActions}><span className={styles.catalogState}><i />Active parts library</span><button className={styles.iconButton} type="button" disabled={createPending} onClick={creating ? backToResults : onClose} aria-label={creating ? "Back to results" : "Close connector picker"}><Icon name="close" /></button></div></header>
    {creating ? <QuickAddForm onCreate={onCreatePart} onBack={backToResults} onCreated={createPart} onPendingChange={setCreatePending} /> : <>
      <div className={styles.searchArea}><label className={styles.fieldLabel} htmlFor={searchId}>Search the parts library</label><div className={styles.searchRow}><div className={styles.searchBox}><Icon name="search" /><input ref={searchRef} id={searchId} type="search" placeholder={slot ? "Search modules..." : "Search connectors..."} value={query} onChange={event => { setQuery(event.target.value); resetSelection(); setMenu(null); }} />{query ? <button className={styles.clearSearch} type="button" aria-label="Clear search" onClick={() => { setQuery(""); resetSelection(); searchRef.current?.focus(); }}><Icon name="close" /></button> : null}</div>{!slot ? <button className={styles.button} type="button" disabled={readOnly} onClick={() => { setMenu(null); setCreating(true); }}>+ Add new connector</button> : null}</div></div>
      <div className={styles.topOptions} aria-label="Filter and column options">
        {TOP_PICKER_FILTERS.map(id => {
          const column = pickerColumn(id), filter = filters[id], fixed = id === "type" && !!slot;
          const label = filter?.kind === "values" && filter.values.length > 1 ? `${filter.values.length} selected` : filter ? pickerFilterLabel(filter) : "Any";
          return <button key={id} className={`${styles.optionButton} ${filter ? styles.active : ""}`} type="button" disabled={fixed} aria-label={`${column.label} filter`} aria-haspopup="dialog" aria-expanded={menu?.kind === "filter" && menu.id === id} onClick={event => setMenu({ kind: "filter", id, anchor: event.currentTarget })}>{column.label}<small>{fixed ? "Module" : label}</small><Icon name="chevron" /></button>;
        })}
        <button className={styles.optionButton} type="button" aria-haspopup="dialog" aria-expanded={menu?.kind === "more"} onClick={event => setMenu({ kind: "more", anchor: event.currentTarget })}><Icon name="filter" />More filters</button>
        <span className={styles.optionsSpacer} />
        <button className={styles.optionButton} type="button" aria-haspopup="dialog" aria-expanded={menu?.kind === "columns"} onClick={event => setMenu({ kind: "columns", anchor: event.currentTarget })}><Icon name="columns" />Columns <small>{visibleIds.length}</small></button>
        <button className={styles.linkButton} type="button" onClick={() => { setFilters({}); resetSelection(); }}>Reset filters</button>
      </div>
      {slot ? <div className={styles.context}><div><b>{destination} · Slot {slot.slotId}{slot.framePartNumber ? ` · ${slot.framePartNumber}` : ""}</b><p>{slot.reverse ? "Opposite-side modules." : "Same-side modules, including dual or unspecified sides."} Frame and slot restrictions always apply.</p></div><div className={styles.segmented} aria-label="Module side compatibility"><button type="button" aria-pressed={!slot.reverse} onClick={() => changeSide(false)}>Same-side modules</button><button type="button" aria-pressed={slot.reverse} onClick={() => changeSide(true)}>Opposite-side modules</button></div></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      <section className={styles.results} aria-label="Connector results">
        <div className={styles.resultsToolbar}><span className={styles.resultCount} aria-live="polite" aria-atomic="true">{results.length} {slot ? "compatible module" : "part"}{results.length === 1 ? "" : "s"}<small>of {parts.length} in this view</small></span><span className={styles.tableHint}>Click a heading to sort · Use its funnel to filter</span><span className={styles.sortStatus}>{sort ? <>Sorted: <b>{pickerColumn(sort.id).label} {sort.direction === "asc" ? "↑" : "↓"}</b><button className={styles.iconButton} type="button" aria-label="Clear sorting" onClick={() => { setSort(null); resetSelection(); }}><Icon name="close" /></button></> : query.trim() ? "Best match first" : "Part number A–Z"}</span></div>
        {activeFilters.length ? <div className={styles.chips}>{activeFilters.map(([id, filter]) => <button type="button" className={styles.chip} key={id} aria-label={`Remove ${pickerColumn(id).label} filter`} onClick={() => applyFilter(id)}>{pickerColumn(id).label}: {pickerFilterLabel(filter)}<span aria-hidden="true">×</span></button>)}<button className={styles.linkButton} type="button" onClick={() => { setFilters({}); setQuery(""); resetSelection(); }}>Clear all</button></div> : null}
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Scrollable connector table">
          <table className={styles.table} style={{ minWidth: 38 + visibleColumns.reduce((sum, column) => sum + column.width, 0) }} aria-label="Parts matching your search">
            <colgroup><col style={{ width: 38 }} />{visibleColumns.map(column => <col key={column.id} style={{ width: column.width }} />)}</colgroup>
            <thead><tr><th scope="col" className={styles.selectColumn}><span className={styles.srOnly}>Choose a part</span></th>{visibleColumns.map(column => {
              const sorted = effectiveSort?.id === column.id;
              return <th key={column.id} scope="col" className={column.id === "partNumber" ? styles.partNumberColumn : undefined} aria-sort={sorted ? effectiveSort.direction === "asc" ? "ascending" : "descending" : "none"}><div className={styles.columnHead}><button type="button" className={`${styles.sortButton} ${sorted ? styles.sorted : ""}`} aria-label={`Sort ${column.label} ${sorted && effectiveSort.direction === "asc" ? "descending" : "ascending"}`} onClick={() => applySort(column.id)}>{column.label}<Icon name={sorted ? effectiveSort.direction : "sort"} /></button><button type="button" className={`${styles.filterButton} ${filters[column.id] ? styles.filtered : ""}`} aria-label={`Filter ${column.label}`} aria-haspopup="dialog" aria-expanded={menu?.kind === "filter" && menu.id === column.id} onClick={event => setMenu({ kind: "filter", id: column.id, anchor: event.currentTarget })}><Icon name="filter" /></button></div></th>;
            })}</tr></thead>
            <tbody>{pageResults.map(record => <tr key={record.part.id} className={selected?.part.id === record.part.id ? styles.selectedRow : undefined} onClick={() => { if (!readOnly) { setSelectedId(record.part.id); setReviewing(false); } }}>
              <td className={styles.selectColumn}><input type="radio" name={`connector-${searchId}`} aria-label={`Preview ${record.part.partNumber}`} checked={selected?.part.id === record.part.id} disabled={readOnly} onChange={() => { setSelectedId(record.part.id); setReviewing(false); }} /></td>
              {visibleColumns.map(column => {
                const display = pickerDisplayValue(record, column);
                return <td key={column.id} className={column.id === "partNumber" ? styles.partNumberColumn : undefined} title={display}>{column.id === "stockStatus" ? <span className={`${styles.stock} ${styles[record.part.stockStatus]}`}><i />{display}</span> : column.id === "reviewStatus" ? <span className={`${styles.reviewBadge} ${record.part.isReviewed ? "" : styles.pendingBadge}`}>{display}</span> : column.id === "type" ? <span className={styles.typeBadge}>{display}</span> : record.values[column.id] === null ? <span className={styles.missing}>—</span> : <Highlight value={display} query={query} />}</td>;
              })}
            </tr>)}</tbody>
          </table>
          {!results.length ? <div className={styles.empty}><Icon name="search" /><h2>{!parts.length ? slot ? "No compatible modules for this slot" : "No connectors in your library yet" : "No parts match your search"}</h2><p>{slot ? "Frame and slot compatibility rules remain applied." : "Search by another part number or remove a filter."}</p>{query || activeFilters.length ? <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => { setQuery(""); setFilters({}); resetSelection(); }}>Clear search and filters</button> : !slot ? <button type="button" className={`${styles.button} ${styles.primary}`} disabled={readOnly} onClick={() => setCreating(true)}>Add new connector</button> : null}</div> : null}
        </div>
        <div className={styles.tableFoot}><span>{slot ? "Frame and slot compatibility always applied" : "Active parts visible to you"}<span className={styles.mobileHint}>Scroll horizontally for more columns</span></span><div className={styles.pagination}><button type="button" className={styles.linkButton} disabled={activePage <= 1} onClick={() => { setPage(activePage - 1); setSelectedId(null); }}>Previous</button><span>Page {activePage} of {pageCount}</span><button type="button" className={styles.linkButton} disabled={activePage >= pageCount} onClick={() => { setPage(activePage + 1); setSelectedId(null); }}>Next</button></div></div>
        {selected ? <section className={styles.preview} aria-label="Selected part specifications"><button className={`${styles.button} ${styles.backResults}`} type="button" onClick={() => setReviewing(false)}>← Back to results</button><div className={styles.previewIdentity}><span className={styles.previewSymbol}><Icon name="module" /></span><div><small>SELECTED PART · {destination}{slot ? ` / SLOT ${slot.slotId}` : ""}</small><h2>{selected.part.partNumber}</h2><p>{selected.part.description}</p></div></div><dl className={styles.specs}>{CONNECTOR_PICKER_COLUMNS.filter(column => !["partNumber", "description", "type"].includes(column.id) && (!column.applies || column.applies(selected.part))).map(column => <div key={column.id}><dt>{column.label}</dt><dd>{pickerDisplayValue(selected, column)}</dd></div>)}</dl><button type="button" className={styles.iconButton} aria-label="Clear selected part" onClick={() => { setSelectedId(null); setReviewing(false); }}><Icon name="close" /></button></section> : null}
      </section>
      <footer className={styles.footer}><div className={styles.selectionSummary}>{selected ? selected.part.partNumber : "Select a part to continue."}<small>Target: {destination}{slot ? ` · Slot ${slot.slotId}` : ""} · Preview before applying.</small></div><div className={styles.footerActions}><button className={styles.button} type="button" onClick={onClose}>Cancel</button><button className={`${styles.button} ${styles.primary}`} type="button" disabled={readOnly || !selected} onClick={confirm}><span className={styles.desktopConfirm}>Use {slot ? "module" : "connector"}</span><span className={styles.mobileConfirm}>{reviewing ? "Use" : "Review"} {slot ? "module" : "connector"}</span> →</button></div></footer>
    </>}
    {menu ? <PickerMenu key={menu.kind === "filter" ? menu.id : menu.kind} anchor={menu.anchor} title={menu.kind === "filter" ? pickerColumn(menu.id).label : menu.kind === "columns" ? "Choose columns" : "Filter any column"} onClose={closeMenu}>
      {menu.kind === "filter" ? <ColumnFilterMenu column={pickerColumn(menu.id)} index={index} query={query} filters={filters} sort={effectiveSort} onApply={filter => applyFilter(menu.id, filter)} onClear={() => applyFilter(menu.id)} onSort={direction => applySort(menu.id, direction)} /> : menu.kind === "columns" ? <ColumnsMenu visible={visibleIds} onApply={ids => { setVisibleIds(ids); setMenu(null); }} /> : <div className={styles.menuBody}>{CONNECTOR_PICKER_COLUMNS.filter(column => !TOP_PICKER_FILTERS.includes(column.id)).map(column => <button type="button" key={column.id} className={`${styles.menuItem} ${filters[column.id] ? styles.active : ""}`} onClick={() => setMenu({ kind: "filter", id: column.id, anchor: menu.anchor })}>{column.label}<Icon name="filter" /></button>)}</div>}
    </PickerMenu> : null}
  </dialog>, document.body);
}
