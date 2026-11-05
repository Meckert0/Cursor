import type { AccountRole } from "../domain/auth.js";

const DEFAULT_ADMIN_EMAILS = ["meckert@vpc.com"];

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_ADMIN_EMAILS;
  }
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

export function isAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return getAdminEmails().includes(normalized);
}

/** Honor configured admin grants immediately, including accounts saved before the grant existed. */
export function resolveAccountRole(user: { email: string; accountRole: AccountRole }): AccountRole {
  return user.accountRole === "admin" || isAdminEmail(user.email) ? "admin" : "regular";
}
