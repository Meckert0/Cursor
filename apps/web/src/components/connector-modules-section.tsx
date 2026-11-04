"use client";

import { useMemo } from "react";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { readCanvasDraftSnapshot } from "@/lib/cable-canvas-utils";
import {
  buildConnectorModuleEntries,
  formatContactPositionList,
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
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {entry.compatibleContacts.map((contact) => (
          <tr key={contact.partNumber}>
            <td>
              {contact.partNumber}
              {contact.description ? <span className={styles.contactDesc}> {contact.description}</span> : null}
            </td>
            <td>{contact.awgRange || "—"}</td>
            <td>{formatContactPositionList(contact.positions)}</td>
            <td>{contact.status === "allowed" ? "Allowed" : "Review"}</td>
          </tr>
        ))}
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
