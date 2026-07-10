import type { UserRole } from "../auth/rbac.js";

export type AccountRole = "regular" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  accountRole: AccountRole;
  passwordHash: string;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}
