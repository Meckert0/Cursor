import type { AuthSession, AuthUser } from "../../domain/auth.js";
import type { UserRole } from "../../auth/rbac.js";
import type { AuthStore } from "./auth-store.js";

export class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, AuthUser>();
  private readonly userByEmail = new Map<string, string>();
  private readonly sessionsByTokenHash = new Map<string, AuthSession>();

  async createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    accountRole: AuthUser["accountRole"];
  }): Promise<AuthUser> {
    const normalizedUsername = input.username.trim().toLowerCase();
    const normalizedEmail = input.email.trim().toLowerCase();
    if (this.users.has(normalizedUsername)) {
      throw new Error("USER_USERNAME_EXISTS");
    }
    if (this.userByEmail.has(normalizedEmail)) {
      throw new Error("USER_EMAIL_EXISTS");
    }
    const now = new Date().toISOString();
    const user: AuthUser = {
      id: normalizedUsername,
      email: normalizedEmail,
      role: input.role,
      accountRole: input.accountRole,
      passwordHash: input.passwordHash,
      createdAt: now
    };
    this.users.set(user.id, user);
    this.userByEmail.set(normalizedEmail, user.id);
    return user;
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const userId = this.userByEmail.get(email.trim().toLowerCase());
    if (!userId) {
      return null;
    }
    return this.users.get(userId) ?? null;
  }

  async listUsers(): Promise<AuthUser[]> {
    return Array.from(this.users.values()).sort((left, right) => left.email.localeCompare(right.email));
  }

  async deleteUser(userId: string): Promise<boolean> {
    const existing = this.users.get(userId);
    if (!existing) {
      return false;
    }
    this.users.delete(userId);
    this.userByEmail.delete(existing.email);
    for (const [tokenHash, session] of this.sessionsByTokenHash.entries()) {
      if (session.userId === userId) {
        this.sessionsByTokenHash.delete(tokenHash);
      }
    }
    return true;
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession> {
    const session: AuthSession = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString()
    };
    this.sessionsByTokenHash.set(session.tokenHash, session);
    return session;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    const session = this.sessionsByTokenHash.get(tokenHash);
    if (!session) {
      return null;
    }
    if (session.revokedAt) {
      return null;
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    return session;
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    const existing = this.sessionsByTokenHash.get(tokenHash);
    if (!existing) {
      return false;
    }
    if (existing.revokedAt) {
      return true;
    }
    this.sessionsByTokenHash.set(tokenHash, {
      ...existing,
      revokedAt: new Date().toISOString()
    });
    return true;
  }
}
