import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireProjectMembership } from "../auth/membership.js";
import { requireRole } from "../auth/rbac.js";
import { buildBom, createLibraryLookup } from "../domain/bom.js";
import { createCompatLookup } from "../domain/compat-lookup.js";
import { hashDesignSnapshot } from "../domain/snapshot-hash.js";
import { validateSnapshot } from "../domain/validator.js";
import type { DesignSnapshot, Revision } from "../domain/types.js";
import type { Store } from "../infra/store/store.js";

async function loadLibraryLookup(store: Store) {
  const [components, aliases] = await Promise.all([
    store.listLibraryComponents({
      requestingUserId: "system-bom",
      canViewAllUnreviewed: true,
      canViewInactive: true
    }),
    store.listPartAliases()
  ]);
  return createLibraryLookup(components, aliases);
}

async function loadCompatLookup(store: Store) {
  const [contactWire, moduleContact, moduleBackshell, moduleStrainRelief] = await Promise.all([
    store.listContactWireCompat(),
    store.listModuleContactCompat(),
    store.listModuleBackshellCompat(),
    store.listModuleStrainReliefCompat()
  ]);
  return createCompatLookup({ contactWire, moduleContact, moduleBackshell, moduleStrainRelief });
}

function withSnapshotHash(revision: Revision) {
  return {
    ...revision,
    snapshotHash: hashDesignSnapshot(revision.snapshot)
  };
}

const snapshotSchema = z.object({
  connectors: z
    .array(
      z.object({
        id: z.string(),
        reference: z.string(),
        partNumber: z.string().optional(),
        libraryComponentId: z.string().optional(),
        backshellPartNumber: z.string().optional(),
        backshellLibraryComponentId: z.string().optional(),
        strainReliefPartNumber: z.string().optional(),
        strainReliefLibraryComponentId: z.string().optional(),
        pins: z.array(z.object({ id: z.string(), number: z.string() })),
        location: z.object({ x: z.number(), y: z.number() }).optional()
      })
    )
    .default([]),
  junctions: z
    .array(
      z.object({
        id: z.string(),
        location: z.object({ x: z.number(), y: z.number() }),
        label: z.string().optional(),
        junctionType: z.string().optional()
      })
    )
    .optional(),
  paths: z
    .array(
      z.object({
        id: z.string(),
        runNumber: z.number().int().positive().optional(),
        wireName: z.string().optional(),
        fromConnectorId: z.string(),
        toConnectorId: z.string(),
        pathType: z.string(),
        length: z.number().finite().nonnegative().optional(),
        sleeving: z.enum(["none", "expandable_sleeving", "wire_braid_under_expandable_sleeving"]).optional(),
        wireComponentId: z.string().optional(),
        fromContact: z.string().optional(),
        fromSignalDescription: z.string().optional(),
        wireAwg: z.string().optional(),
        wirePartNumber: z.string().optional(),
        wireColor: z.string().optional(),
        wireGroup: z.string().optional(),
        toContact: z.string().optional(),
        toSignalDescription: z.string().optional(),
        labelPartNumber: z.string().optional(),
        labelText: z.string().optional(),
        notes: z.string().optional()
      })
    )
    .default([]),
  pinMappings: z
    .array(
      z.object({
        id: z.string(),
        pathId: z.string(),
        fromConnectorId: z.string(),
        fromPinId: z.string(),
        toConnectorId: z.string(),
        toPinId: z.string(),
        mappingType: z.enum(["one_to_one", "one_to_many", "loopback"])
      })
    )
    .default([]),
  bundles: z.array(z.object({ id: z.string(), name: z.string(), pathIds: z.array(z.string()) })).default([]),
  annotations: z.array(z.object({ id: z.string(), text: z.string() })).default([])
});

const createRevisionSchema = z.object({
  rulesetVersion: z.string().optional(),
  libraryVersion: z.string().default("lib-2026.03.1"),
  snapshot: snapshotSchema.default({
    connectors: [],
    junctions: [],
    paths: [],
    pinMappings: [],
    bundles: [],
    annotations: []
  })
});

