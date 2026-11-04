"use client";

import { useMemo } from "react";
import {
  buildConnectorPairTotals,
  buildUniqueWireSections,
  formatBundleDiameterLabel,
  formatEndpointTotalLabel,
  getSleevingLabel,
  readCanvasDraftSnapshot
} from "@/lib/cable-canvas-utils";
import { cableSectionBundleDiameters, selectSleeveForBundleDiameter } from "@/lib/bundle-diameter";
import type { ContactCompatRow, ContactRelationshipRow } from "@/lib/connector-contact-groups";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import { ConnectorModulesSection } from "./connector-modules-section";
import styles from "./details-summary.module.css";

const EMPTY_CATALOG: LibraryComponentDto[] = [];

type JunctionNode = NonNullable<RevisionDto["snapshot"]["junctions"]>[number];

export function DetailsSummary({
  revisionId,
  snapshot,
  connectors: connectorsOverride,
  junctions: junctionsOverride,
  paths: pathsOverride,
  connectorCatalog = EMPTY_CATALOG,
  wireCatalog = EMPTY_CATALOG,
  sleeveCatalog = EMPTY_CATALOG,
  contactCatalog,
  moduleContactCompat,
  contactRelationships
}: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
  connectors?: RevisionDto["snapshot"]["connectors"];
  junctions?: JunctionNode[];
  paths?: RevisionDto["snapshot"]["paths"];
  connectorCatalog?: LibraryComponentDto[];
  wireCatalog?: LibraryComponentDto[];
  sleeveCatalog?: LibraryComponentDto[];
  contactCatalog?: LibraryComponentDto[];
  moduleContactCompat?: ContactCompatRow[];
  contactRelationships?: ContactRelationshipRow[];
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
  const bundleDiameterBySection = useMemo(
    () =>
      cableSectionBundleDiameters({
        connectors,
        junctions,
        cablePaths: paths,
        wireRuns: snapshot.paths,
        wireCatalog,
        connectorCatalog,
        pinMappings: snapshot.pinMappings
      }),
    [connectorCatalog, connectors, junctions, paths, snapshot.paths, snapshot.pinMappings, wireCatalog]
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
      <ConnectorModulesSection
        revisionId={revisionId}
        snapshot={snapshot}
        connectors={connectors}
        connectorCatalog={connectorCatalog}
        contactCatalog={contactCatalog}
        moduleContactCompat={moduleContactCompat}
        contactRelationships={contactRelationships}
      />
      <section className={styles.summaryPanel}>
        <h3>Cable sections</h3>
        <ul>
          {uniqueWireSections.length === 0 ? <li>No cable sections yet.</li> : null}
          {uniqueWireSections.map((section) => {
            const bundleDiameter = bundleDiameterBySection.get(section.pathId) ?? null;
            const sleeve = selectSleeveForBundleDiameter({
              sleeving: section.sleeving,
              bundleDiameterIn: bundleDiameter,
              sleeves: sleeveCatalog
            });
            return (
              <li key={section.pathId}>
                {section.wireName}: {section.fromNodeId}
                {" -> "}
                {section.toNodeId}, {section.lengthFt} in, {getSleevingLabel(section.sleeving)},{" "}
                {formatBundleDiameterLabel(bundleDiameter)}
                {sleeve ? `, size ${sleeve.partNumber}` : ""}
              </li>
            );
          })}
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
