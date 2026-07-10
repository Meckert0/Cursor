import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireProjectMembership } from "../auth/membership.js";
import type { DesignStatus } from "../domain/types.js";
import { requireRole } from "../auth/rbac.js";

const lockSchema = z.object({
  ttlSeconds: z.number().int().min(60).max(7200).default(900),
  userId: z.string().default("system-user"),
  reason: z.string().optional()
});

const unlockSchema = z.object({
  userId: z.string().default("system-user")
});

const updateDesignSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional()
  })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: "At least one field must be provided."
  });

const submitForQuoteSchema = z.object({
  revisionId: z.string().uuid(),
  message: z.string().optional(),
  idempotencyKey: z.string().min(1).max(128).optional()
});

const stateTransitionSchema = z.object({
  targetState: z.enum(["draft", "locked", "submitted", "in_review", "quoted", "released"]),
  expectedCurrentState: z.enum(["draft", "locked", "submitted", "in_review", "quoted", "released"]).optional(),
  changedBy: z.string().default("system-user"),
  comment: z.string().optional()
});

const ALLOWED_STATE_TRANSITIONS: Record<DesignStatus, DesignStatus[]> = {
  draft: ["locked", "submitted"],
  locked: ["draft", "submitted"],
  submitted: ["in_review"],
  in_review: ["quoted"],
  quoted: ["released"],
  released: []
};

