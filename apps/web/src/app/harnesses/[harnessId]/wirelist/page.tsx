import Link from "next/link";
import { revalidatePath } from "next/cache";
import { WirelistGrid } from "@/components/wirelist-grid";
import { getHarness, getRevision, listLibraryComponents, updateRevisionSnapshot, type RevisionDto } from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { buildWirelistXlsxBuffer } from "@/lib/wirelist-xlsx-export";
import {
  buildWirelistNodeIds,
  filterPopulatedWirelistRows,
  parseImportedWirelistRows,
  snapshotToWirelistRows,
  validateWirelistRows,
  wirelistRowsToSnapshot,
  type WirelistRow
} from "@/lib/wirelist-utils";
import styles from "./page.module.css";

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "wirelist";
}

export default async function HarnessWirelistPage({
  params
}: {
  params: Promise<{
    harnessId: string;
  }>;
}) {
  await requireSignedInUser();
  const { harnessId } = await params;
  const harness = await getHarness(harnessId);
  const revision = await getRevision(harness.currentRevisionId);
  const wireCatalog = await listLibraryComponents({
    category: "wire",
    isActive: true
  });
  const connectorCatalog = await listLibraryComponents({
    category: "module",
    isActive: true
  });

  async function importWirelistAction(formData: FormData) {
    "use server";
    const file = formData.get("wirelistFile");
    if (!(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        error: "Select an .xlsx file to import."
      };
    }
    try {
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];
      const records = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: ""
      });
      if (records.length === 0) {
        return {
          ok: false,
          error: "Spreadsheet does not contain any wire rows."
        };
      }
      const importedRows = parseImportedWirelistRows({
        records,
        existingRows: snapshotToWirelistRows(revision.snapshot),
        wireCatalog
      });
      if (importedRows.length === 0) {
        return {
          ok: false,
          error: "Spreadsheet does not contain populated wire rows."
        };
      }
      const errors = validateWirelistRows(importedRows, buildWirelistNodeIds(revision.snapshot));
      if (errors.length > 0) {
        return {
          ok: false,
          error: errors[0]
        };
      }
      const nextSnapshot = wirelistRowsToSnapshot(revision.snapshot, importedRows);
      const updated = await updateRevisionSnapshot({
        revisionId: revision.id,
        snapshot: nextSnapshot
      });
      revalidatePath(`/harnesses/${harness.id}/wirelist`);
      revalidatePath(`/harnesses/${harness.id}/canvas`);
      revalidatePath(`/harnesses/${harness.id}/details/new`);
      revalidatePath(`/details/${revision.id}`);
      return {
        ok: true,
        snapshot: updated.snapshot
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to import XLSX."
      };
    }
  }

  async function exportWirelistAction(rows: WirelistRow[]) {
    "use server";
    const exportRows = filterPopulatedWirelistRows(rows);
    if (exportRows.length === 0) {
      return {
        ok: false,
        error: "No wire rows to export."
      };
    }
    try {
      const buffer = await buildWirelistXlsxBuffer(exportRows);
      return {
        ok: true,
        fileName: `${sanitizeFileName(harness.name)}-wirelist.xlsx`,
        fileBase64: buffer.toString("base64")
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to export XLSX."
      };
    }
  }

  async function saveWirelistAction(snapshot: RevisionDto["snapshot"]) {
    "use server";
    try {
      const updated = await updateRevisionSnapshot({
        revisionId: revision.id,
        snapshot
      });
      return {
        ok: true,
        snapshot: updated.snapshot
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save wirelist."
      };
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Wirelist</h1>
          <p>
            Harness <strong>{harness.name}</strong>. Spreadsheet edits autosave into revision snapshot data used by Details.
          </p>
          <div className={styles.actions}>
            <Link href={`/harnesses/${harness.id}/canvas`}>Back to canvas</Link>
            <Link href={`/harnesses/${harness.id}/details/new`}>Details</Link>
            <Link href={`/details/${revision.id}`}>Open Revision Workspace</Link>
          </div>
        </header>
        <section className={styles.card}>
          <WirelistGrid
            revisionId={revision.id}
            initialSnapshot={revision.snapshot}
            wireCatalog={wireCatalog}
            connectorCatalog={connectorCatalog}
            importWirelistAction={importWirelistAction}
            exportWirelistAction={exportWirelistAction}
            saveWirelistAction={saveWirelistAction}
          />
        </section>
      </main>
    </div>
  );
}
