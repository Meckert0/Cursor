import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function resolveRequestId(req: IncomingMessage): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  if (Array.isArray(header) && header[0] && header[0].trim().length > 0) {
    return header[0].trim();
  }
  return randomUUID();
}

export function resolveCorrelationId(req: IncomingMessage, requestId: string): string {
  const header = req.headers["x-correlation-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  if (Array.isArray(header) && header[0] && header[0].trim().length > 0) {
    return header[0].trim();
  }
  return requestId;
}
