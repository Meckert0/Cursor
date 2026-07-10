import Database from "better-sqlite3";
import type { UserRole } from "../../auth/rbac.js";
import type { AuthSession, AuthUser } from "../../domain/auth.js";
import type { AuthStore } from "./auth-store.js";

const ADMIN_EMAIL = "meckert@vpc.com";

export class SqliteAuthStore implements AuthStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        account_role TEXT NOT NULL DEFAULT 'regular',
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
      );
    `);
    this.ensureAccountRoleColumn();
  }

  private ensureAccountRoleColumn() {
    const columns = this.db.prepare<[], { name: string }>(`PRAGMA table_info(auth_users)`).all();
    const hasAccountRole = columns.some((column) => column.name === "account_role");
    if (!hasAccountRole) {
      this.db.exec(`ALTER TABLE auth_users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'regular';`);
    }
    this.db
      .prepare(`UPDATE auth_users SET account_role = ? WHERE lower(email) = ?`)
      .run("admin", ADMIN_EMAIL);
    this.db
      .prepare(`UPDATE auth_users SET account_role = ? WHERE lower(email) <> ?`)
      .run("regular", ADMIN_EMAIL);
  }

  async createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    accountRole: AuthUser["accountRole"];
  }): Promise<AuthUser> {
    const user: AuthUser = {
      id: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      accountRole: input.accountRole,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString()
    };
    try {
      this.db
        .prepare(
          `INSERT INTO auth_users (id, email, role, account_role, password_hash, created_at) VALUES (@id, @email, @role, @accountRole, @passwordHash, @createdAt)`
        )
        .run(user);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        if (error.message.includes("auth_users.id")) {
          throw new Error("USER_USERNAME_EXISTS");
        }
        throw new Error("USER_EMAIL_EXISTS");
      }
      throw error;
    }
    return user;
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const row = this.db
      .prepare<
        [string],
        { id: string; email: string; role: UserRole; account_role: AuthUser["accountRole"]; password_hash: string; created_at: string }
      >(
        `SELECT id, email, role, account_role, password_hash, created_at FROM auth_users WHERE id = ?`
      )
      .get(userId);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      accountRole: row.account_role,
      passwordHash: row.password_hash,
      createdAt: row.created_at
    };
  }

  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const row = this.db
      .prepare<
        [string],
        { id: string; email: string; role: UserRole; account_role: AuthUser["accountRole"]; password_hash: string; created_at: string }
      >(
        `SELECT id, email, role, account_role, password_hash, created_at FROM auth_users WHERE email = ?`
      )
      .get(email.trim().toLowerCase());
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      accountRole: row.account_role,
      passwordHash: row.password_hash,
      createdAt: row.created_at
    };
  }

  async listUsers(): Promise<AuthUser[]> {
    const rows = this.db
      .prepare<[], { id: string; email: string; role: UserRole; account_role: AuthUser["accountRole"]; password_hash: string; created_at: string }>(
        `SELECT id, email, role, account_role, password_hash, created_at FROM auth_users ORDER BY email ASC`
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      accountRole: row.account_role,
      passwordHash: row.password_hash,
      createdAt: row.created_at
    }));
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM auth_users WHERE id = ?`).run(userId);
    return result.changes > 0;
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession> {
    const session: AuthSession = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (@id, @userId, @tokenHash, @expiresAt, @revokedAt, @createdAt)`
      )
      .run({
        ...session,
        revokedAt: null
      });
    return session;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    const row = this.db
      .prepare<
        [string],
        { id: string; user_id: string; token_hash: string; expires_at: string; revoked_at: string | null; created_at: string }
      >(
        `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at FROM auth_sessions WHERE token_hash = ?`
      )
      .get(tokenHash);
    if (!row) {
      return null;
    }
    if (row.revoked_at) {
      return null;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined,
      createdAt: row.created_at
    };
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?`)
      .run(new Date().toISOString(), tokenHash);
    return result.changes > 0;
  }

  close() {
    this.db.close();
  }
}
