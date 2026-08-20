import Link from "next/link";
import { DetailsSummary } from "@/components/details-summary";
import { getHarness, getRevision, listLibraryComponents } from "@/lib/api";
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
  const detail = await getRevision(harness.currentRevisionId);
  const connectorCatalog = await listLibraryComponents({
    category: "module",
    isActive: true
  });

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
      </main>
    </div>
  );
}
