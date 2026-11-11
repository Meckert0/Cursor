"use client";

import { useMemo, useSyncExternalStore } from "react";
import { LIBRARY_ITEM_CATEGORIES, type AdminSectionTitles } from "@/lib/api";
import { ItemDatabaseViewer, type ItemDatabaseViewerProps } from "./item-database-viewer";
import { CompatibilityManager, type CompatibilityManagerProps } from "./compatibility-manager";
import { MediaManager, type MediaManagerProps } from "./media-manager";
import { DatabaseSections } from "./database-sections";
import { SectionName } from "./section-name-editor";
import { databaseFamilies, searchDatabase, type DatabaseRecords } from "./database-search";
import { parseDatabaseLocation, readDatabaseLocation, subscribeDatabaseLocation, updateDatabaseLocation } from "./database-location";
import styles from "./page.module.css";

export function DatabaseManager({ titles, records, initialSearch, categoryLabel, currentUserId, itemActions, compatibilityActions, mediaActions }: {
  titles: AdminSectionTitles;
  records: DatabaseRecords;
  initialSearch: string;
  categoryLabel: ItemDatabaseViewerProps["categoryLabel"];
  currentUserId: string;
  itemActions: Pick<ItemDatabaseViewerProps, "createAction" | "editAction" | "deleteAction">;
  compatibilityActions: Omit<CompatibilityManagerProps, keyof DatabaseRecords>;
  mediaActions: Pick<MediaManagerProps, "upsertAction" | "deleteAction">;
}) {
  const snapshot = useSyncExternalStore(subscribeDatabaseLocation, readDatabaseLocation, () => initialSearch);
  const location = parseDatabaseLocation(snapshot);
  const { q, family, tab } = location;
  const results = useMemo(() => searchDatabase(records, { q, family }), [records, q, family]);
  const families = useMemo(() => databaseFamilies(records.items), [records.items]);
  const categories = q.trim() || family
    ? LIBRARY_ITEM_CATEGORIES.filter(category => results.items.some(item => item.category === category))
    : LIBRARY_ITEM_CATEGORIES;

  return (
    <section id="database" className={`${styles.card} ${styles.sectionPanel}`}>
      <details open>
        <summary className={styles.sectionSummary}>
          <SectionName name="database" className={styles.sectionTitle} />
          <span className={styles.sectionHint}>{results.items.length} items · {results.relationships.length} compatibility groups · {results.media.length} files</span>
        </summary>
        <DatabaseSections
          titles={titles}
          counts={{ items: results.items.length, compatibility: results.relationships.length + results.aliases.length, media: results.media.length }}
          q={q}
          family={family}
          families={families}
          activeTab={tab}
          onSearchChange={input => updateDatabaseLocation({ ...location, ...input })}
          onTabChange={nextTab => updateDatabaseLocation({ ...location, tab: nextTab })}
          items={<ItemDatabaseViewer items={results.items} relationships={records.relationships} media={records.media} visibleCategories={categories} categoryLabel={categoryLabel} expandMatchingCategories={Boolean(q.trim() || family)} currentUserId={currentUserId} {...itemActions} />}
          compatibility={<CompatibilityManager items={records.items} contactWire={results.contactWire} moduleContact={results.moduleContact} moduleBackshell={results.moduleBackshell} moduleStrainRelief={results.moduleStrainRelief} aliases={results.aliases} relationships={results.relationships} {...compatibilityActions} />}
          media={<div id="catalog-media"><MediaManager items={records.items} media={results.media} defaultPartId={results.items.length === 1 ? results.items[0].id : undefined} {...mediaActions} /></div>}
        />
      </details>
    </section>
  );
}
