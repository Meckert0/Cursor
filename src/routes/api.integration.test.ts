import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildApp } from "../app.js";
import { PassthroughArtifactDownloadUrlResolver } from "../infra/storage/artifact-download-url-resolver.js";
import { MemoryAuthStore } from "../infra/auth/memory-auth-store.js";
import { FileArtifactStorage } from "../infra/storage/file-artifact-storage.js";
import { MemoryLockManager } from "../infra/locks/memory-lock-manager.js";
import { MemoryStore } from "../infra/store/memory-store.js";
import { ExportQueueService } from "../services/export-queue.js";
import XLSX from "xlsx";

process.env.ENABLE_LEGACY_HEADER_AUTH = "true";

function buildTestApp() {
  const store = new MemoryStore();
  const exportQueue = new ExportQueueService(store, new FileArtifactStorage(process.cwd()));
  return buildApp({
    store,
    authStore: new MemoryAuthStore(),
    lockManager: new MemoryLockManager(),
    exportQueue,
    artifactDownloadUrlResolver: new PassthroughArtifactDownloadUrlResolver()
  });
}

async function waitForExportCompletion(
  app: ReturnType<typeof buildApp>,
  exportId: string
): Promise<{ id: string; status: string; contentHash?: string; artifactUri?: string; downloadUrl?: string }> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/exports/${exportId}`
    });
    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      id: string;
      status: string;
      contentHash?: string;
      artifactUri?: string;
      downloadUrl?: string;
    };
    if (payload.status === "completed") {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Export ${exportId} did not complete in time.`);
}

function assertArtifactExtension(uri: string | undefined, extension: string) {
  assert.ok(uri);
  assert.ok(uri?.endsWith(`.${extension}`));
}

function readXlsxFromArtifactUri(uri: string): XLSX.WorkBook {
  const filePath = uri.replace("file://", "");
  const normalized = process.platform === "win32" ? filePath.replace(/^\/([A-Za-z]:\/)/, "$1") : filePath;
  return XLSX.readFile(path.normalize(normalized));
}

async function registerAdminAndGetCookie(app: ReturnType<typeof buildApp>): Promise<string> {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      username: "adminuser",
      email: "meckert@vpc.com",
      password: "pass1234!"
    }
  });
  assert.equal(registerResponse.statusCode, 201);
  const payload = registerResponse.json() as { sessionToken: string };
  return `cdt_session=${encodeURIComponent(payload.sessionToken)}`;
}

