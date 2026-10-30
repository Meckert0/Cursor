"use client";

import { useMemo } from "react";
import type { RevisionDto } from "@/lib/api";
import { readCanvasDraftSnapshot } from "@/lib/cable-canvas-utils";
import { buildColumnsCounted, buildConnectorCounts } from "@/lib/wirelist-columns-counted";
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

  return (
    <>
      <WirelistColumnsCountedPanel
        counted={columnsCounted}
        description={`${columnsCounted.rowCount} wirelist row(s) counted, ${columnsCounted.preterminatedEnds} W/CBL end(s). These quantities come from the wirelist. The bill of materials is at the bottom of this page.`}
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
    </>
  );
}
