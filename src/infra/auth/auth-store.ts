import type { UserRole } from "../../auth/rbac.js";
import type { AuthSession, AuthUser } from "../../domain/auth.js";

export interface AuthStore {
  createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    accountRole: AuthUser["accountRole"];
  }): Promise<AuthUser>;
  getUserById(userId: string): Promise<AuthUser | null>;
  getUserByEmail(email: string): Promise<AuthUser | null>;
  listUsers(): Promise<AuthUser[]>;
  deleteUser(userId: string): Promise<boolean>;
  createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession>;
  getSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  revokeSessionByTokenHash(tokenHash: string): Promise<boolean>;
  syncAdminRolesFromEnv?(): Promise<void>;
}
