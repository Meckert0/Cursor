"use client";

import { useMemo } from "react";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { readCanvasDraftSnapshot } from "@/lib/cable-canvas-utils";
import {
  buildConnectorModuleEntries,
  formatContactPositionList,
  groupCompatibleContacts,
  type ConnectorModuleEntry,
  type ContactCompatRow,
  type ContactRelationshipRow
} from "@/lib/connector-contact-groups";
import styles from "./connector-modules-section.module.css";

const EMPTY_CATALOG: LibraryComponentDto[] = [];
const EMPTY_COMPAT: ContactCompatRow[] = [];
const EMPTY_RELATIONSHIPS: ContactRelationshipRow[] = [];

function labeledPart(prefix: string, partNumber: string): string {
  return partNumber.toUpperCase().startsWith(prefix) ? partNumber : `${prefix} ${partNumber}`;
}

function moduleFacts(entry: ConnectorModuleEntry): string[] {
  return [
    entry.description,
    entry.gender,
    entry.contactGroups.join(", "),
    entry.backshellPartNumber ? labeledPart("BS", entry.backshellPartNumber) : "",
    entry.strainReliefPartNumber ? labeledPart("SR", entry.strainReliefPartNumber) : ""
  ].filter((fact) => fact.length > 0);
}

function ModuleBlock({ entry }: { entry: ConnectorModuleEntry }) {
  const facts = moduleFacts(entry);
  return (
    <article className={styles.module} aria-label={`Module ${entry.designator}`}>
      <h4>
        <span className={styles.designator}>{entry.designator}</span>
        <span className={styles.partNumber}>{entry.partNumber || "No part selected"}</span>
      </h4>
      {facts.length > 0 ? (
        <p className={styles.meta}>
          {facts.map((fact, index) => (
            <span key={`${index}:${fact}`}>{fact}</span>
          ))}
        </p>
      ) : null}
      <CompatibilityTable entry={entry} />
    </article>
  );
}

function CompatibilityTable({ entry }: { entry: ConnectorModuleEntry }) {
  if (!entry.moduleDefined) {
    return <p className={styles.empty}>No module selected.</p>;
  }
  if (entry.compatibleContacts.length === 0) {
    return <p className={styles.empty}>No compatible contacts.</p>;
  }
  return (
    <table className={styles.compatTable} aria-label={`Compatible contacts for ${entry.designator}`}>
      <thead>
        <tr>
          <th scope="col">Contact</th>
          <th scope="col">AWG</th>
          <th scope="col">Pos</th>
        </tr>
      </thead>
      <tbody>
        {groupCompatibleContacts(entry.compatibleContacts).flatMap((group) => {
          const partCount = group.rows.reduce((sum, row) => sum + row.partNumbers.length, 0);
          const showDescriptionOnce = group.description.length > 0 && partCount > 1;
          const contactRows = group.rows.map((row) => (
            <tr key={`${group.description}:${row.partNumbers.join("|")}:${row.awgRange}:${row.positions}`}>
              <td>
                {row.partNumbers.join(", ")}
                {!showDescriptionOnce && group.description ? (
                  <span className={styles.contactDesc}> {group.description}</span>
                ) : null}
              </td>
              <td>{row.awgRange || "—"}</td>
              <td>{formatContactPositionList(row.positions, entry.pinPositions)}</td>
            </tr>
          ));
          if (!showDescriptionOnce) {
            return contactRows;
          }
          return [
            <tr key={`${group.description}:label`} className={styles.descriptionRow}>
              <td colSpan={3}>{group.description}</td>
            </tr>,
            ...contactRows
          ];
        })}
      </tbody>
    </table>
  );
}

export function ConnectorModulesSection({
  revisionId,
  snapshot,
  connectors: connectorsOverride,
  connectorCatalog = EMPTY_CATALOG,
  contactCatalog = EMPTY_CATALOG,
  moduleContactCompat = EMPTY_COMPAT,
  contactRelationships = EMPTY_RELATIONSHIPS
}: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
  /** Live canvas connectors. When omitted, the saved canvas draft (or snapshot) is used. */
  connectors?: RevisionDto["snapshot"]["connectors"];
  connectorCatalog?: LibraryComponentDto[];
  contactCatalog?: LibraryComponentDto[];
  moduleContactCompat?: ContactCompatRow[];
  contactRelationships?: ContactRelationshipRow[];
}) {
  const connectors = useMemo(
    () => connectorsOverride ?? readCanvasDraftSnapshot(revisionId, snapshot).connectors,
    [connectorsOverride, revisionId, snapshot]
  );
  const entries = useMemo(
    () =>
      buildConnectorModuleEntries({
        connectors,
        connectorCatalog,
        contactCatalog,
        moduleContactCompat,
        contactRelationships
      }),
    [connectors, connectorCatalog, contactCatalog, moduleContactCompat, contactRelationships]
  );

  return (
    <section className={styles.section} data-testid="connector-modules-section">
      <h3>Connectors</h3>
      {entries.length === 0 ? <p className={styles.empty}>No connectors yet.</p> : null}
      <div className={styles.list}>
        {entries.map((entry) => (
          <ModuleBlock key={entry.key} entry={entry} />
        ))}
      </div>
    </section>
  );
}
