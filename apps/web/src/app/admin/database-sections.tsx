"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { AdminSectionTitles } from "@/lib/api";
import { DATABASE_TABS as TABS, type DatabaseTab } from "./database-location";
import styles from "./page.module.css";

export function DatabaseSections({ titles, counts, q, family, families, activeTab, onSearchChange, onTabChange, items, compatibility, media }: {
  titles: AdminSectionTitles;
  counts: Record<DatabaseTab, number>;
  q: string;
  family: string;
  families: string[];
  activeTab: DatabaseTab;
  onSearchChange: (input: { q: string; family: string }) => void;
  onTabChange: (tab: DatabaseTab) => void;
  items: ReactNode;
  compatibility: ReactNode;
  media: ReactNode;
}) {
  const panels = { items, compatibility, media };

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    onTabChange(TABS[next]);
    document.getElementById(`database-tab-${TABS[next]}`)?.focus();
  }

  return (
    <div className={styles.databaseSections}>
      <form role="search" aria-label="Database search" method="GET" action="/admin" className={`${styles.filters} ${styles.databaseSearch}`} onSubmit={event => event.preventDefault()}>
        <input type="hidden" name="databaseTab" value={activeTab} />
        <label>
          Search
          <input name="q" type="search" value={q} onChange={event => onSearchChange({ q: event.target.value, family })} placeholder="part number, family, description" />
        </label>
        <label>
          Family
          <select name="family" value={family} onChange={event => onSearchChange({ q, family: event.target.value })}>
            <option value="">All families</option>
            {family && !families.some(value => value.toLowerCase() === family)
              ? <option value={family}>{family}</option> : null}
            {families.map(value => <option key={value.toLowerCase()} value={value.toLowerCase()}>{value}</option>)}
          </select>
        </label>
        <button type="submit">Search</button>
        {q || family ? <a href={`/admin?databaseTab=${activeTab}`} className={styles.actionButton} onClick={event => { event.preventDefault(); onSearchChange({ q: "", family: "" }); }}>Clear search</a> : null}
      </form>
      <div role="tablist" aria-label={titles.database} className={styles.databaseTabs}>
        {TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`database-tab-${tab}`}
            aria-label={titles[tab]}
            aria-controls={`database-panel-${tab}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            className={styles.databaseTab}
            onClick={() => onTabChange(tab)}
            onKeyDown={event => handleKeyDown(event, index)}
          >
            <span>{titles[tab]}</span>
            <span className={styles.databaseTabCount} aria-hidden="true">{counts[tab]}</span>
          </button>
        ))}
      </div>
      {TABS.map(tab => (
        <div
          key={tab}
          role="tabpanel"
          id={`database-panel-${tab}`}
          aria-labelledby={`database-tab-${tab}`}
          hidden={activeTab !== tab}
          tabIndex={0}
          className={`${styles.databasePanel} ${tab === "items" ? "" : styles.databaseTablePanel}`}
        >
          {panels[tab]}
        </div>
      ))}
    </div>
  );
}
