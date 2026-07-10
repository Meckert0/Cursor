import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isAdminEmail } from "../auth/admin.js";
import { createSessionToken, getSessionTtlMs, hashPassword, hashSessionToken, verifyPassword } from "../auth/session.js";
import { requireAdmin, requireRole } from "../auth/rbac.js";

const registerPayloadSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "Username may only include letters, numbers, '.', '_' and '-'."),
  email: z.string().email(),
  password: z.string().min(8)
});

const loginPayloadSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const updatePageDescriptionsPayloadSchema = z.object({
  projectsHeaderDescription: z.string().trim().min(1).max(600).optional(),
  harnessHeaderDescription: z.string().trim().min(1).max(600).optional()
});

function allowLegacyHeaderAuth(): boolean {
  return (process.env.ENABLE_LEGACY_HEADER_AUTH ?? "false").toLowerCase() === "true";
}

function resolveAccountRoleForEmail(email: string): "regular" | "admin" {
  return isAdminEmail(email) ? "admin" : "regular";
}

function serializeUser(user: { id: string; email: string; role: string; accountRole: string; createdAt: string }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    accountRole: user.accountRole,
    createdAt: user.createdAt
  };
}

function parseLegacyRoleHeader(rawRoleHeader: string | string[] | undefined):
  | "viewer"
  | "editor"
  | "owner"
  | "supplier_reviewer"
  | null {
  const rawRole = Array.isArray(rawRoleHeader) ? rawRoleHeader[0] : rawRoleHeader;
  if (!rawRole) {
    return null;
  }
  if (rawRole === "viewer" || rawRole === "editor" || rawRole === "owner" || rawRole === "supplier_reviewer") {
    return rawRole;
  }
  return null;
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/register", async (request, reply) => {
    const body = registerPayloadSchema.parse(request.body);
    const normalizedUsername = body.username.trim().toLowerCase();
    const normalizedEmail = body.email.trim().toLowerCase();
    const existing = await app.authStore.getUserByEmail(normalizedEmail);
    if (existing) {
      return reply.conflict("Email is already registered.");
    }

    const passwordHash = await hashPassword(body.password);
    let user: Awaited<ReturnType<typeof app.authStore.createUser>>;
    try {
      user = await app.authStore.createUser({
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        role: "owner",
        accountRole: resolveAccountRoleForEmail(normalizedEmail)
      });
    } catch (error) {
      if (error instanceof Error && error.message === "USER_USERNAME_EXISTS") {
        return reply.conflict("Username is already taken.");
      }
      throw error;
    }

    const sessionToken = createSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();
    await app.authStore.createSession({
      userId: user.id,
      tokenHash,
      expiresAt
    });

    return reply.code(201).send({
      user: serializeUser(user),
      sessionToken,
      expiresAt
    });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = loginPayloadSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const user = await app.authStore.getUserByEmail(normalizedEmail);
    if (!user) {
      return reply.unauthorized("Invalid email or password.");
    }
    const passwordValid = await verifyPassword(body.password, user.passwordHash);
    if (!passwordValid) {
      return reply.unauthorized("Invalid email or password.");
    }
    const sessionToken = createSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + getSessionTtlMs()).toISOString();
    await app.authStore.createSession({
      userId: user.id,
      tokenHash,
      expiresAt
    });
    return reply.code(200).send({
      user: serializeUser(user),
      sessionToken,
      expiresAt
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = request.currentSessionToken;
    if (token) {
      await app.authStore.revokeSessionByTokenHash(hashSessionToken(token));
    }
    return reply.code(204).send();
  });

  app.get("/v1/auth/me", async (request, reply) => {
    if (request.currentUser) {
      return {
        user: serializeUser(request.currentUser)
      };
    }
    if (!allowLegacyHeaderAuth()) {
      return reply.unauthorized("Not authenticated.");
    }
    const userHeader = request.headers["x-user-id"];
    const userIdRaw = Array.isArray(userHeader) ? userHeader[0] : userHeader;
    const userId = userIdRaw?.trim();
    const role = parseLegacyRoleHeader(request.headers["x-role"]);
    if (role && userId) {
      return {
        user: {
          id: userId,
          email: `${userId}@local`,
          role,
          accountRole: "regular",
          createdAt: new Date(0).toISOString()
        }
      };
    }
    return reply.unauthorized("Not authenticated.");
  });

  app.get("/v1/ui/page-descriptions", async (request, reply) => {
    if (!requireRole(request, reply, ["viewer", "editor", "owner", "supplier_reviewer"]).ok) {
      return;
    }
    return await app.store.getUiCopySettings();
  });

  app.put("/v1/admin/ui/page-descriptions", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const body = updatePageDescriptionsPayloadSchema.parse(request.body);
    if (!body.projectsHeaderDescription && !body.harnessHeaderDescription) {
      return reply.badRequest("At least one description is required.");
    }
    return await app.store.updateUiCopySettings({
      projectsHeaderDescription: body.projectsHeaderDescription,
      harnessHeaderDescription: body.harnessHeaderDescription
    });
  });

  app.get("/v1/admin/users", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const users = await app.authStore.listUsers();
    return {
      items: users.map((user) => serializeUser(user))
    };
  });

  app.delete("/v1/admin/users/:userId", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const params = z.object({ userId: z.string().trim().min(1) }).parse(request.params);
    if (request.currentUser?.id === params.userId) {
      return reply.badRequest("Cannot delete your own account while signed in.");
    }
    const targetUser = await app.authStore.getUserById(params.userId);
    if (!targetUser) {
      return reply.notFound("User not found.");
    }
    await app.store.deleteUserData(params.userId);
    const deleted = await app.authStore.deleteUser(params.userId);
    if (!deleted) {
      return reply.notFound("User not found.");
    }
    return reply.code(204).send();
  });

  app.get("/v1/admin/projects-overview", async (request, reply) => {
    if (!requireAdmin(request, reply).ok) {
      return;
    }
    const projects = await app.store.listProjects();
    const items = await Promise.all(
      projects.map(async (project) => {
        const [members, harnesses] = await Promise.all([
          app.store.listProjectMembers(project.id),
          app.store.listDesignsByProject(project.id)
        ]);
        return {
          ...project,
          members,
          harnesses: harnesses.map((harness) => ({
            id: harness.id,
            name: harness.name
          }))
        };
      })
    );
    return { items };
  });
}