test("API flow: project -> design -> validation -> state transitions/audit -> submission -> lock/unlock", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Alpha", createdBy: "user-a" }
    });
    assert.equal(createProjectResponse.statusCode, 201);
    const project = createProjectResponse.json() as { id: string };

    const createDesignResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness A", createdBy: "user-a" }
    });
    assert.equal(createDesignResponse.statusCode, 201);
    const design = createDesignResponse.json() as { id: string; currentRevisionId: string };
    assert.ok(design.currentRevisionId);

    const listProjectDesignsResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${project.id}/designs`
    });
    assert.equal(listProjectDesignsResponse.statusCode, 200);
    const projectDesigns = listProjectDesignsResponse.json() as { items: Array<{ id: string }> };
    assert.ok(projectDesigns.items.some((item) => item.id === design.id));

    const revisionsResponse = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}/revisions`
    });
    assert.equal(revisionsResponse.statusCode, 200);
    const initialRevisions = revisionsResponse.json() as { items: Array<{ id: string; revisionNumber: number }> };
    assert.equal(initialRevisions.items.length, 1);
    assert.equal(initialRevisions.items[0].revisionNumber, 1);

    const ingestLibraryResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        items: [
          {
            id: "cmp-module-001",
            category: "module",
            family: "Micro-D",
            partNumber: "MDM-15P",
            description: "15-pin module",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          },
          {
            id: "cmp-wire-001",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-22",
            description: "22 AWG white wire",
            awg: "22",
            color: "white",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          },
          {
            id: "cmp-label-001",
            category: "label",
            family: "Heatshrink",
            partNumber: "LBL-22",
            description: "Wire label",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          },
          {
            id: "cmp-contact-001",
            category: "contact",
            family: "Micro-D",
            partNumber: "1",
            description: "Pin contact 1",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(ingestLibraryResponse.statusCode, 201);

    for (const componentId of ["cmp-module-001", "cmp-wire-001", "cmp-label-001", "cmp-contact-001"]) {
      const reviewResponse = await app.inject({
        method: "POST",
        url: `/v1/library/components/${componentId}/review`,
        payload: {}
      });
      assert.equal(reviewResponse.statusCode, 200);
    }

    const createRevisionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/revisions`,
      payload: {
        createdBy: "user-a",
        snapshot: {
          connectors: [
            {
              id: "c1",
              reference: "J1",
              partNumber: "MDM-15P",
              libraryComponentId: "cmp-module-001",
              pins: [{ id: "1", number: "1" }],
              location: { x: 120, y: 80 }
            },
            {
              id: "c2",
              reference: "J2",
              partNumber: "MDM-15P",
              libraryComponentId: "cmp-module-001",
              pins: [{ id: "1", number: "1" }],
              location: { x: 360, y: 180 }
            }
          ],
          junctions: [{ id: "j1", location: { x: 240, y: 130 }, label: "Splice-A", junctionType: "splice" }],
          paths: [
            {
              id: "p1",
              runNumber: 1,
              wireName: "wire1",
              fromConnectorId: "c1",
              toConnectorId: "c2",
              pathType: "wire",
              length: 2.5,
              sleeving: "expandable_sleeving",
              wireComponentId: "cmp-wire-001",
              fromContact: "1",
              fromSignalDescription: "Source signal",
              wireAwg: "22",
              wirePartNumber: "M22759/16-22",
              wireColor: "white",
              wireGroup: "Group A",
              toContact: "1",
              toSignalDescription: "Destination signal",
              labelPartNumber: "LBL-22",
              labelText: "WIRE-1",
              notes: "Harness note"
            }
          ],
          pinMappings: [
            {
              id: "m1",
              pathId: "p1",
              fromConnectorId: "c1",
              fromPinId: "1",
              toConnectorId: "c2",
              toPinId: "1",
              mappingType: "one_to_one"
            }
          ],
          bundles: [],
          annotations: []
        }
      }
    });
    assert.equal(createRevisionResponse.statusCode, 201);
    const revision = createRevisionResponse.json() as { id: string; revisionNumber: number };
    assert.equal(revision.revisionNumber, 2);

    const getRevisionResponse = await app.inject({
      method: "GET",
      url: `/v1/revisions/${revision.id}`
    });
    assert.equal(getRevisionResponse.statusCode, 200);
    const persistedRevision = getRevisionResponse.json() as {
      snapshot: {
        connectors: Array<{
          id: string;
          partNumber?: string;
          libraryComponentId?: string;
          location?: { x: number; y: number };
        }>;
        junctions?: Array<{ id: string; location: { x: number; y: number }; label?: string; junctionType?: string }>;
        paths: Array<{
          id: string;
          wireName?: string;
          length?: number;
          sleeving?: string;
          wireComponentId?: string;
        }>;
      };
    };
    const persistedC1 = persistedRevision.snapshot.connectors.find((connector) => connector.id === "c1");
    assert.deepEqual(persistedC1?.location, { x: 120, y: 80 });
    assert.equal(persistedC1?.partNumber, "MDM-15P");
    assert.equal(persistedC1?.libraryComponentId, "cmp-module-001");
    assert.equal(persistedRevision.snapshot.junctions?.[0]?.id, "j1");
    assert.deepEqual(persistedRevision.snapshot.junctions?.[0]?.location, { x: 240, y: 130 });
    assert.equal(persistedRevision.snapshot.junctions?.[0]?.junctionType, "splice");
    assert.equal(persistedRevision.snapshot.paths[0]?.wireName, "wire1");
    assert.equal(persistedRevision.snapshot.paths[0]?.length, 2.5);
    assert.equal(persistedRevision.snapshot.paths[0]?.sleeving, "expandable_sleeving");
    assert.equal(persistedRevision.snapshot.paths[0]?.wireComponentId, "cmp-wire-001");

    const bomResponse = await app.inject({
      method: "GET",
      url: `/v1/revisions/${revision.id}/bom`
    });
    assert.equal(bomResponse.statusCode, 200);
    const bom = bomResponse.json() as {
      revisionId: string;
      summary: { totalLines: number; resolved: number; unresolved: number };
      lines: Array<{ category: string; partNumber: string; quantity: number; resolution: string }>;
    };
    assert.equal(bom.revisionId, revision.id);
    assert.equal(bom.summary.unresolved, 0);
    assert.ok(bom.lines.some((line) => line.category === "module" && line.partNumber === "MDM-15P" && line.quantity === 2));
    assert.ok(bom.lines.some((line) => line.category === "wire" && line.partNumber === "M22759/16-22"));
    assert.ok(bom.lines.some((line) => line.category === "label" && line.partNumber === "LBL-22"));

    const validateResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.03" }
    });
    assert.equal(validateResponse.statusCode, 200);
    const validation = validateResponse.json() as {
      validationRunId: string;
      summary: { errors: number; warnings: number; infos: number };
      results: Array<{ code: string }>;
    };
    assert.deepEqual(validation.summary, { errors: 0, warnings: 0, infos: 0 });
    assert.ok(validation.validationRunId);

    const getValidationResponse = await app.inject({
      method: "GET",
      url: `/v1/validations/${validation.validationRunId}`
    });
    assert.equal(getValidationResponse.statusCode, 200);
    const persistedValidation = getValidationResponse.json() as {
      id: string;
      revisionId: string;
      rulesetVersion: string;
      summary: { errors: number; warnings: number; infos: number };
      results: Array<{ code: string }>;
    };
    assert.equal(persistedValidation.id, validation.validationRunId);
    assert.equal(persistedValidation.revisionId, revision.id);
    assert.equal(persistedValidation.rulesetVersion, "rules-2026.03");
    assert.deepEqual(persistedValidation.summary, validation.summary);
    assert.deepEqual(persistedValidation.results, validation.results);

    const secondValidateResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.03" }
    });
    assert.equal(secondValidateResponse.statusCode, 200);
    const secondValidation = secondValidateResponse.json() as {
      validationRunId: string;
      summary: { errors: number; warnings: number; infos: number };
      results: Array<{ code: string }>;
    };
    assert.notEqual(secondValidation.validationRunId, validation.validationRunId);
    assert.deepEqual(secondValidation.summary, validation.summary);
    assert.deepEqual(secondValidation.results, validation.results);

    const firstExportResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/exports`,
      payload: { format: "json" }
    });
    assert.equal(firstExportResponse.statusCode, 202);
    const firstExport = firstExportResponse.json() as {
      id: string;
      revisionId: string;
      format: string;
      status: string;
    };
    assert.equal(firstExport.revisionId, revision.id);
    assert.equal(firstExport.format, "json");
    assert.equal(firstExport.status, "queued");
    const firstCompleted = await waitForExportCompletion(app, firstExport.id);
    assert.ok(firstCompleted.contentHash);
    assert.ok(firstCompleted.artifactUri);
    assert.equal(firstCompleted.downloadUrl, firstCompleted.artifactUri);

    const secondExportResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/exports`,
      payload: { format: "json" }
    });
    assert.equal(secondExportResponse.statusCode, 202);
    const secondExport = secondExportResponse.json() as {
      id: string;
      status: string;
    };
    assert.equal(secondExport.status, "queued");
    const secondCompleted = await waitForExportCompletion(app, secondExport.id);
    assert.notEqual(secondExport.id, firstExport.id);
    assert.equal(secondCompleted.contentHash, firstCompleted.contentHash);
    assert.notEqual(secondCompleted.artifactUri, firstCompleted.artifactUri);

    const getExportResponse = await app.inject({
      method: "GET",
      url: `/v1/exports/${firstExport.id}`
    });
    assert.equal(getExportResponse.statusCode, 200);
    const fetchedExport = getExportResponse.json() as {
      id: string;
      status: string;
      contentHash?: string;
      artifactUri?: string;
      downloadUrl?: string;
    };
    assert.equal(fetchedExport.id, firstExport.id);
    assert.equal(fetchedExport.status, "completed");
    assert.equal(fetchedExport.contentHash, firstCompleted.contentHash);
    assert.equal(fetchedExport.downloadUrl, fetchedExport.artifactUri);

    const listExportsResponse = await app.inject({
      method: "GET",
      url: `/v1/revisions/${revision.id}/exports`
    });
    assert.equal(listExportsResponse.statusCode, 200);
    const exportsList = listExportsResponse.json() as { items: Array<{ id: string; status: string; contentHash?: string }> };
    assert.ok(exportsList.items.some((item) => item.id === firstExport.id));
    assert.ok(exportsList.items.some((item) => item.id === secondExport.id));

    const pdfExportResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/exports`,
      payload: { format: "pdf" }
    });
    assert.equal(pdfExportResponse.statusCode, 202);
    const pdfExport = pdfExportResponse.json() as { id: string; format: string };
    assert.equal(pdfExport.format, "pdf");
    const pdfCompleted = await waitForExportCompletion(app, pdfExport.id);
    assertArtifactExtension(pdfCompleted.artifactUri, "pdf");
    assert.ok(pdfCompleted.contentHash);

    const secondPdfExportResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/exports`,
      payload: { format: "pdf" }
    });
    assert.equal(secondPdfExportResponse.statusCode, 202);
    const secondPdfExport = secondPdfExportResponse.json() as { id: string; format: string };
    assert.equal(secondPdfExport.format, "pdf");
    const secondPdfCompleted = await waitForExportCompletion(app, secondPdfExport.id);
    assert.equal(secondPdfCompleted.contentHash, pdfCompleted.contentHash);
    assert.notEqual(secondPdfCompleted.artifactUri, pdfCompleted.artifactUri);

    const xlsxExportResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/exports`,
      payload: { format: "xlsx" }
    });
    assert.equal(xlsxExportResponse.statusCode, 202);
    const xlsxExport = xlsxExportResponse.json() as { id: string; format: string };
    assert.equal(xlsxExport.format, "xlsx");
    const xlsxCompleted = await waitForExportCompletion(app, xlsxExport.id);
    assertArtifactExtension(xlsxCompleted.artifactUri, "xlsx");
    assert.ok(xlsxCompleted.contentHash);
    assert.ok(xlsxCompleted.artifactUri);

    const workbook = readXlsxFromArtifactUri(xlsxCompleted.artifactUri!);
    const wirelistSheet = workbook.Sheets.Wirelist;
    assert.ok(wirelistSheet);
    const headerRow = XLSX.utils.sheet_to_json<string[]>(wirelistSheet, {
      header: 1,
      range: 0,
      blankrows: false
    })[0];
    assert.deepEqual(headerRow, [
      "Run #",
      "From Location (Conn - Pin)",
      "From Contact",
      "From Signal Desc",
      "Wire AWG",
      "Wire/Patchcord P/N",
      "Length (in)",
      "Wire Color",
      "Wire Group",
      "To Location (Conn-Pin)",
      "To Contact",
      "To Signal Desc",
      "Label P/N",
      "Label Text",
      "Notes"
    ]);
    const firstDataRow = XLSX.utils.sheet_to_json<string[]>(wirelistSheet, {
      header: 1,
      range: 1,
      blankrows: false
    })[0];
    assert.equal(firstDataRow?.[0], 1);
    assert.equal(firstDataRow?.[1], "J1 - 1");
    assert.equal(firstDataRow?.[5], "M22759/16-22");
    assert.equal(firstDataRow?.[9], "J2 - 1");
    assert.equal(firstDataRow?.[14], "Harness note");

    const bomSheet = workbook.Sheets.BOM;
    assert.ok(bomSheet);
    const bomHeaderRow = XLSX.utils.sheet_to_json<string[]>(bomSheet, {
      header: 1,
      range: 0,
      blankrows: false
    })[0];
    assert.deepEqual(bomHeaderRow, ["Item", "Category", "Part Number", "Description", "Qty", "Unit", "Status", "Used By"]);
    const bomRows = XLSX.utils.sheet_to_json<Array<string | number>>(bomSheet, {
      header: 1,
      blankrows: false
    });
    assert.ok(bomRows.length > 1);
    assert.ok(bomRows.some((row) => row?.[2] === "MDM-15P"));
    assert.ok(bomRows.some((row) => row?.[2] === "M22759/16-22"));

    const secondXlsxExportResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/exports`,
      payload: { format: "xlsx" }
    });
    assert.equal(secondXlsxExportResponse.statusCode, 202);
    const secondXlsxExport = secondXlsxExportResponse.json() as { id: string; format: string };
    assert.equal(secondXlsxExport.format, "xlsx");
    const secondXlsxCompleted = await waitForExportCompletion(app, secondXlsxExport.id);
    assert.equal(secondXlsxCompleted.contentHash, xlsxCompleted.contentHash);
    assert.notEqual(secondXlsxCompleted.artifactUri, xlsxCompleted.artifactUri);

    const transitionToSubmittedResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/state-transitions`,
      payload: {
        targetState: "submitted",
        expectedCurrentState: "draft",
        changedBy: "user-a",
        comment: "Validation clean, submit for workflow."
      }
    });
    assert.equal(transitionToSubmittedResponse.statusCode, 200);
    const transitionToSubmitted = transitionToSubmittedResponse.json() as {
      design: { status: string };
      stateChanged: boolean;
      auditEventId: string;
    };
    assert.equal(transitionToSubmitted.design.status, "submitted");
    assert.equal(transitionToSubmitted.stateChanged, true);
    assert.ok(transitionToSubmitted.auditEventId);

    const transitionToReviewResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/state-transitions`,
      payload: {
        targetState: "in_review",
        expectedCurrentState: "submitted",
        changedBy: "reviewer-1"
      }
    });
    assert.equal(transitionToReviewResponse.statusCode, 200);
    const transitionToReview = transitionToReviewResponse.json() as { design: { status: string } };
    assert.equal(transitionToReview.design.status, "in_review");

    const invalidTransitionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/state-transitions`,
      payload: {
        targetState: "released",
        expectedCurrentState: "in_review",
        changedBy: "reviewer-1"
      }
    });
    assert.equal(invalidTransitionResponse.statusCode, 400);

    const auditEventsResponse = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}/audit-events`
    });
    assert.equal(auditEventsResponse.statusCode, 200);
    const auditEvents = auditEventsResponse.json() as {
      items: Array<{ id: string; eventType: string; payload: { fromState: string; toState: string } }>;
    };
    assert.ok(auditEvents.items.length >= 2);
    assert.ok(auditEvents.items.some((event) => event.eventType === "design.state.changed"));
    assert.ok(
      auditEvents.items.some((event) => event.payload.fromState === "draft" && event.payload.toState === "submitted")
    );

    const submitResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/submit-for-quote`,
      payload: { revisionId: revision.id, message: "Ready for quote.", idempotencyKey: "submit-key-1" }
    });
    assert.equal(submitResponse.statusCode, 201);
    const submission = submitResponse.json() as {
      id: string;
      status: string;
      revisionId: string;
      validationRunId: string;
      estimatedResponseHours: number;
    };
    assert.ok(submission.id);
    assert.equal(submission.status, "received");
    assert.equal(submission.revisionId, revision.id);
    assert.equal(submission.validationRunId, secondValidation.validationRunId);
    assert.equal(submission.estimatedResponseHours, 24);

    const duplicateSubmitResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/submit-for-quote`,
      payload: { revisionId: revision.id, idempotencyKey: "submit-key-1" }
    });
    assert.equal(duplicateSubmitResponse.statusCode, 200);
    const duplicateSubmission = duplicateSubmitResponse.json() as { id: string };
    assert.equal(duplicateSubmission.id, submission.id);

    const getSubmissionResponse = await app.inject({
      method: "GET",
      url: `/v1/submissions/${submission.id}`
    });
    assert.equal(getSubmissionResponse.statusCode, 200);
    const persistedSubmission = getSubmissionResponse.json() as {
      id: string;
      designId: string;
      revisionId: string;
      validationRunId: string;
    };
    assert.equal(persistedSubmission.id, submission.id);
    assert.equal(persistedSubmission.designId, design.id);
    assert.equal(persistedSubmission.revisionId, revision.id);
    assert.equal(persistedSubmission.validationRunId, secondValidation.validationRunId);

    const listSubmissionsResponse = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}/submissions`
    });
    assert.equal(listSubmissionsResponse.statusCode, 200);
    const submissions = listSubmissionsResponse.json() as { items: Array<{ id: string }> };
    assert.ok(submissions.items.some((item) => item.id === submission.id));

    const addUserAMember = await app.inject({
      method: "PUT",
      url: `/v1/projects/${project.id}/members/user-a`,
      payload: { role: "owner" }
    });
    assert.equal(addUserAMember.statusCode, 200);
    const addUserBMember = await app.inject({
      method: "PUT",
      url: `/v1/projects/${project.id}/members/user-b`,
      payload: { role: "owner" }
    });
    assert.equal(addUserBMember.statusCode, 200);

    const lockResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/lock`,
      headers: {
        "x-user-id": "user-a",
        "x-role": "owner"
      },
      payload: { ttlSeconds: 300 }
    });
    assert.equal(lockResponse.statusCode, 201);

    const conflictingLockResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/lock`,
      headers: {
        "x-user-id": "user-b",
        "x-role": "owner"
      },
      payload: { ttlSeconds: 300 }
    });
    assert.equal(conflictingLockResponse.statusCode, 409);

    const unlockResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/unlock`,
      headers: {
        "x-user-id": "user-a",
        "x-role": "owner"
      },
      payload: {}
    });
    assert.equal(unlockResponse.statusCode, 204);
  } finally {
    await app.close();
  }
});

test("revision snapshot patch updates wirelist data", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Wirelist", createdBy: "user-a" }
    });
    assert.equal(createProjectResponse.statusCode, 201);
    const project = createProjectResponse.json() as { id: string };

    const createDesignResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness Wirelist", createdBy: "user-a" }
    });
    assert.equal(createDesignResponse.statusCode, 201);
    const design = createDesignResponse.json() as { id: string; currentRevisionId: string };

    const createRevisionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/revisions`,
      payload: {
        createdBy: "user-a",
        snapshot: {
          connectors: [
            { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
            { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
          ],
          paths: [
            {
              id: "p1",
              wireName: "wire1",
              fromConnectorId: "c1",
              toConnectorId: "c2",
              pathType: "wire",
              length: 10
            }
          ],
          pinMappings: [],
          bundles: [],
          annotations: []
        }
      }
    });
    assert.equal(createRevisionResponse.statusCode, 201);
    const revision = createRevisionResponse.json() as { id: string };

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/revisions/${revision.id}/snapshot`,
      payload: {
        snapshot: {
          connectors: [
            { id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] },
            { id: "c2", reference: "J2", pins: [{ id: "1", number: "1" }] }
          ],
          paths: [
            {
              id: "p1",
              wireName: "wireA",
              fromConnectorId: "c1",
              toConnectorId: "c2",
              pathType: "wire",
              length: 12.5,
              sleeving: "expandable_sleeving",
              wireComponentId: "cmp-wire-001"
            }
          ],
          pinMappings: [],
          bundles: [],
          annotations: []
        }
      }
    });
    assert.equal(patchResponse.statusCode, 200);
    const patched = patchResponse.json() as {
      snapshot: {
        paths: Array<{ wireName?: string; length?: number; sleeving?: string; wireComponentId?: string }>;
      };
    };
    assert.equal(patched.snapshot.paths[0]?.wireName, "wireA");
    assert.equal(patched.snapshot.paths[0]?.length, 12.5);
    assert.equal(patched.snapshot.paths[0]?.sleeving, "expandable_sleeving");
    assert.equal(patched.snapshot.paths[0]?.wireComponentId, "cmp-wire-001");
  } finally {
    await app.close();
  }
});

test("submit-for-quote enforces latest validation pass precondition", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Beta", createdBy: "user-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const designResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness B", createdBy: "user-a" }
    });
    assert.equal(designResponse.statusCode, 201);
    const design = designResponse.json() as { id: string };

    const invalidRevisionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/revisions`,
      payload: {
        createdBy: "user-a",
        snapshot: {
          connectors: [{ id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] }],
          paths: [{ id: "p1", fromConnectorId: "c1", toConnectorId: "missing", pathType: "wire" }],
          pinMappings: [],
          bundles: [],
          annotations: []
        }
      }
    });
    assert.equal(invalidRevisionResponse.statusCode, 201);
    const invalidRevision = invalidRevisionResponse.json() as { id: string };

    const submitWithoutValidation = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/submit-for-quote`,
      payload: { revisionId: invalidRevision.id }
    });
    assert.equal(submitWithoutValidation.statusCode, 409);

    const validateInvalidRevision = await app.inject({
      method: "POST",
      url: `/v1/revisions/${invalidRevision.id}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.03" }
    });
    assert.equal(validateInvalidRevision.statusCode, 200);
    const invalidValidation = validateInvalidRevision.json() as { summary: { errors: number } };
    assert.ok(invalidValidation.summary.errors > 0);

    const submitWithFailingValidation = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/submit-for-quote`,
      payload: { revisionId: invalidRevision.id }
    });
    assert.equal(submitWithFailingValidation.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("submit-for-quote rejects stale validation after snapshot edit", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Stale Validation", createdBy: "user-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const designResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness Stale", createdBy: "user-a" }
    });
    assert.equal(designResponse.statusCode, 201);
    const design = designResponse.json() as { id: string };

    const validSnapshot = {
      connectors: [
        {
          id: "c1",
          reference: "J1",
          pins: [
            { id: "1", number: "1" },
            { id: "2", number: "2" }
          ]
        },
        {
          id: "c2",
          reference: "J2",
          pins: [
            { id: "1", number: "1" },
            { id: "2", number: "2" }
          ]
        }
      ],
      paths: [{ id: "p1", fromConnectorId: "c1", toConnectorId: "c2", pathType: "wire" }],
      pinMappings: [
        {
          id: "m1",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "1",
          toConnectorId: "c2",
          toPinId: "1",
          mappingType: "one_to_one"
        },
        {
          id: "m2",
          pathId: "p1",
          fromConnectorId: "c1",
          fromPinId: "2",
          toConnectorId: "c2",
          toPinId: "2",
          mappingType: "one_to_one"
        }
      ],
      bundles: [{ id: "b1", name: "main-bundle", pathIds: ["p1"] }],
      annotations: []
    };

    const revisionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/revisions`,
      payload: {
        createdBy: "user-a",
        snapshot: validSnapshot
      }
    });
    assert.equal(revisionResponse.statusCode, 201);
    const revision = revisionResponse.json() as { id: string };

    const validateResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.03" }
    });
    assert.equal(validateResponse.statusCode, 200);
    const validation = validateResponse.json() as { summary: { errors: number } };
    assert.equal(validation.summary.errors, 0);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/revisions/${revision.id}/snapshot`,
      payload: {
        snapshot: {
          ...validSnapshot,
          annotations: [{ id: "a1", text: "edited after validation" }]
        }
      }
    });
    assert.equal(patchResponse.statusCode, 200);

    const staleSubmitResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/submit-for-quote`,
      payload: { revisionId: revision.id }
    });
    assert.equal(staleSubmitResponse.statusCode, 409);
    assert.match(staleSubmitResponse.json().message, /stale/i);

    const staleTransitionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/state-transitions`,
      payload: { targetState: "submitted", expectedCurrentState: "draft", changedBy: "user-a" }
    });
    assert.equal(staleTransitionResponse.statusCode, 409);
    assert.match(staleTransitionResponse.json().message, /stale/i);

    const revalidateResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${revision.id}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.03" }
    });
    assert.equal(revalidateResponse.statusCode, 200);
    assert.equal((revalidateResponse.json() as { summary: { errors: number } }).summary.errors, 0);

    const submitAfterRevalidate = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/submit-for-quote`,
      payload: { revisionId: revision.id }
    });
    assert.equal(submitAfterRevalidate.statusCode, 201);
  } finally {
    await app.close();
  }
});

