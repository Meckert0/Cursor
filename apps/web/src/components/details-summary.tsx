"use client";

import { useMemo } from "react";
import {
  buildConnectorPairTotals,
  buildUniqueWireSections,
  bundleDiameterInches,
  formatBundleDiameterLabel,
  formatEndpointTotalLabel,
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
  // Wirelist runs are not assigned to cable sections yet, and the packing
  // rule is not defined. Pass no diameters so each section stays blank.
  const bundleDiameterLabel = formatBundleDiameterLabel(bundleDiameterInches([]));
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
              {section.toNodeId}, {section.lengthFt} in, {getSleevingLabel(section.sleeving)}, {bundleDiameterLabel}
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
            return (
              <li key={`${pair.fromConnectorId}:${pair.toConnectorId}`}>
                {formatEndpointTotalLabel({
                  fromReference,
                  toReference,
                  fromId: pair.fromConnectorId,
                  toId: pair.toConnectorId,
                  length: pair.totalLengthFt
                })}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
