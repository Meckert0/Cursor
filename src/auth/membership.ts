import type { FastifyReply, FastifyRequest } from "fastify";
import type { ProjectMember } from "../domain/types.js";
import type { Store } from "../infra/store/store.js";

function allowLegacyHeaderAuth(): boolean {
  return (process.env.ENABLE_LEGACY_HEADER_AUTH ?? "true").toLowerCase() === "true";
}

function requireUserHeader(): boolean {
  return (process.env.REQUIRE_USER_HEADER ?? "false").toLowerCase() === "true";
}

export function resolveUserId(request: FastifyRequest, reply?: FastifyReply): string | null {
  if (request.currentUser?.id) {
    return request.currentUser.id;
  }

  if (!allowLegacyHeaderAuth()) {
    if (reply) {
      reply.unauthorized("Authentication required.");
    }
    return null;
  }

  const header = request.headers["x-user-id"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw && raw.trim().length > 0) {
    return raw.trim();
  }

  if (requireUserHeader()) {
    if (reply) {
      reply.unauthorized("Missing x-user-id header.");
    }
    return null;
  }

  return "system-user";
}

export async function requireProjectMembership(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  store: Store;
  projectId: string;
  allowedRoles: ProjectMember["role"][];
}): Promise<{ ok: true; userId: string; membership: ProjectMember } | { ok: false }> {
  const userId = resolveUserId(input.request, input.reply);
  if (!userId) {
    return { ok: false };
  }

  if (input.request.currentUser?.accountRole === "admin") {
    return {
      ok: true,
      userId,
      membership: {
        projectId: input.projectId,
        userId,
        role: "owner",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    };
  }

  const membership = await input.store.getProjectMember(input.projectId, userId);
  if (!membership) {
    input.reply.forbidden("You are not a member of this project.");
    return { ok: false };
  }

  if (!input.allowedRoles.includes(membership.role)) {
    input.reply.forbidden("Insufficient project membership role.");
    return { ok: false };
  }

  return { ok: true, userId, membership };
}
