"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminSectionTitles } from "@/lib/api";
import styles from "./page.module.css";

const TABS = ["items", "compatibility", "media"] as const;
type DatabaseTab = typeof TABS[number];

export function DatabaseSections({ titles, counts, items, compatibility, media }: {
  titles: AdminSectionTitles;
  counts: Record<DatabaseTab, number>;
  items: ReactNode;
  compatibility: ReactNode;
  media: ReactNode;
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("databaseTab");
  const activeTab = TABS.find(tab => tab === requested) ?? "items";
  const panels = { items, compatibility, media };

  function select(tab: DatabaseTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("databaseTab", tab);
    window.history.replaceState(null, "", url);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    select(TABS[next]);
    document.getElementById(`database-tab-${TABS[next]}`)?.focus();
  }

  return (
    <div className={styles.databaseSections}>
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
            onClick={() => select(tab)}
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
