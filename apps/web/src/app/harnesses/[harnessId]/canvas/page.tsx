import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CableCanvas } from "@/components/cable-canvas";
import {
  getHarness,
  getPageDescriptions,
  getRevision,
  ingestLibraryComponents,
  listLibraryComponents,
  listLibraryFieldDefinitions,
  updateHarness
} from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { HarnessDescriptionField } from "./harness-description-field";
import styles from "./page.module.css";

function removeSeededWire(catalog: Awaited<ReturnType<typeof listLibraryComponents>>) {
  return catalog.filter((item) => item.id !== "cmp-wire-001");
}

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
  const wireCatalog = removeSeededWire(
    await listLibraryComponents({
      category: "wire",
      isActive: true
    })
  );
  const connectorCatalog = connectorCatalogOnly(
    await listLibraryComponents({
      category: "module",
      isActive: true
    })
  );
  const connectorFieldDefinitions = await listLibraryFieldDefinitions("module").catch(() => []);

  async function quickAddWireAction(formData: FormData) {
    "use server";
    if (isReadOnly) {
      return {
        ok: false,
        error: "Switch to edit mode to add wires.",
        wireCatalog: removeSeededWire(await listLibraryComponents({ category: "wire", isActive: true }))
      };
    }
    const partNumber = String(formData.get("partNumber") ?? "").trim();
    const awg = String(formData.get("awg") ?? "").trim();
    const color = String(formData.get("color") ?? "").trim();
    if (!partNumber || !awg || !color) {
      return {
        ok: false,
        error: "Part number, AWG, and color are required.",
        wireCatalog: removeSeededWire(await listLibraryComponents({ category: "wire", isActive: true }))
      };
    }
    try {
      const ingestResult = await ingestLibraryComponents({
        idempotencyKey: `wire-quick-add:${partNumber}:${awg}:${color}:${Date.now()}`,
        items: [
          {
            category: "wire",
            family: "User entered wire",
            partNumber,
            description: `User-entered wire ${partNumber} (${awg} AWG, ${color})`,
            awg,
            color,
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      });
      const createdId = ingestResult.results.find((row) => row.status === "committed")?.componentId;
      const refreshedWireCatalog = removeSeededWire(
        await listLibraryComponents({
          category: "wire",
          isActive: true
        })
      );
      revalidatePath(`/harnesses/${harness.id}/canvas`);
      return {
        ok: true,
        notice: createdId ? "Wire added as unreviewed entry." : "Wire ingest request completed.",
        newWireComponentId: createdId,
        wireCatalog: refreshedWireCatalog
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Wire quick-add failed.",
        wireCatalog: removeSeededWire(await listLibraryComponents({ category: "wire", isActive: true }))
      };
    }
  }

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
    const customFieldValues = Object.fromEntries(
      Array.from(formData.entries())
        .filter(([key]) => key.startsWith("customField:"))
        .map(([key, value]) => [key.replace("customField:", ""), String(value).trim()])
        .filter(([, value]) => value.length > 0)
    );
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
            compatibilityHints: [],
            isReviewed: false,
            customFieldValues
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
            wireCatalog={wireCatalog}
            connectorCatalog={connectorCatalog}
            connectorFieldDefinitions={connectorFieldDefinitions}
            quickAddWireAction={quickAddWireAction}
            quickAddConnectorAction={quickAddConnectorAction}
            readOnly={isReadOnly}
          />
        </section>
      </main>
    </div>
  );
}
