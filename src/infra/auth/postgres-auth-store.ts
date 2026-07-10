import type { Pool } from "pg";
import { getAdminEmails } from "../../auth/admin.js";
import type { UserRole } from "../../auth/rbac.js";
import type { AuthSession, AuthUser } from "../../domain/auth.js";
import type { AuthStore } from "./auth-store.js";

type AuthUserRow = {
  id: string;
  email: string;
  role: UserRole;
  account_role: AuthUser["accountRole"];
  password_hash: string;
  created_at: Date;
};

type AuthSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

function mapUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    accountRole: row.account_role,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString()
  };
}

function mapSession(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : undefined,
    createdAt: row.created_at.toISOString()
  };
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async syncAdminRolesFromEnv(): Promise<void> {
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) {
      return;
    }
    await this.pool.query(
      `UPDATE auth_users
       SET account_role = CASE
         WHEN lower(email) = ANY($1::text[]) THEN 'admin'
         ELSE 'regular'
       END`,
      [adminEmails]
    );
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
      await this.pool.query(
        `INSERT INTO auth_users (id, email, role, account_role, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
        [user.id, user.email, user.role, user.accountRole, user.passwordHash, user.createdAt]
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        const constraint =
          "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
        if (constraint.includes("auth_users_pkey") || constraint.includes("auth_users_id")) {
          throw new Error("USER_USERNAME_EXISTS");
        }
        throw new Error("USER_EMAIL_EXISTS");
      }
      throw error;
    }
    return user;
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(
      `SELECT id, email, role, account_role, password_hash, created_at
       FROM auth_users
       WHERE id = $1`,
      [userId]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(
      `SELECT id, email, role, account_role, password_hash, created_at
       FROM auth_users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async listUsers(): Promise<AuthUser[]> {
    const result = await this.pool.query<AuthUserRow>(
      `SELECT id, email, role, account_role, password_hash, created_at
       FROM auth_users
       ORDER BY email ASC`
    );
    return result.rows.map(mapUser);
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM auth_users WHERE id = $1`, [userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession> {
    const session: AuthSession = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString()
    };
    await this.pool.query(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4::timestamptz, NULL, $5::timestamptz)`,
      [session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt]
    );
    return session;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    const result = await this.pool.query<AuthSessionRow>(
      `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
       FROM auth_sessions
       WHERE token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    if (row.revoked_at) {
      return null;
    }
    if (row.expires_at.getTime() <= Date.now()) {
      return null;
    }
    return mapSession(row);
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE auth_sessions
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [tokenHash]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
