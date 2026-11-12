import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CableCanvas } from "@/components/cable-canvas";
import {
  getHarness,
  getRevision,
  ingestLibraryComponents,
  listCanvasSideProfiles,
  listLibraryComponents,
  listModuleContactCompat,
  listPartRelationships,
  updateHarness,
  updateRevisionSnapshot,
  type RevisionDto
} from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { collectAttributesFromFormData, isCanvasDefinablePart } from "@/lib/part-fields";
import { isSimInsert } from "@/lib/sim-modules";
import { HarnessDescriptionField } from "./harness-description-field";
import styles from "./page.module.css";

function connectorCatalogForCanvas(catalog: Awaited<ReturnType<typeof listLibraryComponents>>) {
  return catalog.filter((item) => isCanvasDefinablePart(item) || isSimInsert(item));
}

async function loadConnectorCatalog() {
  const [modules, frames] = await Promise.all([
    listLibraryComponents({
      category: "module",
      isActive: true
    }),
    listLibraryComponents({
      category: "frame",
      isActive: true
    })
  ]);
  return connectorCatalogForCanvas([...modules, ...frames]);
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
  const adminIsViewingAnotherUsersCanvas = signedInUser.accountRole === "admin" && harness.createdBy !== signedInUser.id;
  const isReadOnly = adminIsViewingAnotherUsersCanvas && mode !== "edit";
  const revision = await getRevision(harness.currentRevisionId);
  const [
    connectorCatalog,
    backshellCatalog,
    strainReliefCatalog,
    wireCatalog,
    sleeveCatalog,
    relationships,
    contactCatalog,
    moduleContactCompat,
    sideProfileMedia
  ] = await Promise.all([
    loadConnectorCatalog(),
    listLibraryComponents({
      category: "backshell",
      isActive: true
    }),
    listLibraryComponents({
      category: "strain-relief",
      isActive: true
    }),
    listLibraryComponents({
      category: "wire",
      isActive: true
    }),
    listLibraryComponents({
      category: "sleeve-tube-braid",
      isActive: true
    }),
    listPartRelationships(),
    listLibraryComponents({
      category: "contact",
      isActive: true
    }),
    listModuleContactCompat(),
    listCanvasSideProfiles()
  ]);
  const moduleAllowedRelationships = relationships.filter(row => row.relationshipType === "MODULE_ALLOWED");
  const contactRelationships = relationships.filter(row => row.relationshipType === "CONTACT_ALLOWED");
  const insertAllowedRelationships = relationships.filter(row => row.relationshipType === "INSERT_ALLOWED");

  async function quickAddConnectorAction(formData: FormData) {
    "use server";
    if (isReadOnly) {
      return {
        ok: false,
        error: "Switch to edit mode to add parts.",
        connectorCatalog: await loadConnectorCatalog()
      };
    }
    const requestedCategory = String(formData.get("category") ?? "module");
    if (requestedCategory !== "module" && requestedCategory !== "frame") {
      return { ok: false, error: "Choose a connector or frame category.", connectorCatalog: await loadConnectorCatalog() };
    }
    const category = requestedCategory;
    const noun = category === "frame" ? "frame" : "connector";
    const partType = category === "frame" ? String(formData.get("partType") ?? "").trim().toUpperCase() : "MODULE";
    if (category === "frame" && partType !== "ITA" && partType !== "RECEIVER") {
      return { ok: false, error: "Choose an ITA or Receiver housing type.", connectorCatalog: await loadConnectorCatalog() };
    }
    const partNumber = String(formData.get("partNumber") ?? "").trim();
    const family = String(formData.get("family") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const attributes = collectAttributesFromFormData(formData, category);
    if (!partNumber) {
      return {
        ok: false,
        error: "Part number is required.",
        connectorCatalog: await loadConnectorCatalog()
      };
    }
    try {
      await ingestLibraryComponents({
        idempotencyKey: `${noun}-quick-add:${partNumber}:${Date.now()}`,
        items: [
          {
            category,
            family: family || `User entered ${noun}`,
            partNumber,
            description: description || `User-entered ${noun} ${partNumber}`,
            isActive: true,
            stockStatus: "in_stock",
            isReviewed: false,
            partType,
            ...(category === "frame" ? { side: partType, electricalMode: "NONE" } : {}),
            notes: String(formData.get("notes") ?? "").trim() || undefined,
            attributes
          }
        ]
      });
      const refreshedConnectorCatalog = await loadConnectorCatalog();
      revalidatePath(`/harnesses/${harness.id}/canvas`);
      return {
        ok: true,
        notice: `${category === "frame" ? "Frame" : "Connector"} added as unreviewed entry.`,
        newConnectorPartNumber: partNumber,
        connectorCatalog: refreshedConnectorCatalog
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : `${noun} quick-add failed.`,
        connectorCatalog: await loadConnectorCatalog()
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
        <PageHeader className={styles.header} user={signedInUser} pageKey="canvas">
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
        </PageHeader>

        <section className={styles.card}>
          <CableCanvas
            revisionId={revision.id}
            snapshot={revision.snapshot}
            snapshotHash={revision.snapshotHash ?? ""}
            connectorCatalog={connectorCatalog}
            sideProfileMedia={sideProfileMedia}
            backshellCatalog={backshellCatalog}
            strainReliefCatalog={strainReliefCatalog}
            accessoryRelationships={relationships}
            moduleAllowedRelationships={moduleAllowedRelationships}
            insertAllowedRelationships={insertAllowedRelationships}
            wireCatalog={wireCatalog}
            sleeveCatalog={sleeveCatalog}
            contactCatalog={contactCatalog}
            moduleContactCompat={moduleContactCompat}
            contactRelationships={contactRelationships}
            quickAddConnectorAction={quickAddConnectorAction}
            saveCanvasAction={saveCanvasSnapshotAction}
            readOnly={isReadOnly}
          />
        </section>
      </main>
    </div>
  );
}
