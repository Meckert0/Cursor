"use client";

import { useMemo } from "react";
import {
  buildConnectorPairTotals,
  buildUniqueWireSections,
  getSleevingLabel,
  readCanvasDraftSnapshot
} from "@/lib/cable-canvas-utils";
import { buildConnectorDetailsRows } from "@/lib/connector-contact-groups";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import styles from "./details-summary.module.css";

type JunctionNode = NonNullable<RevisionDto["snapshot"]["junctions"]>[number];

export function DetailsSummary({
  revisionId,
  snapshot,
  connectors: connectorsOverride,
  junctions: junctionsOverride,
  paths: pathsOverride,
  connectorCatalog = []
}: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
  connectors?: RevisionDto["snapshot"]["connectors"];
  junctions?: JunctionNode[];
  paths?: RevisionDto["snapshot"]["paths"];
  connectorCatalog?: LibraryComponentDto[];
}) {
  const hasLiveOverrides = connectorsOverride !== undefined && pathsOverride !== undefined;
  const draftSnapshot = useMemo(() => {
    if (hasLiveOverrides) {
      return null;
    }
    return readCanvasDraftSnapshot(revisionId, snapshot);
  }, [hasLiveOverrides, revisionId, snapshot]);

  const connectors = useMemo(() => {
    if (hasLiveOverrides) {
      return connectorsOverride;
    }
    return draftSnapshot?.connectors ?? snapshot.connectors;
  }, [connectorsOverride, draftSnapshot?.connectors, hasLiveOverrides, snapshot.connectors]);

  const junctions = useMemo(() => {
    if (hasLiveOverrides) {
      return junctionsOverride ?? [];
    }
    return draftSnapshot?.junctions ?? snapshot.junctions ?? [];
  }, [draftSnapshot?.junctions, hasLiveOverrides, junctionsOverride, snapshot.junctions]);

  const paths = useMemo(() => {
    if (hasLiveOverrides) {
      return pathsOverride;
    }
    return draftSnapshot?.paths ?? snapshot.paths;
  }, [draftSnapshot?.paths, hasLiveOverrides, pathsOverride, snapshot.paths]);

  const uniqueWireSections = useMemo(() => buildUniqueWireSections(paths), [paths]);
  const connectorDetails = useMemo(
    () => buildConnectorDetailsRows(connectors, connectorCatalog),
    [connectorCatalog, connectors]
  );
  const connectorPairTotals = useMemo(
    () =>
      buildConnectorPairTotals({
        connectors,
        junctions,
        paths
      }),
    [connectors, junctions, paths]
  );

  return (
    <div className={styles.summaryGrid}>
      <section className={styles.summaryPanel}>
        <h3>Connectors</h3>
        <ul>
          {connectorDetails.length === 0 ? <li>No connectors yet.</li> : null}
          {connectorDetails.map((connector) => (
            <li key={connector.id} className={styles.connectorItem}>
              <span>{connector.heading}</span>
              <ul className={styles.contactGroups}>
                {connector.lines.map((line, index) => (
                  <li key={`${connector.id}:${index}`}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.summaryPanel}>
        <h3>Cable sections</h3>
        <ul>
          {uniqueWireSections.length === 0 ? <li>No cable sections yet.</li> : null}
          {uniqueWireSections.map((section) => (
            <li key={section.pathId}>
              {section.wireName}: {section.fromNodeId}
              {" -> "}
              {section.toNodeId}, {section.lengthFt} in, {getSleevingLabel(section.sleeving)}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.summaryPanel}>
        <h3>Endpoint totals</h3>
        <ul>
          {connectorPairTotals.length === 0 ? <li>No endpoint totals yet.</li> : null}
          {connectorPairTotals.map((pair) => {
            const fromReference = connectors.find((connector) => connector.id === pair.fromConnectorId)?.reference;
            const toReference = connectors.find((connector) => connector.id === pair.toConnectorId)?.reference;
            const fromLabel = fromReference ? `${fromReference} (${pair.fromConnectorId})` : pair.fromConnectorId;
            const toLabel = toReference ? `${toReference} (${pair.toConnectorId})` : pair.toConnectorId;
            return (
              <li key={`${pair.fromConnectorId}:${pair.toConnectorId}`}>
                {fromLabel}
                {" -> "}
                {toLabel}: {pair.totalLengthFt} in ({pair.hopCount} section
                {pair.hopCount === 1 ? "" : "s"})
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
