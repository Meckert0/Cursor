import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  createRevisionExport,
  getDesign,
  getExport,
  getRevision,
  getRevisionBom,
  getValidationRun,
  listRevisionExports,
  toActionableApiErrorMessage,
  validateRevision
} from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import styles from "./page.module.css";

async function refreshDetailsAction(detailId: string) {
  "use server";
  revalidatePath(`/details/${detailId}`);
}

async function validateDetailsAction(detailId: string) {
  "use server";
  let validation;
  try {
    validation = await validateRevision({ revisionId: detailId, mode: "full" });
  } catch (error) {
    const message = toActionableApiErrorMessage(error instanceof Error ? error.message : "Validation failed.", {
      "Revision not found.": "Details not found. Refresh and try again.",
      "Design not found for revision.": "Harness metadata missing for this details record. Refresh and retry."
    });
    redirect(`/details/${detailId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/details/${detailId}?validationRunId=${validation.validationRunId}`);
}

async function exportDetailsAction(detailId: string, formData: FormData) {
  "use server";
  const format = String(formData.get("format") ?? "json");
  if (format !== "json" && format !== "pdf" && format !== "xlsx") {
    throw new Error("Invalid export format.");
  }

  let notice = "Export queued.";
  try {
    await createRevisionExport({ revisionId: detailId, format });
    revalidatePath(`/details/${detailId}`);
    notice = "Export queued.";
  } catch (error) {
    const message = toActionableApiErrorMessage(error instanceof Error ? error.message : "Export failed.", {
      "Revision not found.": "Details not found. Refresh and try again.",
      "Design not found for revision.": "Harness metadata missing for this details record. Refresh and retry."
    });
    redirect(`/details/${detailId}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/details/${detailId}?notice=${encodeURIComponent(notice)}`);
}

export default async function DetailsPage({
  params,
  searchParams
}: {
  params: Promise<{
    detailId: string;
  }>;
  searchParams: Promise<{
    validationRunId?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  await requireSignedInUser();
  const { detailId } = await params;
  const { validationRunId, notice, error } = await searchParams;

  const revision = await getRevision(detailId);
  const design = await getDesign(revision.designId);
  const bom = await getRevisionBom(detailId);

  const rawExports = await listRevisionExports(detailId);
  const exports = await Promise.all(
    rawExports.map(async (artifact) => {
      if (artifact.status !== "completed") {
        return artifact;
      }
      return getExport(artifact.id);
    })
  );
  const hasPendingExports = exports.some((artifact) => artifact.status === "queued" || artifact.status === "processing");

  let validation:
    | Awaited<ReturnType<typeof getValidationRun>>
    | undefined;
  let validationError: string | undefined;

  if (validationRunId) {
    try {
      validation = await getValidationRun(validationRunId);
    } catch (loadError) {
      validationError = loadError instanceof Error ? loadError.message : "Failed to load validation run.";
    }
  }

  return (
    <div className={styles.page}>
      <AutoRefresh enabled={hasPendingExports} intervalMs={3000} />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>Details</h1>
          <p>
            Details {revision.revisionNumber} ({revision.id}) for <strong>{design.name}</strong>
          </p>
          <div className={styles.actions}>
            <Link href={`/harnesses/${design.id}/canvas`}>Back to canvas</Link>
            <form action={refreshDetailsAction.bind(null, detailId)}>
              <button type="submit">Refresh now</button>
            </form>
          </div>
          {notice ? <p data-testid="details-page-notice">{notice}</p> : null}
          {error ? (
            <p className={styles.error} data-testid="details-page-error">
              {error}
            </p>
          ) : null}
        </div>

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

        <section className={styles.card}>
          <h2>Validate</h2>
          <p>Run validation and load detailed results on this page.</p>
          <form action={validateDetailsAction.bind(null, detailId)} data-testid="run-validation-form">
            <button type="submit" data-testid="run-validation-submit">Run full validation</button>
          </form>
          {validationError ? <p className={styles.error}>{validationError}</p> : null}
          {validation ? (
            <div className={styles.validationPanel}>
              <p>
                <strong>Run:</strong> {validation.id}
              </p>
              <p>
                <strong>Ruleset:</strong> {validation.rulesetVersion}
              </p>
              <p>
                <strong>Summary:</strong> errors {validation.summary.errors}, warnings {validation.summary.warnings}, infos{" "}
                {validation.summary.infos}
              </p>
              {validation.results.length > 0 ? (
                <ul>
                  {validation.results.slice(0, 10).map((issue, index) => (
                    <li key={`${issue.code}-${issue.entityId ?? "none"}-${index}`}>
                      [{issue.severity}] {issue.code}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No issues.</p>
              )}
            </div>
          ) : (
            <p>No validation run loaded yet. Run validation to view results.</p>
          )}
        </section>

        <section className={styles.card}>
          <h2>Exports</h2>
          <div className={styles.inlineActions}>
            <form action={exportDetailsAction.bind(null, detailId)} data-testid="create-export-json-form">
              <input type="hidden" name="format" value="json" />
              <button type="submit" data-testid="create-json-export-submit">Create JSON export</button>
            </form>
            <form action={exportDetailsAction.bind(null, detailId)} data-testid="create-export-pdf-form">
              <input type="hidden" name="format" value="pdf" />
              <button type="submit">Create PDF export</button>
            </form>
            <form action={exportDetailsAction.bind(null, detailId)} data-testid="create-export-xlsx-form">
              <input type="hidden" name="format" value="xlsx" />
              <button type="submit">Create XLSX export</button>
            </form>
          </div>
          {hasPendingExports ? <p>Pending exports detected. Status auto-refresh is active.</p> : null}
          {exports.length === 0 ? <p>No exports yet.</p> : null}
          {exports.length > 0 ? (
            <ul className={styles.exportList} data-testid="details-export-list">
              {exports.map((artifact) => (
                <li key={artifact.id}>
                  <strong>{artifact.format}</strong> -{" "}
                  <span
                    className={
                      artifact.status === "failed"
                        ? styles.badgeFailed
                        : artifact.status === "completed"
                          ? styles.badgeCompleted
                          : styles.badgePending
                    }
                  >
                    {artifact.status}
                  </span>
                  {artifact.downloadUrl ? (
                    <>
                      {" "}
                      -{" "}
                      <a href={artifact.downloadUrl} target="_blank" rel="noreferrer">
                        open
                      </a>
                    </>
                  ) : null}
                  {artifact.errorMessage ? <> - {artifact.errorMessage}</> : null}
                  {artifact.failureKind ? <> ({artifact.failureKind})</> : null}
                  {typeof artifact.attemptCount === "number" && artifact.attemptCount > 0 ? (
                    <> - attempts {artifact.attemptCount}</>
                  ) : null}
                  {artifact.status === "failed" ? (
                    <form action={exportDetailsAction.bind(null, detailId)} className={styles.retryForm}>
                      <input type="hidden" name="format" value={artifact.format} />
                      <button type="submit">Retry export</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  );
}
