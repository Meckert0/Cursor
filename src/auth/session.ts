import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const PASSWORD_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function getSessionTtlMs(): number {
  const parsed = Number(process.env.SESSION_TTL_HOURS ?? 24 * 14);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24 * 60 * 60 * 1000;
  }
  return parsed * 60 * 60 * 1000;
}
