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
import { cableSectionBundleDiameters } from "@/lib/bundle-diameter";
import {
  buildCableSectionMaterials,
  CABLE_MATERIAL_LABELS,
  formatMaterialLength,
  totalCableSectionMaterials
} from "@/lib/cable-section-materials";
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
  const materialSections = useMemo(
    () => buildCableSectionMaterials({ sections: uniqueWireSections, bundleDiameters: bundleDiameterBySection, sleeveCatalog }),
    [uniqueWireSections, bundleDiameterBySection, sleeveCatalog]
  );
  const materialTotals = useMemo(() => totalCableSectionMaterials(materialSections), [materialSections]);

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
          {materialSections.map((section) => {
            return (
              <li key={section.pathId}>
                <div>
                  {section.wireName}: {section.fromNodeId}
                  {" -> "}
                  {section.toNodeId}, {section.lengthFt} in, {getSleevingLabel(section.sleeving)},{" "}
                  {formatBundleDiameterLabel(section.bundleDiameterIn)}
                </div>
                {section.materials.map((material) => (
                  <div key={material.kind} className={styles.materialLine}>
                    {CABLE_MATERIAL_LABELS[material.kind]}:{" "}
                    {material.part?.partNumber ?? (section.bundleDiameterIn === null ? "diameter unavailable" : "no matching size")}
                    {` (${formatMaterialLength(section.lengthFt)})`}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
        <div className={styles.materialTotals}>
          <h4>Cable section totals</h4>
          <ul aria-label="Material totals by part number">
            {materialTotals.parts.map((part) => (
              <li key={`${part.kind}:${part.partNumber}`}>
                {CABLE_MATERIAL_LABELS[part.kind]} {part.partNumber ?? "(unresolved size)"}: {formatMaterialLength(part.lengthIn)}
              </li>
            ))}
          </ul>
          <ul aria-label="Cable section length totals" className={styles.lengthTotals}>
            <li>Total cable length: {formatMaterialLength(materialTotals.cableLengthIn)}</li>
            <li>Expandable sleeving total: {formatMaterialLength(materialTotals.byMaterial.expandable_sleeving)}</li>
            <li>Wire braid total: {formatMaterialLength(materialTotals.byMaterial.wire_braid)}</li>
            <li><strong>Total material length: {formatMaterialLength(materialTotals.materialLengthIn)}</strong></li>
          </ul>
        </div>
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