export function registerDesignRoutes(app: FastifyInstance) {
  const getDesignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
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
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    return design;
  };
  app.get("/v1/designs/:designId", getDesignHandler);
  app.get("/v1/harnesses/:designId", getDesignHandler);

  const updateDesignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
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
    const body = updateDesignSchema.parse(request.body);
    const updated = await app.store.updateDesign({
      designId: params.designId,
      name: body.name,
      description: body.description
    });
    if (!updated) {
      return reply.notFound("Design not found.");
    }
    return reply.code(200).send(updated);
  };
  app.patch("/v1/designs/:designId", updateDesignHandler);
  app.patch("/v1/harnesses/:designId", updateDesignHandler);

  const deleteDesignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
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
      allowedRoles: ["owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const deleted = await app.store.deleteDesign(params.designId);
    if (!deleted) {
      return reply.notFound("Design not found.");
    }
    return reply.code(204).send();
  };
  app.delete("/v1/designs/:designId", deleteDesignHandler);
  app.delete("/v1/harnesses/:designId", deleteDesignHandler);

  const listDesignRevisionsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
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
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const revisions = await app.store.listRevisions(params.designId);
    return { items: revisions };
  };
  app.get("/v1/designs/:designId/revisions", listDesignRevisionsHandler);
  app.get("/v1/harnesses/:designId/revisions", listDesignRevisionsHandler);

  const listDesignSubmissionsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
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
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const submissions = await app.store.listQuoteSubmissionsByDesign(params.designId);
    return { items: submissions };
  };
  app.get("/v1/designs/:designId/submissions", listDesignSubmissionsHandler);
  app.get("/v1/harnesses/:designId/submissions", listDesignSubmissionsHandler);

  const listDesignAuditEventsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
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
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const events = await app.store.listAuditEventsByDesign(params.designId);
    return { items: events };
  };
  app.get("/v1/designs/:designId/audit-events", listDesignAuditEventsHandler);
  app.get("/v1/harnesses/:designId/audit-events", listDesignAuditEventsHandler);

  app.get("/v1/submissions/:submissionId", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ submissionId: z.string().uuid() }).parse(request.params);
    const submission = await app.store.getQuoteSubmission(params.submissionId);
    if (!submission) {
      return reply.notFound("Submission not found.");
    }
    const design = await app.store.getDesign(submission.designId);
    if (!design) {
      return reply.notFound("Design not found.");
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
    return submission;
  });

  const lockDesignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
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
    const body = lockSchema.parse(request.body);
    try {
      const lock = await app.lockManager.lock(params.designId, body.userId, body.ttlSeconds);
      return reply.code(201).send(lock);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LOCK_CONFLICT")) {
        return reply.conflict("Design is locked by another user.");
      }
      throw error;
    }
  };
  app.post("/v1/designs/:designId/lock", lockDesignHandler);
  app.post("/v1/harnesses/:designId/lock", lockDesignHandler);

  const unlockDesignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
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
    const body = unlockSchema.parse(request.body);
    try {
      await app.lockManager.unlock(params.designId, body.userId);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === "LOCK_CONFLICT") {
        return reply.conflict("Only lock owner can unlock this design.");
      }
      throw error;
    }
  };
  app.post("/v1/designs/:designId/unlock", unlockDesignHandler);
  app.post("/v1/harnesses/:designId/unlock", unlockDesignHandler);

  const submitDesignForQuoteHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["editor", "owner"]).ok) {
      return;
    }
    const params = z.object({ designId: z.string().uuid() }).parse(request.params);
    const body = submitForQuoteSchema.parse(request.body);

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

    const revision = await app.store.getRevision(body.revisionId);
    if (!revision || revision.designId !== params.designId) {
      return reply.badRequest("Revision does not belong to design.");
    }

    const latestValidation = await app.store.getLatestValidationRunForRevision(body.revisionId);
    if (!latestValidation) {
      return reply.conflict("Latest validation pass is required before submission.");
    }

    if (latestValidation.summary.errors > 0) {
      return reply.conflict("Cannot submit design with validation errors.");
    }

    if (body.idempotencyKey) {
      const existing = await app.store.findQuoteSubmissionByIdempotencyKey(params.designId, body.idempotencyKey);
      if (existing) {
        return reply.code(200).send(existing);
      }
    }

    const submission = await app.store.createQuoteSubmission({
      designId: params.designId,
      revisionId: body.revisionId,
      validationRunId: latestValidation.id,
      message: body.message,
      idempotencyKey: body.idempotencyKey,
      estimatedResponseHours: 24
    });

    return reply.code(201).send(submission);
  };
  app.post("/v1/designs/:designId/submit-for-quote", submitDesignForQuoteHandler);
  app.post("/v1/harnesses/:designId/submit-for-quote", submitDesignForQuoteHandler);

  const transitionDesignStateHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ designId: z.string().uuid() }).parse(request.params);
    const body = stateTransitionSchema.parse(request.body);

    const design = await app.store.getDesign(params.designId);
    if (!design) {
      return reply.notFound("Design not found.");
    }
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: design.projectId,
      allowedRoles: ["owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }

    if (body.expectedCurrentState && design.status !== body.expectedCurrentState) {
      return reply.conflict("Design is not in the expected current state.");
    }

    if (design.status === body.targetState) {
      return reply.code(200).send({ design, stateChanged: false });
    }

    if (!ALLOWED_STATE_TRANSITIONS[design.status].includes(body.targetState)) {
      return reply.badRequest(`Invalid state transition from ${design.status} to ${body.targetState}.`);
    }

    if (body.targetState === "submitted") {
      const latestValidation = await app.store.getLatestValidationRunForRevision(design.currentRevisionId);
      if (!latestValidation) {
        return reply.conflict("Validation pass is required before moving to submitted.");
      }
      if (latestValidation.summary.errors > 0) {
        return reply.conflict("Cannot move to submitted while validation has errors.");
      }
    }

    let updatedDesign;
    try {
      updatedDesign = await app.store.updateDesignState({
        designId: design.id,
        targetStatus: body.targetState,
        expectedCurrentStatus: design.status
      });
    } catch (error) {
      if (error instanceof Error && error.message === "STATE_MISMATCH") {
        return reply.conflict("Design state changed concurrently. Please retry.");
      }
      throw error;
    }

    if (!updatedDesign) {
      return reply.notFound("Design not found.");
    }

    const auditEvent = await app.store.createAuditEvent({
      designId: design.id,
      eventType: "design.state.changed",
      actorId: body.changedBy,
      payload: {
        fromState: design.status,
        toState: body.targetState,
        comment: body.comment
      }
    });

    return reply.code(200).send({
      design: updatedDesign,
      stateChanged: true,
      auditEventId: auditEvent.id
    });
  };
  app.post("/v1/designs/:designId/state-transitions", transitionDesignStateHandler);
  app.post("/v1/harnesses/:designId/state-transitions", transitionDesignStateHandler);
}
