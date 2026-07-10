import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireProjectMembership, resolveUserId } from "../auth/membership.js";
import { requireRole } from "../auth/rbac.js";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

const updateProjectSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional()
  })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: "At least one field must be provided."
  });

const createDesignSchema = z.object({
  name: z.string().min(1)
});

const upsertProjectRulesetPolicySchema = z.object({
  defaultRulesetVersion: z.string().optional(),
  allowedRulesetVersions: z.array(z.string()).default([])
});

const upsertProjectMemberSchema = z.object({
  role: z.enum(["viewer", "editor", "owner", "supplier_reviewer"])
});

export function registerProjectRoutes(app: FastifyInstance) {
  app.get("/v1/projects", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const userId = resolveUserId(request, reply);
    if (!userId) {
      return;
    }
    const projects = await app.store.listProjects();
    const visibleProjects = [];
    for (const project of projects) {
      const member = await app.store.getProjectMember(project.id, userId);
      if (member) {
        visibleProjects.push(project);
      }
    }
    return { items: visibleProjects };
  });

  app.post("/v1/projects", async (request, reply) => {
    if (!requireRole(request, reply, ["editor", "owner"]).ok) {
      return;
    }
    const body = createProjectSchema.parse(request.body);
    const userId = resolveUserId(request, reply);
    if (!userId) {
      return;
    }
    const project = await app.store.createProject({
      ...body,
      createdBy: userId
    });
    return reply.code(201).send(project);
  });

  app.patch("/v1/projects/:projectId", async (request, reply) => {
    if (!requireRole(request, reply, ["editor", "owner"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["editor", "owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const body = updateProjectSchema.parse(request.body);
    const project = await app.store.updateProject({
      projectId: params.projectId,
      name: body.name,
      description: body.description
    });
    if (!project) {
      return reply.notFound("Project not found.");
    }
    return reply.code(200).send(project);
  });

  app.delete("/v1/projects/:projectId", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const deleted = await app.store.deleteProject(params.projectId);
    if (!deleted) {
      return reply.notFound("Project not found.");
    }
    return reply.code(204).send();
  });

  const createProjectDesignHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["editor", "owner"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["editor", "owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const body = createDesignSchema.parse(request.body);
    const policy = await app.store.getProjectRulesetPolicy(params.projectId);
    const activeRuleset = await app.store.getActiveRuleset();
    const resolvedRulesetVersion = policy?.defaultRulesetVersion ?? activeRuleset?.version ?? "rules-2026.03";
    if (policy && policy.allowedRulesetVersions.length > 0 && !policy.allowedRulesetVersions.includes(resolvedRulesetVersion)) {
      return reply.conflict("Resolved ruleset is not allowed by project policy.");
    }
    try {
      const design = await app.store.createDesign({
        ...body,
        projectId: params.projectId,
        createdBy: memberCheck.userId,
        rulesetVersion: resolvedRulesetVersion
      });
      return reply.code(201).send(design);
    } catch (error) {
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
        return reply.notFound("Project not found.");
      }
      throw error;
    }
  };
  app.post("/v1/projects/:projectId/designs", createProjectDesignHandler);
  app.post("/v1/projects/:projectId/harnesses", createProjectDesignHandler);

  const listProjectDesignsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const project = await app.store.getProject(params.projectId);
    if (!project) {
      return reply.notFound("Project not found.");
    }
    const designs = await app.store.listDesignsByProject(params.projectId);
    return { items: designs };
  };
  app.get("/v1/projects/:projectId/designs", listProjectDesignsHandler);
  app.get("/v1/projects/:projectId/harnesses", listProjectDesignsHandler);

  app.get("/v1/projects/:projectId/ruleset-policy", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const project = await app.store.getProject(params.projectId);
    if (!project) {
      return reply.notFound("Project not found.");
    }
    const policy = await app.store.getProjectRulesetPolicy(params.projectId);
    if (!policy) {
      return {
        projectId: params.projectId,
        defaultRulesetVersion: undefined,
        allowedRulesetVersions: []
      };
    }
    return policy;
  });

  app.put("/v1/projects/:projectId/ruleset-policy", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const body = upsertProjectRulesetPolicySchema.parse(request.body);
    const project = await app.store.getProject(params.projectId);
    if (!project) {
      return reply.notFound("Project not found.");
    }

    const rulesets = await app.store.listRulesets();
    const availableVersions = new Set(rulesets.map((ruleset) => ruleset.version));
    const missingAllowed = body.allowedRulesetVersions.filter((version) => !availableVersions.has(version));
    if (missingAllowed.length > 0) {
      return reply.badRequest(`Unknown ruleset versions: ${missingAllowed.join(", ")}`);
    }
    if (body.defaultRulesetVersion && !availableVersions.has(body.defaultRulesetVersion)) {
      return reply.badRequest(`Unknown default ruleset version: ${body.defaultRulesetVersion}`);
    }
    if (
      body.defaultRulesetVersion &&
      body.allowedRulesetVersions.length > 0 &&
      !body.allowedRulesetVersions.includes(body.defaultRulesetVersion)
    ) {
      return reply.badRequest("defaultRulesetVersion must be included in allowedRulesetVersions when allow-list is set.");
    }

    const policy = await app.store.upsertProjectRulesetPolicy({
      projectId: params.projectId,
      defaultRulesetVersion: body.defaultRulesetVersion,
      allowedRulesetVersions: body.allowedRulesetVersions
    });
    return reply.code(200).send(policy);
  });

  app.get("/v1/projects/:projectId/members", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["viewer", "editor", "owner", "supplier_reviewer"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const members = await app.store.listProjectMembers(params.projectId);
    return { items: members };
  });

  app.put("/v1/projects/:projectId/members/:userId", async (request, reply) => {
    if (!requireRole(request, reply, ["owner"]).ok) {
      return;
    }
    const params = z.object({ projectId: z.string().uuid(), userId: z.string().min(1) }).parse(request.params);
    const memberCheck = await requireProjectMembership({
      request,
      reply,
      store: app.store,
      projectId: params.projectId,
      allowedRoles: ["owner"]
    });
    if (!memberCheck.ok) {
      return;
    }
    const body = upsertProjectMemberSchema.parse(request.body);
    try {
      const member = await app.store.upsertProjectMember({
        projectId: params.projectId,
        userId: params.userId,
        role: body.role
      });
      return reply.code(200).send(member);
    } catch (error) {
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
        return reply.notFound("Project not found.");
      }
      throw error;
    }
  });
}