const validateRequestSchema = z.object({
  rulesetVersion: z.string().optional(),
  mode: z.enum(["quick", "full"]).default("full")
});

const createExportSchema = z.object({
  format: z.enum(["json", "pdf", "xlsx"]).default("json")
});

export function registerRevisionRoutes(app: FastifyInstance) {
  app.get("/v1/exports/:exportId", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ exportId: z.string().uuid() }).parse(request.params);
    const exportArtifact = await app.store.getExportArtifact(params.exportId);
    if (!exportArtifact) {
      return reply.notFound("Export not found.");
    }
    const revision = await app.store.getRevision(exportArtifact.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found for export.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for export.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const downloadUrl = exportArtifact.artifactUri
      ? await app.artifactDownloadUrlResolver.resolveDownloadUrl(exportArtifact.artifactUri)
      : undefined;
    return { ...exportArtifact, downloadUrl };
  });

  app.get("/v1/validations/:validationRunId", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ validationRunId: z.string().uuid() }).parse(request.params);
    const validationRun = await app.store.getValidationRun(params.validationRunId);
    if (!validationRun) {
      return reply.notFound("Validation run not found.");
    }
    const revision = await app.store.getRevision(validationRun.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found for validation run.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for validation run.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    return validationRun;
  });

  app.get("/v1/revisions/:revisionId/exports", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ revisionId: z.string().uuid() }).parse(request.params);
    const revision = await app.store.getRevision(params.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for revision.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const exports = await app.store.listExportArtifactsByRevision(params.revisionId);
    return { items: exports };
  });

  app.get("/v1/revisions/:revisionId", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ revisionId: z.string().uuid() }).parse(request.params);
    const revision = await app.store.getRevision(params.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for revision.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    return withSnapshotHash(revision);
  });

  const createDesignRevisionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["editor", "owner"]).ok) {
      return;
    }
    const params = z.object({ designId: z.string().uuid() }).parse(request.params);
    const design = await app.store.getDesign(params.designId);
    if (!design) {
      return reply.notFound("Design not found.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["editor", "owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const body = createRevisionSchema.parse(request.body);
    const policy = await app.store.getProjectRulesetPolicy(design.projectId);
    const activeRuleset = await app.store.getActiveRuleset();
    const resolvedRulesetVersion =
      body.rulesetVersion ?? policy?.defaultRulesetVersion ?? activeRuleset?.version ?? "rules-2026.03";
    if (policy && policy.allowedRulesetVersions.length > 0 && !policy.allowedRulesetVersions.includes(resolvedRulesetVersion)) {
      return reply.conflict("Requested ruleset is not allowed by project policy.");
    }

    try {
      const revision = await app.store.createRevision({
        designId: params.designId,
        createdBy: memberCheck.userId,
        rulesetVersion: resolvedRulesetVersion,
        libraryVersion: body.libraryVersion,
        snapshot: body.snapshot as DesignSnapshot
      });
      return reply.code(201).send(withSnapshotHash(revision));
    } catch (error) {
      if (error instanceof Error && error.message === "DESIGN_NOT_FOUND") {
        return reply.notFound("Design not found.");
      }
      throw error;
    }
  };
  app.post("/v1/designs/:designId/revisions", createDesignRevisionHandler);
  app.post("/v1/harnesses/:designId/revisions", createDesignRevisionHandler);

  app.patch("/v1/revisions/:revisionId/snapshot", async (request, reply) => {
    if (!requireRole(request, reply, ["editor", "owner"]).ok) {
      return;
    }
    const params = z.object({ revisionId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        snapshot: snapshotSchema,
        expectedSnapshotHash: z.string().min(1)
      })
      .parse(request.body);
    const revision = await app.store.getRevision(params.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for revision.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["editor", "owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    try {
      const updated = await app.store.updateRevisionSnapshot({
        revisionId: params.revisionId,
        snapshot: body.snapshot as DesignSnapshot,
        expectedSnapshotHash: body.expectedSnapshotHash
      });
      if (!updated) {
        return reply.notFound("Revision not found.");
      }
      return withSnapshotHash(updated);
    } catch (error) {
      if (error instanceof Error && error.message === "SNAPSHOT_MISMATCH") {
        return reply.conflict("Snapshot was modified elsewhere. Reload and retry.");
      }
      throw error;
    }
  });

  app.post("/v1/revisions/:revisionId/validate", async (request, reply) => {
    if (!requireRole(request, reply, ["editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ revisionId: z.string().uuid() }).parse(request.params);
    const body = validateRequestSchema.parse(request.body);
    const revision = await app.store.getRevision(params.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for revision.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const policy = await app.store.getProjectRulesetPolicy(design.projectId);
    const activeRuleset = await app.store.getActiveRuleset();
    const resolvedRulesetVersion =
      body.rulesetVersion ?? policy?.defaultRulesetVersion ?? activeRuleset?.version ?? "rules-2026.03";
    if (policy && policy.allowedRulesetVersions.length > 0 && !policy.allowedRulesetVersions.includes(resolvedRulesetVersion)) {
      return reply.conflict("Requested ruleset is not allowed by project policy.");
    }

    const libraryLookup = await loadLibraryLookup(app.store);
    const compatLookup = await loadCompatLookup(app.store);
    const partRelationships = await app.store.listPartRelationships({ relationshipType: "MODULE_ALLOWED" });
    const startedAt = Date.now();
    let report;
    try {
      report = validateSnapshot(revision.snapshot, {
        libraryLookup,
        compatLookup,
        partRelationships,
        rulesetVersion: resolvedRulesetVersion,
        mode: body.mode,
        policy: {
          inactivePartSeverity: policy?.inactivePartSeverity,
          unreviewedPartSeverity: policy?.unreviewedPartSeverity,
          outOfStockSeverity: policy?.outOfStockSeverity
        }
      });
      app.metrics.recordValidationLatency(Date.now() - startedAt, true);
    } catch (error) {
      app.metrics.recordValidationLatency(Date.now() - startedAt, false);
      throw error;
    }
    const validationRun = await app.store.createValidationRun({
      revisionId: params.revisionId,
      rulesetVersion: resolvedRulesetVersion,
      mode: body.mode,
      snapshotHash: hashDesignSnapshot(revision.snapshot),
      summary: {
        errors: report.errors,
        warnings: report.warnings,
        infos: report.infos
      },
      results: report.results
    });
    request.log.info(
      {
        validationRunId: validationRun.id,
        revisionId: params.revisionId,
        rulesetVersion: resolvedRulesetVersion,
        mode: body.mode,
        latencyMs: Date.now() - startedAt,
        requestId: request.id,
        correlationId: request.correlationId
      },
      "validation.completed"
    );
    return {
      validationRunId: validationRun.id,
      rulesetVersion: validationRun.rulesetVersion,
      status: "completed",
      summary: validationRun.summary,
      results: validationRun.results
    };
  });

  app.get("/v1/revisions/:revisionId/bom", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ revisionId: z.string().uuid() }).parse(request.params);
    const revision = await app.store.getRevision(params.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for revision.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }

    const libraryLookup = await loadLibraryLookup(app.store);
    return buildBom(revision, libraryLookup);
  });

  app.post("/v1/revisions/:revisionId/exports", async (request, reply) => {
    if (!requireRole(request, reply, ["editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ revisionId: z.string().uuid() }).parse(request.params);
    const body = createExportSchema.parse(request.body);
    const revision = await app.store.getRevision(params.revisionId);
    if (!revision) {
      return reply.notFound("Revision not found.");
    }
    const design = await app.store.getDesign(revision.designId);
    if (!design) {
      return reply.notFound("Design not found for revision.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }

    const exportArtifact = await app.exportQueue.enqueueExport({
      revisionId: revision.id,
      format: body.format,
      requestId: request.id,
      correlationId: request.correlationId
    });

    return reply.code(202).send(exportArtifact);
  });
}
