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
