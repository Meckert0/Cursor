import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/rbac.js";

const upsertRulesetSchema = z.object({
  isActive: z.boolean().default(false),
  notes: z.string().optional()
});

export function registerRulesetRoutes(app: FastifyInstance) {
  app.get("/v1/rulesets", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const rulesets = await app.store.listRulesets();
    return { items: rulesets };
  });

  app.get("/v1/rulesets/active", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const active = await app.store.getActiveRuleset();
    if (!active) {
      return reply.notFound("No active ruleset configured.");
    }
    return active;
  });

  app.put("/v1/rulesets/:version", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ version: z.string().min(1) }).parse(request.params);
    const body = upsertRulesetSchema.parse(request.body);
    const ruleset = await app.store.upsertRuleset({
      version: params.version,
      isActive: body.isActive,
      notes: body.notes
    });
    return reply.code(200).send(ruleset);
  });
}
