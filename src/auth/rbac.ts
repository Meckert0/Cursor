import type { FastifyReply, FastifyRequest } from "fastify";
import type { AccountRole } from "../domain/auth.js";

export type UserRole = "viewer" | "editor" | "owner" | "supplier_reviewer";

const VALID_ROLES: UserRole[] = ["viewer", "editor", "owner", "supplier_reviewer"];

function allowLegacyHeaderAuth(): boolean {
  return (process.env.ENABLE_LEGACY_HEADER_AUTH ?? "false").toLowerCase() === "true";
}

function parseRole(request: FastifyRequest): UserRole | null {
  if (request.currentUser?.role) {
    return request.currentUser.role;
  }

  if (!allowLegacyHeaderAuth()) {
    return null;
  }

  const header = request.headers["x-role"];
  const raw = Array.isArray(header) ? header[0] : header;

  if (!raw) {
    const strict = (process.env.REQUIRE_ROLE_HEADER ?? "false").toLowerCase() === "true";
    return strict ? null : "owner";
  }

  if (VALID_ROLES.includes(raw as UserRole)) {
    return raw as UserRole;
  }
  return null;
}

export function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedRoles: UserRole[]
): { ok: true; role: UserRole } | { ok: false } {
  const role = parseRole(request);
  if (!role) {
    reply.unauthorized("Missing or invalid role. Provide x-role header.");
    return { ok: false };
  }

  if (!allowedRoles.includes(role)) {
    reply.forbidden("Insufficient role for this operation.");
    return { ok: false };
  }

  return { ok: true, role };
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): { ok: true } | { ok: false } {
  const accountRole: AccountRole | undefined = request.currentUser?.accountRole;
  if (!accountRole) {
    reply.unauthorized("Not authenticated.");
    return { ok: false };
  }
  if (accountRole !== "admin") {
    reply.forbidden("Admin account required.");
    return { ok: false };
  }
  return { ok: true };
}
