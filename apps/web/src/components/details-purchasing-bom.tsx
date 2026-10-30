"use client";

import { useMemo } from "react";
import type { RevisionDto } from "@/lib/api";
import { readCanvasDraftSnapshot } from "@/lib/cable-canvas-utils";
import { buildColumnsCounted, buildConnectorCounts, buildTotalBom } from "@/lib/wirelist-columns-counted";
import { snapshotToWirelistRows } from "@/lib/wirelist-utils";
import { WirelistColumnsCountedPanel } from "./wirelist-columns-counted-panel";
import styles from "./details-purchasing-bom.module.css";

export function DetailsPurchasingBom({
  revisionId,
  snapshot
}: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
}) {
  const columnsCounted = useMemo(() => buildColumnsCounted(snapshotToWirelistRows(snapshot)), [snapshot]);
  const connectorItems = useMemo(() => {
    const draft = readCanvasDraftSnapshot(revisionId, snapshot);
    return buildConnectorCounts(draft.connectors);
  }, [revisionId, snapshot]);
  const totalBom = useMemo(
    () => buildTotalBom(columnsCounted, connectorItems),
    [columnsCounted, connectorItems]
  );

  return (
    <>
      <WirelistColumnsCountedPanel
        counted={columnsCounted}
        description={`${columnsCounted.rowCount} wirelist row(s) counted, ${columnsCounted.preterminatedEnds} W/CBL end(s). These quantities come from the wirelist. Connector parts are listed next, and both are combined in the full BOM at the bottom of this page.`}
      />

      <section className={styles.card} data-testid="details-connectors-section">
        <h2>Connector parts</h2>
        <p>Connector, module, frame, backshell, and strain relief part numbers from the canvas. One each per use.</p>
        {connectorItems.length === 0 ? <p className={styles.empty}>No connector part numbers yet.</p> : null}
        {connectorItems.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Part Number</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>References</th>
                </tr>
              </thead>
              <tbody>
                {connectorItems.map((item) => (
                  <tr key={item.value}>
                    <td>{item.value}</td>
                    <td>{item.qty}</td>
                    <td>{item.unit}</td>
                    <td>{item.sources.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.card} data-testid="details-total-bom">
        <h2>Total BOM</h2>
        <p>
          Columns counted items and connector parts together, sorted alphabetically. The same part number in feet and
          each stays on separate lines. Items in parentheses are left out.
        </p>
        {totalBom.length === 0 ? <p className={styles.empty}>No BOM items yet.</p> : null}
        {totalBom.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Part Number</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {totalBom.map((line) => (
                  <tr key={`${line.partNumber}|${line.unit}`}>
                    <td>{line.partNumber}</td>
                    <td>{line.quantity}</td>
                    <td>{line.unit}</td>
                    <td>{line.sections.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
