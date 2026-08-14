import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { runMaintenance } from "../services/maintenance.js";

function readCronSecret(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  const header = request.headers["x-cron-secret"];
  if (typeof header === "string") {
    return header;
  }
  if (Array.isArray(header) && header[0]) {
    return header[0];
  }
  return undefined;
}

function authorizeCron(request: FastifyRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }
  const provided = readCronSecret(request);
  return Boolean(provided) && provided === expected;
}

export function registerMaintenanceRoutes(app: FastifyInstance) {
  const run = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!authorizeCron(request)) {
      return reply.code(401).send({ error: "Unauthorized maintenance request." });
    }
    return runMaintenance({
      exportQueue: app.exportQueue,
      authStore: app.authStore
    });
  };

  app.get("/v1/internal/maintenance", run);
  app.post("/v1/internal/maintenance", run);
}
