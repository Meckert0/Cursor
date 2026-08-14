import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CableCanvas } from "@/components/cable-canvas";
import {
  getHarness,
  getPageDescriptions,
  getRevision,
  ingestLibraryComponents,
  listLibraryComponents,
  listModuleBackshellCompat,
  listModuleStrainReliefCompat,
  updateHarness,
  updateRevisionSnapshot,
  type RevisionDto
} from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { collectAttributesFromFormData } from "@/lib/part-fields";
import { HarnessDescriptionField } from "./harness-description-field";
import styles from "./page.module.css";

function connectorCatalogOnly(catalog: Awaited<ReturnType<typeof listLibraryComponents>>) {
  return catalog.filter((item) => item.category === "module");
}

export default async function HarnessCanvasPage({
  params,
  searchParams
}: {
  params: Promise<{ harnessId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const signedInUser = await requireSignedInUser();
  const { harnessId } = await params;
  const { mode } = await searchParams;
  const harness = await getHarness(harnessId);
  const pageDescriptions = await getPageDescriptions();
  const adminIsViewingAnotherUsersCanvas = signedInUser.accountRole === "admin" && harness.createdBy !== signedInUser.id;
  const isReadOnly = adminIsViewingAnotherUsersCanvas && mode !== "edit";
  const revision = await getRevision(harness.currentRevisionId);
  const connectorCatalog = connectorCatalogOnly(
    await listLibraryComponents({
      category: "module",
      isActive: true
    })
  );
  const backshellCatalog = await listLibraryComponents({
    category: "backshell",
    isActive: true
  });
  const strainReliefCatalog = await listLibraryComponents({
    category: "strain-relief",
    isActive: true
  });
  const [moduleBackshellCompat, moduleStrainReliefCompat] = await Promise.all([
    listModuleBackshellCompat(),
    listModuleStrainReliefCompat()
  ]);

  async function quickAddConnectorAction(formData: FormData) {
    "use server";
    if (isReadOnly) {
      return {
        ok: false,
        error: "Switch to edit mode to add connectors.",
        connectorCatalog: connectorCatalogOnly(await listLibraryComponents({ category: "module", isActive: true }))
      };
    }
    const partNumber = String(formData.get("partNumber") ?? "").trim();
    const family = String(formData.get("family") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const attributes = collectAttributesFromFormData(formData, "module");
    if (!partNumber) {
      return {
        ok: false,
        error: "Part number is required.",
        connectorCatalog: connectorCatalogOnly(await listLibraryComponents({ category: "module", isActive: true }))
      };
    }
    try {
      await ingestLibraryComponents({
        idempotencyKey: `connector-quick-add:${partNumber}:${Date.now()}`,
        items: [
          {
            category: "module",
            family: family || "User entered connector",
            partNumber,
            description: description || `User-entered connector ${partNumber}`,
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            attributes
          }
        ]
      });
      const refreshedConnectorCatalog = connectorCatalogOnly(
        await listLibraryComponents({
          category: "module",
          isActive: true
        })
      );
      revalidatePath(`/harnesses/${harness.id}/canvas`);
      return {
        ok: true,
        notice: "Connector added as unreviewed entry.",
        newConnectorPartNumber: partNumber,
        connectorCatalog: refreshedConnectorCatalog
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Connector quick-add failed.",
        connectorCatalog: connectorCatalogOnly(await listLibraryComponents({ category: "module", isActive: true }))
      };
    }
  }

  async function saveCanvasSnapshotAction(input: {
    snapshot: RevisionDto["snapshot"];
    expectedSnapshotHash: string;
  }) {
    "use server";
    if (isReadOnly) {
      return {
        ok: false,
        error: "Switch to edit mode to save canvas changes."
      };
    }
    try {
      const updated = await updateRevisionSnapshot({
        revisionId: revision.id,
        snapshot: input.snapshot,
        expectedSnapshotHash: input.expectedSnapshotHash
      });
      revalidatePath(`/harnesses/${harness.id}/canvas`);
      revalidatePath(`/harnesses/${harness.id}/wirelist`);
      revalidatePath(`/harnesses/${harness.id}/details/new`);
      revalidatePath(`/details/${revision.id}`);
      return {
        ok: true,
        snapshot: updated.snapshot,
        snapshotHash: updated.snapshotHash
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save canvas.";
      const conflict = /modified elsewhere|409/i.test(message);
      return {
        ok: false,
        conflict,
        error: message
      };
    }
  }

  async function saveHarnessDescriptionAction(description: string) {
    "use server";
    if (isReadOnly) {
      throw new Error("Switch to edit mode to update the harness description.");
    }

    await updateHarness({
      harnessId: harness.id,
      description
    });
    revalidatePath(`/harnesses/${harness.id}/canvas`);
    revalidatePath(`/projects/${harness.projectId}`);
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Harness Canvas</h1>
          <p>{pageDescriptions.harnessHeaderDescription}</p>
          <div className={styles.actions}>
            <Link href={`/projects/${harness.projectId}`}>Back to project</Link>
            <Link href={`/harnesses/${harness.id}/wirelist`}>Wirelist</Link>
            <Link href={`/harnesses/${harness.id}/details/new`}>Details</Link>
            <Link href={`/details/${revision.id}`}>Open Revision Workspace</Link>
          </div>
          {adminIsViewingAnotherUsersCanvas ? (
            <div className={styles.modeToggle}>
              <span>Admin mode:</span>
              <Link href={`/harnesses/${harness.id}/canvas?mode=view`} aria-current={isReadOnly ? "page" : undefined}>
                View
              </Link>
              <Link href={`/harnesses/${harness.id}/canvas?mode=edit`} aria-current={!isReadOnly ? "page" : undefined}>
                Edit
              </Link>
            </div>
          ) : null}
          <HarnessDescriptionField
            initialDescription={harness.description ?? ""}
            saveDescriptionAction={saveHarnessDescriptionAction}
            readOnly={isReadOnly}
          />
        </header>

        <section className={styles.card}>
          <CableCanvas
            revisionId={revision.id}
            snapshot={revision.snapshot}
            snapshotHash={revision.snapshotHash ?? ""}
            connectorCatalog={connectorCatalog}
            backshellCatalog={backshellCatalog}
            strainReliefCatalog={strainReliefCatalog}
            moduleBackshellCompat={moduleBackshellCompat}
            moduleStrainReliefCompat={moduleStrainReliefCompat}
            quickAddConnectorAction={quickAddConnectorAction}
            saveCanvasAction={saveCanvasSnapshotAction}
            readOnly={isReadOnly}
          />
        </section>
      </main>
    </div>
  );
}
