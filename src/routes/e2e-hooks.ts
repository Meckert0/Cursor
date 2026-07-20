import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/rbac.js";

/**
 * Test-only hooks for Playwright failure-path coverage.
 * Registered only when ENABLE_E2E_HOOKS=true.
 */
export function registerE2eHookRoutes(app: FastifyInstance) {
  app.post("/v1/e2e/exports/:exportId/fail", async (request, reply) => {
    if (!requireRole(request, reply, ["editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ exportId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        errorMessage: z.string().min(1).default("Forced E2E export failure."),
        failureKind: z.enum(["transient", "permanent"]).default("permanent")
      })
      .parse(request.body ?? {});

    const existing = await app.store.getExportArtifact(params.exportId);
    if (!existing) {
      return reply.notFound("Export not found.");
    }

    const updated = await app.store.updateExportArtifact({
      exportId: params.exportId,
      status: "failed",
      errorMessage: body.errorMessage,
      failureKind: body.failureKind,
      nextAttemptAt: null
    });
    return updated;
  });
}
