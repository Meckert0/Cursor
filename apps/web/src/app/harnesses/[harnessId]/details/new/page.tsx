import Link from "next/link";
import { DetailsPurchasingBom } from "@/components/details-purchasing-bom";
import { DetailsSummary } from "@/components/details-summary";
import { getHarness, getRevision, getRevisionBom, listLibraryComponents } from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import styles from "./page.module.css";

export default async function HarnessDetailsPage({
  params
}: {
  params: Promise<{
    harnessId: string;
  }>;
}) {
  await requireSignedInUser();
  const { harnessId } = await params;
  const harness = await getHarness(harnessId);
  const [detail, connectorCatalog, bom] = await Promise.all([
    getRevision(harness.currentRevisionId),
    listLibraryComponents({
      category: "module",
      isActive: true
    }),
    getRevisionBom(harness.currentRevisionId)
  ]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Details</h1>
          <p>
            Harness <strong>{harness.name}</strong>
          </p>
          <div className={styles.actions}>
            <Link href={`/harnesses/${harness.id}/canvas`}>Back to canvas</Link>
          </div>
        </header>

        <DetailsSummary
          revisionId={detail.id}
          snapshot={detail.snapshot}
          connectorCatalog={connectorCatalog}
        />
        <DetailsPurchasingBom revisionId={detail.id} snapshot={detail.snapshot} />

        <section className={styles.card} data-testid="details-bom-section">
          <h2>Bill of Materials</h2>
          <p>
            Library version {bom.libraryVersion}. Resolved {bom.summary.resolved}/{bom.summary.totalLines} lines
            {bom.summary.unresolved > 0 ? ` (${bom.summary.unresolved} unresolved)` : ""}.
          </p>
          {bom.lines.length === 0 ? <p>No BOM lines yet. Add connectors and wires with part numbers.</p> : null}
          {bom.lines.length > 0 ? (
            <div className={styles.bomTableWrap} data-testid="details-bom-table">
              <table className={styles.bomTable}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Part Number</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Status</th>
                    <th>Used By</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.lines.map((line, index) => (
                    <tr
                      key={`${line.category}-${line.partNumber}-${line.unit}-${line.resolution}-${index}`}
                      className={line.resolution === "resolved" ? undefined : styles.bomUnresolved}
                      data-testid={line.resolution === "resolved" ? "bom-line-resolved" : "bom-line-unresolved"}
                    >
                      <td>{index + 1}</td>
                      <td>{line.category}</td>
                      <td>
                        {line.libraryComponentId ? (
                          <Link href={`/library/${line.libraryComponentId}`}>{line.partNumber}</Link>
                        ) : (
                          <Link href="/library">{line.partNumber}</Link>
                        )}
                      </td>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>{line.unit}</td>
                      <td>{line.resolution}</td>
                      <td>{line.designRefs.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
