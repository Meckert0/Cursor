"use client";

import { useMemo } from "react";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { readCanvasDraftSnapshot } from "@/lib/cable-canvas-utils";
import {
  buildConnectorModuleEntries,
  type ConnectorModuleEntry,
  type ContactCompatRow,
  type ContactRelationshipRow
} from "@/lib/connector-contact-groups";
import styles from "./connector-modules-section.module.css";

const EMPTY_CATALOG: LibraryComponentDto[] = [];
const EMPTY_COMPAT: ContactCompatRow[] = [];
const EMPTY_RELATIONSHIPS: ContactRelationshipRow[] = [];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </>
  );
}

function ModuleInfo({ entry }: { entry: ConnectorModuleEntry }) {
  return (
    <dl className={styles.info}>
      {entry.frame ? (
        <InfoRow
          label="Frame"
          value={[entry.frame.reference, entry.frame.partNumber, `slot ${entry.frame.slotId}`]
            .filter((part) => part.length > 0)
            .join(" — ")}
        />
      ) : null}
      <InfoRow label="Description" value={entry.description} />
      <InfoRow label="Gender" value={entry.gender} />
      <InfoRow label="Contacts" value={entry.contactGroups.join(", ")} />
      <InfoRow label="Backshell" value={entry.backshellPartNumber} />
      <InfoRow label="Strain relief" value={entry.strainReliefPartNumber} />
    </dl>
  );
}

function CompatibilityTable({ entry }: { entry: ConnectorModuleEntry }) {
  if (!entry.moduleDefined) {
    return <p className={styles.empty}>Select a module on the canvas to see compatible contacts.</p>;
  }
  if (entry.compatibleContacts.length === 0) {
    return <p className={styles.empty}>No compatible contacts in the library for this module.</p>;
  }
  return (
    <table className={styles.compatTable} aria-label={`Compatible contacts for ${entry.designator}`}>
      <thead>
        <tr>
          <th scope="col">Contact P/N</th>
          <th scope="col">Description</th>
          <th scope="col">AWG range</th>
          <th scope="col">Positions</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {entry.compatibleContacts.map((contact) => (
          <tr key={contact.partNumber}>
            <td>{contact.partNumber}</td>
            <td>{contact.description || "—"}</td>
            <td>{contact.awgRange || "—"}</td>
            <td>{contact.positions}</td>
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
          <article key={entry.key} className={styles.module} aria-label={`Module ${entry.designator}`}>
            <div className={styles.moduleDetails}>
              <h4>
                <span className={styles.designator}>{entry.designator}</span>
                <span className={styles.partNumber}>{entry.partNumber || "No part selected"}</span>
              </h4>
              <ModuleInfo entry={entry} />
            </div>
            <div className={styles.compat}>
              <CompatibilityTable entry={entry} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