test("state transition to submitted requires clean latest validation", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Gamma", createdBy: "user-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const designResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness C", createdBy: "user-a" }
    });
    assert.equal(designResponse.statusCode, 201);
    const design = designResponse.json() as { id: string };

    const transitionWithoutValidation = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/state-transitions`,
      payload: { targetState: "submitted", expectedCurrentState: "draft", changedBy: "user-a" }
    });
    assert.equal(transitionWithoutValidation.statusCode, 409);

    const invalidRevisionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/revisions`,
      payload: {
        createdBy: "user-a",
        snapshot: {
          connectors: [{ id: "c1", reference: "J1", pins: [{ id: "1", number: "1" }] }],
          paths: [{ id: "p1", fromConnectorId: "c1", toConnectorId: "missing", pathType: "wire" }],
          pinMappings: [],
          bundles: [],
          annotations: []
        }
      }
    });
    assert.equal(invalidRevisionResponse.statusCode, 201);
    const invalidRevision = invalidRevisionResponse.json() as { id: string };

    const validateInvalidRevision = await app.inject({
      method: "POST",
      url: `/v1/revisions/${invalidRevision.id}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.03" }
    });
    assert.equal(validateInvalidRevision.statusCode, 200);

    const transitionWithFailingValidation = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/state-transitions`,
      payload: { targetState: "submitted", expectedCurrentState: "draft", changedBy: "user-a" }
    });
    assert.equal(transitionWithFailingValidation.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("rbac forbids viewer from edit operations", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Delta", createdBy: "user-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const designResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness D", createdBy: "user-a" }
    });
    assert.equal(designResponse.statusCode, 201);
    const design = designResponse.json() as { id: string };

    const viewerLockAttempt = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/lock`,
      headers: { "x-role": "viewer" },
      payload: { userId: "viewer-user", ttlSeconds: 300 }
    });
    assert.equal(viewerLockAttempt.statusCode, 403);

    const viewerReadDesign = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}`,
      headers: { "x-role": "viewer" }
    });
    assert.equal(viewerReadDesign.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("active ruleset policy is used when validation omits ruleset version", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const setRulesetResponse = await app.inject({
      method: "PUT",
      url: "/v1/rulesets/rules-2026.04",
      payload: { isActive: true, notes: "New active ruleset." }
    });
    assert.equal(setRulesetResponse.statusCode, 200);

    const activeRulesetResponse = await app.inject({
      method: "GET",
      url: "/v1/rulesets/active"
    });
    assert.equal(activeRulesetResponse.statusCode, 200);
    const active = activeRulesetResponse.json() as { version: string; isActive: boolean };
    assert.equal(active.version, "rules-2026.04");
    assert.equal(active.isActive, true);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Epsilon", createdBy: "user-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const designResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness E", createdBy: "user-a" }
    });
    assert.equal(designResponse.statusCode, 201);
    const design = designResponse.json() as { currentRevisionId: string };

    const validateResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${design.currentRevisionId}/validate`,
      payload: { mode: "full" }
    });
    assert.equal(validateResponse.statusCode, 200);
    const validation = validateResponse.json() as { rulesetVersion: string };
    assert.equal(validation.rulesetVersion, "rules-2026.04");

    const viewerSetRulesetAttempt = await app.inject({
      method: "PUT",
      url: "/v1/rulesets/rules-2026.05",
      headers: { "x-role": "viewer" },
      payload: { isActive: true }
    });
    assert.equal(viewerSetRulesetAttempt.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("project ruleset policy enforces allowed/default rulesets", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const setActiveRulesetResponse = await app.inject({
      method: "PUT",
      url: "/v1/rulesets/rules-2026.04",
      payload: { isActive: true }
    });
    assert.equal(setActiveRulesetResponse.statusCode, 200);

    const setSecondaryRulesetResponse = await app.inject({
      method: "PUT",
      url: "/v1/rulesets/rules-2026.05",
      payload: { isActive: false }
    });
    assert.equal(setSecondaryRulesetResponse.statusCode, 200);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Zeta", createdBy: "user-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const upsertPolicyResponse = await app.inject({
      method: "PUT",
      url: `/v1/projects/${project.id}/ruleset-policy`,
      payload: {
        defaultRulesetVersion: "rules-2026.05",
        allowedRulesetVersions: ["rules-2026.05"]
      }
    });
    assert.equal(upsertPolicyResponse.statusCode, 200);

    const getPolicyResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${project.id}/ruleset-policy`
    });
    assert.equal(getPolicyResponse.statusCode, 200);
    const policy = getPolicyResponse.json() as { defaultRulesetVersion?: string; allowedRulesetVersions: string[] };
    assert.equal(policy.defaultRulesetVersion, "rules-2026.05");
    assert.deepEqual(policy.allowedRulesetVersions, ["rules-2026.05"]);

    const createDesignResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness F", createdBy: "user-a" }
    });
    assert.equal(createDesignResponse.statusCode, 201);
    const design = createDesignResponse.json() as { id: string; currentRevisionId: string };

    const initialRevisionResponse = await app.inject({
      method: "GET",
      url: `/v1/revisions/${design.currentRevisionId}`
    });
    assert.equal(initialRevisionResponse.statusCode, 200);
    const initialRevision = initialRevisionResponse.json() as { rulesetVersion: string };
    assert.equal(initialRevision.rulesetVersion, "rules-2026.05");

    const validateDefaultRulesetResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${design.currentRevisionId}/validate`,
      payload: { mode: "full" }
    });
    assert.equal(validateDefaultRulesetResponse.statusCode, 200);
    const defaultValidation = validateDefaultRulesetResponse.json() as { rulesetVersion: string };
    assert.equal(defaultValidation.rulesetVersion, "rules-2026.05");

    const validateDisallowedRulesetResponse = await app.inject({
      method: "POST",
      url: `/v1/revisions/${design.currentRevisionId}/validate`,
      payload: { mode: "full", rulesetVersion: "rules-2026.04" }
    });
    assert.equal(validateDisallowedRulesetResponse.statusCode, 409);

    const createDisallowedRevisionResponse = await app.inject({
      method: "POST",
      url: `/v1/designs/${design.id}/revisions`,
      payload: {
        createdBy: "user-a",
        rulesetVersion: "rules-2026.04",
        snapshot: {
          connectors: [],
          paths: [],
          pinMappings: [],
          bundles: [],
          annotations: []
        }
      }
    });
    assert.equal(createDisallowedRevisionResponse.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("project membership is required beyond global role", async () => {
  const app = buildTestApp();

  await app.ready();
  try {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { name: "Project Theta", createdBy: "owner-a" }
    });
    assert.equal(projectResponse.statusCode, 201);
    const project = projectResponse.json() as { id: string };

    const designResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      payload: { name: "Harness G", createdBy: "owner-a" }
    });
    assert.equal(designResponse.statusCode, 201);
    const design = designResponse.json() as { id: string };

    const nonMemberReadAttempt = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}`,
      headers: { "x-user-id": "outside-user", "x-role": "owner" }
    });
    assert.equal(nonMemberReadAttempt.statusCode, 403);

    const addMemberAttempt = await app.inject({
      method: "PUT",
      url: `/v1/projects/${project.id}/members/outside-user`,
      payload: { role: "viewer" }
    });
    assert.equal(addMemberAttempt.statusCode, 200);

    const memberReadAttempt = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}`,
      headers: { "x-user-id": "outside-user", "x-role": "viewer" }
    });
    assert.equal(memberReadAttempt.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("project can be renamed and deleted with cascade", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { "x-role": "owner", "x-user-id": "user-a" },
      payload: { name: "Project Rename Target", createdBy: "user-a" }
    });
    assert.equal(createProjectResponse.statusCode, 201);
    const project = createProjectResponse.json() as { id: string };

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${project.id}`,
      headers: { "x-role": "owner", "x-user-id": "user-a" },
      payload: { name: "Project Renamed" }
    });
    assert.equal(renameResponse.statusCode, 200);
    const renamedProject = renameResponse.json() as { id: string; name: string };
    assert.equal(renamedProject.id, project.id);
    assert.equal(renamedProject.name, "Project Renamed");

    const createDesignResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/designs`,
      headers: { "x-role": "owner", "x-user-id": "user-a" },
      payload: { name: "Design To Delete", createdBy: "user-a" }
    });
    assert.equal(createDesignResponse.statusCode, 201);
    const design = createDesignResponse.json() as { id: string };

    const deleteAsEditorResponse = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${project.id}`,
      headers: { "x-role": "editor", "x-user-id": "user-a" }
    });
    assert.equal(deleteAsEditorResponse.statusCode, 403);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${project.id}`,
      headers: { "x-role": "owner", "x-user-id": "user-a" }
    });
    assert.equal(deleteResponse.statusCode, 204);

    const listProjectsResponse = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: { "x-role": "owner", "x-user-id": "user-a" }
    });
    assert.equal(listProjectsResponse.statusCode, 200);
    const listProjectsPayload = listProjectsResponse.json() as { items: Array<{ id: string }> };
    assert.ok(!listProjectsPayload.items.some((item) => item.id === project.id));

    const deletedDesignResponse = await app.inject({
      method: "GET",
      url: `/v1/designs/${design.id}`,
      headers: { "x-role": "owner", "x-user-id": "user-a" }
    });
    assert.equal(deletedDesignResponse.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("harness can be deleted by owner only", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: { "x-role": "owner", "x-user-id": "user-a" },
      payload: { name: "Project Harness Delete", createdBy: "user-a" }
    });
    assert.equal(createProjectResponse.statusCode, 201);
    const project = createProjectResponse.json() as { id: string };

    const createHarnessResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${project.id}/harnesses`,
      headers: { "x-role": "owner", "x-user-id": "user-a" },
      payload: { name: "Harness To Delete" }
    });
    assert.equal(createHarnessResponse.statusCode, 201);
    const harness = createHarnessResponse.json() as { id: string };

    const deleteAsEditor = await app.inject({
      method: "DELETE",
      url: `/v1/harnesses/${harness.id}`,
      headers: { "x-role": "editor", "x-user-id": "user-a" }
    });
    assert.equal(deleteAsEditor.statusCode, 403);

    const deleteAsOwner = await app.inject({
      method: "DELETE",
      url: `/v1/harnesses/${harness.id}`,
      headers: { "x-role": "owner", "x-user-id": "user-a" }
    });
    assert.equal(deleteAsOwner.statusCode, 204);

    const getDeletedHarness = await app.inject({
      method: "GET",
      url: `/v1/harnesses/${harness.id}`,
      headers: { "x-role": "owner", "x-user-id": "user-a" }
    });
    assert.equal(getDeletedHarness.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("library catalog endpoints support search and filters", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const listAllResponse = await app.inject({
      method: "GET",
      url: "/v1/library/components"
    });
    assert.equal(listAllResponse.statusCode, 200);

    const createContactForFilter = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        items: [
          {
            id: "cmp-contact-filter-001",
            category: "contact",
            family: "Micro-D",
            partNumber: "MDM-CONTACT-001",
            description: "Contact filter item",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(createContactForFilter.statusCode, 201);

    const filteredResponse = await app.inject({
      method: "GET",
      url: "/v1/library/components?category=contact&isActive=true&stockStatus=in_stock"
    });
    assert.equal(filteredResponse.statusCode, 200);
    const filtered = filteredResponse.json() as {
      items: Array<{ id: string; category: string; isActive: boolean; stockStatus: string }>;
    };
    assert.ok(filtered.items.length >= 1);
    assert.ok(filtered.items.every((item) => item.category === "contact"));
    assert.ok(filtered.items.every((item) => item.isActive));
    assert.ok(filtered.items.every((item) => item.stockStatus === "in_stock"));

    const createWireForFilter = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        items: [
          {
            id: "cmp-wire-filter-001",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-20-F",
            description: "20 AWG white filter wire",
            awg: "20",
            color: "white",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(createWireForFilter.statusCode, 201);

    const wireFilteredResponse = await app.inject({
      method: "GET",
      url: "/v1/library/components?category=wire&awg=20&color=white"
    });
    assert.equal(wireFilteredResponse.statusCode, 200);
    const wireFiltered = wireFilteredResponse.json() as {
      items: Array<{ category: string; awg?: string; color?: string }>;
    };
    assert.ok(wireFiltered.items.length >= 1);
    assert.ok(wireFiltered.items.every((item) => item.category === "wire"));
    assert.ok(wireFiltered.items.every((item) => item.awg === "20"));
    assert.ok(wireFiltered.items.every((item) => item.color === "white"));

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/library/components/${filtered.items[0].id}`
    });
    assert.equal(detailResponse.statusCode, 200);

    const missingResponse = await app.inject({
      method: "GET",
      url: "/v1/library/components/does-not-exist"
    });
    assert.equal(missingResponse.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("library ingest rejects wire rows missing awg/color", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const missingAwg = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        items: [
          {
            id: "cmp-wire-missing-awg",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-30",
            description: "missing awg",
            color: "white",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(missingAwg.statusCode, 400);

    const missingColor = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        items: [
          {
            id: "cmp-wire-missing-color",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-31",
            description: "missing color",
            awg: "22",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(missingColor.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("library ingest supports dry-run and commit with owner role", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const dryRunResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest/dry-run",
      payload: {
        idempotencyKey: "lib-import-001",
        items: [
          {
            category: "contact",
            family: "Micro-D",
            partNumber: "MDM-15P",
            description: "15-pin Micro-D plug connector",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: ["Use plated contacts for marine environments"],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(dryRunResponse.statusCode, 200);
    const dryRun = dryRunResponse.json() as {
      dryRun: boolean;
      summary: { received: number; accepted: number; rejected: number; committed: number };
      results: Array<{ status: string }>;
    };
    assert.equal(dryRun.dryRun, true);
    assert.deepEqual(dryRun.summary, { received: 1, accepted: 1, rejected: 0, committed: 0 });
    assert.equal(dryRun.results[0]?.status, "accepted");

    const commitResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        idempotencyKey: "lib-commit-001",
        items: [
          {
            id: "cmp-conn-099",
            category: "contact",
            family: "Micro-D",
            partNumber: "MDM-15P",
            description: "15-pin Micro-D plug connector",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: ["Use plated contacts for marine environments"],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(commitResponse.statusCode, 201);
    const commit = commitResponse.json() as {
      jobId: string;
      dryRun: boolean;
      summary: { received: number; accepted: number; rejected: number; committed: number };
      results: Array<{ status: string; componentId?: string }>;
    };
    assert.equal(commit.dryRun, false);
    assert.deepEqual(commit.summary, { received: 1, accepted: 1, rejected: 0, committed: 1 });
    assert.equal(commit.results[0]?.status, "committed");
    assert.equal(commit.results[0]?.componentId, "cmp-conn-099");

    const replayResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        idempotencyKey: "lib-commit-001",
        items: [
          {
            id: "cmp-conn-099",
            category: "contact",
            family: "Micro-D",
            partNumber: "MDM-15P",
            description: "15-pin Micro-D plug connector",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: ["Use plated contacts for marine environments"],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(replayResponse.statusCode, 201);
    const replay = replayResponse.json() as {
      jobId: string;
      summary: { received: number; accepted: number; rejected: number; committed: number };
      results: Array<{ status: string; componentId?: string }>;
    };
    assert.equal(replay.jobId, commit.jobId);
    assert.deepEqual(replay.summary, commit.summary);
    assert.equal(replay.results[0]?.status, "committed");
  } finally {
    await app.close();
  }
});

test("library review endpoints update review state with owner role", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      payload: {
        items: [
          {
            id: "cmp-wire-099",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-22",
            description: "22 AWG lightweight hookup wire",
            awg: "22",
            color: "white",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const reviewResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/cmp-wire-099/review",
      payload: {
        reviewedByUserId: "qa-reviewer",
        reviewedAt: "2026-03-27T12:00:00.000Z"
      }
    });
    assert.equal(reviewResponse.statusCode, 200);

    const unreviewResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/cmp-wire-099/unreview",
      payload: {}
    });
    assert.equal(unreviewResponse.statusCode, 200);

    const forbiddenResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/cmp-wire-099/review",
      headers: { "x-role": "editor" },
      payload: {}
    });
    assert.equal(forbiddenResponse.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("library visibility enforces reviewed/public and unreviewed/private policy", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const ingestByEditor = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { "x-role": "editor", "x-user-id": "editor-a" },
      payload: {
        items: [
          {
            id: "cmp-wire-private-1",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-24",
            description: "24 AWG private draft wire",
            awg: "24",
            color: "blue",
            isActive: true,
            stockStatus: "low_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(ingestByEditor.statusCode, 201);

    const ownerCannotSeeUnreviewed = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: { "x-role": "owner", "x-user-id": "owner-a" }
    });
    assert.equal(ownerCannotSeeUnreviewed.statusCode, 200);
    const ownerItems = ownerCannotSeeUnreviewed.json() as { items: Array<{ id: string }> };
    assert.ok(!ownerItems.items.some((item) => item.id === "cmp-wire-private-1"));

    const creatorSeesOwnUnreviewed = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: { "x-role": "viewer", "x-user-id": "editor-a" }
    });
    assert.equal(creatorSeesOwnUnreviewed.statusCode, 200);
    const creatorItems = creatorSeesOwnUnreviewed.json() as { items: Array<{ id: string }> };
    assert.ok(creatorItems.items.some((item) => item.id === "cmp-wire-private-1"));

    const otherViewerHidden = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: { "x-role": "viewer", "x-user-id": "viewer-b" }
    });
    assert.equal(otherViewerHidden.statusCode, 200);
    const otherItems = otherViewerHidden.json() as { items: Array<{ id: string }> };
    assert.ok(!otherItems.items.some((item) => item.id === "cmp-wire-private-1"));

    const reviewByOwner = await app.inject({
      method: "POST",
      url: "/v1/library/components/cmp-wire-private-1/review",
      headers: { "x-role": "owner", "x-user-id": "owner-a" },
      payload: {}
    });
    assert.equal(reviewByOwner.statusCode, 200);

    const otherViewerNowSeesReviewed = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: { "x-role": "viewer", "x-user-id": "viewer-b" }
    });
    assert.equal(otherViewerNowSeesReviewed.statusCode, 200);
    const reviewedItems = otherViewerNowSeesReviewed.json() as { items: Array<{ id: string }> };
    assert.ok(reviewedItems.items.some((item) => item.id === "cmp-wire-private-1"));

  } finally {
    await app.close();
  }
});

test("library review queue endpoint is owner-only and filterable", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const createA = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { "x-role": "editor", "x-user-id": "author-a" },
      payload: {
        items: [
          {
            id: "cmp-queue-001",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-26",
            description: "Queue candidate A",
            awg: "26",
            color: "green",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(createA.statusCode, 201);

    const createB = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { "x-role": "editor", "x-user-id": "author-b" },
      payload: {
        items: [
          {
            id: "cmp-queue-002",
            category: "contact",
            family: "Micro-D",
            partNumber: "MDM-37P",
            description: "Queue candidate B",
            isActive: true,
            stockStatus: "low_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(createB.statusCode, 201);

    const forbidden = await app.inject({
      method: "GET",
      url: "/v1/library/components/review-queue",
      headers: { "x-role": "editor", "x-user-id": "author-a" }
    });
    assert.equal(forbidden.statusCode, 403);

    const ownerQueue = await app.inject({
      method: "GET",
      url: "/v1/library/components/review-queue",
      headers: { "x-role": "owner", "x-user-id": "owner-a" }
    });
    assert.equal(ownerQueue.statusCode, 200);
    const queuePayload = ownerQueue.json() as { items: Array<{ id: string; enteredByUserId: string; isReviewed: boolean }> };
    assert.ok(queuePayload.items.some((item) => item.id === "cmp-queue-001" && item.enteredByUserId === "author-a"));
    assert.ok(queuePayload.items.some((item) => item.id === "cmp-queue-002" && item.enteredByUserId === "author-b"));
    assert.ok(queuePayload.items.every((item) => item.isReviewed === false));

    const filteredQueue = await app.inject({
      method: "GET",
      url: "/v1/library/components/review-queue?category=contact&enteredByUserId=author-b",
      headers: { "x-role": "owner", "x-user-id": "owner-a" }
    });
    assert.equal(filteredQueue.statusCode, 200);
    const filteredPayload = filteredQueue.json() as { items: Array<{ id: string }> };
    assert.deepEqual(filteredPayload.items.map((item) => item.id), ["cmp-queue-002"]);

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/cmp-queue-002/archive",
      headers: { "x-role": "owner", "x-user-id": "owner-a" },
      payload: {}
    });
    assert.equal(archiveResponse.statusCode, 200);

    const queueAfterArchive = await app.inject({
      method: "GET",
      url: "/v1/library/components/review-queue",
      headers: { "x-role": "owner", "x-user-id": "owner-a" }
    });
    assert.equal(queueAfterArchive.statusCode, 200);
    const queueAfterArchivePayload = queueAfterArchive.json() as { items: Array<{ id: string }> };
    assert.ok(!queueAfterArchivePayload.items.some((item) => item.id === "cmp-queue-002"));
  } finally {
    await app.close();
  }
});

test("library component patch supports full metadata edits for admin", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const adminCookie = await registerAdminAndGetCookie(app);

    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: adminCookie },
      payload: {
        items: [
          {
            id: "cmp-editable-001",
            category: "contact",
            family: "Micro-D",
            partNumber: "MDM-99P",
            description: "Editable connector",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: ["Initial hint"],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/v1/library/components/cmp-editable-001",
      headers: { cookie: adminCookie },
      payload: {
        family: "Micro-D-Updated",
        description: "Updated via admin patch",
        isActive: false,
        stockStatus: "low_stock",
        compatibilityHints: ["Hint A", "Hint B"],
        createdByUserId: "creator-admin",
        createdAt: "2026-05-01T08:00:00.000Z",
        isReviewed: true,
        reviewedByUserId: "reviewer-admin",
        reviewedAt: "2026-05-02T09:15:00.000Z",
        lastEditedByUserId: "editor-admin",
        lastEditedAt: "2026-05-03T10:30:00.000Z"
      }
    });
    assert.equal(patchResponse.statusCode, 200);
    const patched = patchResponse.json() as {
      family: string;
      description: string;
      isActive: boolean;
      stockStatus: string;
      compatibilityHints: string[];
      createdByUserId: string;
      createdAt: string;
      isReviewed: boolean;
      reviewedByUserId?: string;
      reviewedAt?: string;
      lastEditedByUserId: string;
      lastEditedAt: string;
    };
    assert.equal(patched.family, "Micro-D-Updated");
    assert.equal(patched.description, "Updated via admin patch");
    assert.equal(patched.isActive, false);
    assert.equal(patched.stockStatus, "low_stock");
    assert.deepEqual(patched.compatibilityHints, ["Hint A", "Hint B"]);
    assert.equal(patched.createdByUserId, "creator-admin");
    assert.equal(patched.createdAt, "2026-05-01T08:00:00.000Z");
    assert.equal(patched.isReviewed, true);
    assert.equal(patched.reviewedByUserId, "reviewer-admin");
    assert.equal(patched.reviewedAt, "2026-05-02T09:15:00.000Z");
    assert.equal(patched.lastEditedByUserId, "editor-admin");
    assert.equal(patched.lastEditedAt, "2026-05-03T10:30:00.000Z");
  } finally {
    await app.close();
  }
});

test("library component patch enforces reviewed consistency", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const adminCookie = await registerAdminAndGetCookie(app);

    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: adminCookie },
      payload: {
        items: [
          {
            id: "cmp-editable-002",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-18",
            description: "Patch validation wire",
            awg: "18",
            color: "white",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const invalidReviewPatch = await app.inject({
      method: "PATCH",
      url: "/v1/library/components/cmp-editable-002",
      headers: { cookie: adminCookie },
      payload: {
        isReviewed: true,
        reviewedAt: "2026-05-02T09:15:00.000Z"
      }
    });
    assert.equal(invalidReviewPatch.statusCode, 400);

    const validUnreviewPatch = await app.inject({
      method: "PATCH",
      url: "/v1/library/components/cmp-editable-002",
      headers: { cookie: adminCookie },
      payload: {
        isReviewed: false
      }
    });
    assert.equal(validUnreviewPatch.statusCode, 200);
    const updated = validUnreviewPatch.json() as { isReviewed: boolean; reviewedByUserId?: string; reviewedAt?: string };
    assert.equal(updated.isReviewed, false);
    assert.equal(updated.reviewedByUserId, undefined);
    assert.equal(updated.reviewedAt, undefined);
  } finally {
    await app.close();
  }
});

test("admin table preferences persist per user and scope", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const adminCookie = await registerAdminAndGetCookie(app);

    const initialResponse = await app.inject({
      method: "GET",
      url: "/v1/library/table-preferences/admin_item_database_wire",
      headers: { cookie: adminCookie }
    });
    assert.equal(initialResponse.statusCode, 200);
    assert.equal(initialResponse.json(), null);

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/v1/library/table-preferences/admin_item_database_wire",
      headers: { cookie: adminCookie },
      payload: {
        columnOrder: ["partNumber", "family", "awg", "actions", "awg"],
        columnWidths: {
          partNumber: 210,
          family: 180,
          awg: 92,
          unknown: 333
        }
      }
    });
    assert.equal(saveResponse.statusCode, 200);
    const saved = saveResponse.json() as {
      scope: string;
      columnOrder: string[];
      columnWidths: Record<string, number>;
      updatedAt: string;
    };
    assert.equal(saved.scope, "admin_item_database_wire");
    assert.deepEqual(saved.columnOrder, ["partNumber", "family", "awg", "actions"]);
    assert.deepEqual(saved.columnWidths, { partNumber: 210, family: 180, awg: 92 });
    assert.ok(saved.updatedAt);

    const fetchResponse = await app.inject({
      method: "GET",
      url: "/v1/library/table-preferences/admin_item_database_wire",
      headers: { cookie: adminCookie }
    });
    assert.equal(fetchResponse.statusCode, 200);
    const fetched = fetchResponse.json() as {
      columnOrder: string[];
      columnWidths: Record<string, number>;
    };
    assert.deepEqual(fetched.columnOrder, saved.columnOrder);
    assert.deepEqual(fetched.columnWidths, saved.columnWidths);
  } finally {
    await app.close();
  }
});

test("library field definitions support add/rename/toggle/delete with hard delete behavior", async () => {
  const app = buildTestApp();
  await app.ready();
  try {
    const adminCookie = await registerAdminAndGetCookie(app);
    const createFieldResponse = await app.inject({
      method: "POST",
      url: "/v1/library/field-definitions/wire",
      headers: { cookie: adminCookie },
      payload: {
        key: "insulationType",
        label: "Insulation type",
        isVisibleInViewer: true
      }
    });
    assert.equal(createFieldResponse.statusCode, 201);
    const createdField = createFieldResponse.json() as { id: string; key: string; label: string; isSystem: boolean };
    assert.equal(createdField.key, "insulationType");
    assert.equal(createdField.label, "Insulation type");
    assert.equal(createdField.isSystem, false);

    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: adminCookie },
      payload: {
        items: [
          {
            id: "cmp-wire-custom-001",
            category: "wire",
            family: "MIL-W-22759",
            partNumber: "M22759/16-30",
            description: "Custom field wire",
            awg: "30",
            color: "black",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false,
            customFieldValues: {
              insulationType: "PTFE"
            }
          }
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/v1/library/components/cmp-wire-custom-001",
      headers: { cookie: adminCookie },
      payload: {
        customFieldValues: {
          insulationType: "ETFE"
        }
      }
    });
    assert.equal(patchResponse.statusCode, 200);
    const patched = patchResponse.json() as { customFieldValues: Record<string, string> };
    assert.equal(patched.customFieldValues.insulationType, "ETFE");

    const renameFieldResponse = await app.inject({
      method: "PATCH",
      url: `/v1/library/field-definitions/${createdField.id}`,
      headers: { cookie: adminCookie },
      payload: {
        label: "Insulation",
        isVisibleInViewer: false
      }
    });
    assert.equal(renameFieldResponse.statusCode, 200);
    const renamed = renameFieldResponse.json() as { label: string; isVisibleInViewer: boolean };
    assert.equal(renamed.label, "Insulation");
    assert.equal(renamed.isVisibleInViewer, false);

    const deleteFieldResponse = await app.inject({
      method: "DELETE",
      url: `/v1/library/field-definitions/${createdField.id}`,
      headers: { cookie: adminCookie }
    });
    assert.equal(deleteFieldResponse.statusCode, 204);

    const getAfterDeleteResponse = await app.inject({
      method: "GET",
      url: "/v1/library/components/cmp-wire-custom-001",
      headers: { cookie: adminCookie }
    });
    assert.equal(getAfterDeleteResponse.statusCode, 200);
    const afterDelete = getAfterDeleteResponse.json() as { customFieldValues: Record<string, string> };
    assert.equal(afterDelete.customFieldValues.insulationType, undefined);
  } finally {
    await app.close();
  }
});
