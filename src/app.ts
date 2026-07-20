import Fastify from "fastify";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import { buildHealthReport } from "./infra/observability/health.js";
import { metricsRegistry, type MetricsRegistry } from "./infra/observability/metrics.js";
import { resolveCorrelationId, resolveRequestId } from "./infra/observability/request-ids.js";
import type { ArtifactDownloadUrlResolver } from "./infra/storage/artifact-download-url-resolver.js";
import type { ArtifactStorage } from "./infra/storage/artifact-storage.js";
import type { ExportQueueService } from "./services/export-queue.js";
import type { LockManager } from "./infra/locks/lock-manager.js";
import type { Store } from "./infra/store/store.js";
import type { AuthStore } from "./infra/auth/auth-store.js";
import { hashSessionToken, parseCookieHeader } from "./auth/session.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDesignRoutes } from "./routes/designs.js";
import { registerE2eHookRoutes } from "./routes/e2e-hooks.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerRevisionRoutes } from "./routes/revisions.js";
import { registerRulesetRoutes } from "./routes/rulesets.js";

export function buildApp(deps: {
  store: Store;
  authStore: AuthStore;
  lockManager: LockManager;
  exportQueue: ExportQueueService;
  artifactDownloadUrlResolver: ArtifactDownloadUrlResolver;
  artifactStorage: ArtifactStorage;
  metrics?: MetricsRegistry;
}) {
  const metrics = deps.metrics ?? metricsRegistry;
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    },
    genReqId: resolveRequestId,
    requestIdHeader: "x-request-id"
  });

  app.register(sensible);
  app.register(cookie);

  app.decorate("store", deps.store);
  app.decorate("authStore", deps.authStore);
  app.decorate("lockManager", deps.lockManager);
  app.decorate("exportQueue", deps.exportQueue);
  app.decorate("artifactDownloadUrlResolver", deps.artifactDownloadUrlResolver);
  app.decorate("artifactStorage", deps.artifactStorage);
  app.decorate("metrics", metrics);
  app.decorateRequest("correlationId", "");

  deps.exportQueue.setLogger({
    info: (obj, msg) => app.log.info(obj, msg),
    warn: (obj, msg) => app.log.warn(obj, msg),
    error: (obj, msg) => app.log.error(obj, msg)
  });

  app.addHook("onRequest", async (request, reply) => {
    const correlationId = resolveCorrelationId(request.raw, request.id);
    request.correlationId = correlationId;
    reply.header("x-request-id", request.id);
    reply.header("x-correlation-id", correlationId);
  });

  app.addHook("onRequest", async (request) => {
    const rawUrl = request.raw.url;
    if (!rawUrl) {
      return;
    }

    if (rawUrl.includes("/v1/projects/") && rawUrl.includes("/harnesses")) {
      request.raw.url = rawUrl.replace("/harnesses", "/designs");
      return;
    }

    if (rawUrl.includes("/v1/harnesses/")) {
      request.raw.url = rawUrl.replace("/v1/harnesses/", "/v1/designs/");
    }
  });

  app.addHook("onRequest", async (request) => {
    const cookieHeader = request.headers.cookie;
    const parsedCookies = parseCookieHeader(Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader);
    const token = parsedCookies.cdt_session;
    if (!token) {
      return;
    }

    const session = await app.authStore.getSessionByTokenHash(hashSessionToken(token));
    if (!session) {
      return;
    }

    const user = await app.authStore.getUserById(session.userId);
    if (!user) {
      return;
    }

    request.currentSessionToken = token;
    request.currentUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      accountRole: user.accountRole,
      createdAt: user.createdAt
    };
  });

  app.get("/v1/health", async (_request, reply) => {
    const report = await buildHealthReport({
      store: app.store,
      lockManager: app.lockManager,
      artifactStorage: app.artifactStorage
    });
    if (!report.ok) {
      return reply.code(503).send(report);
    }
    return report;
  });

  app.get("/v1/metrics", async () => {
    return {
      service: "cdt-api",
      now: new Date().toISOString(),
      metrics: app.metrics.snapshot()
    };
  });

  registerAuthRoutes(app);
  registerProjectRoutes(app);
  registerLibraryRoutes(app);
  registerDesignRoutes(app);
  registerRevisionRoutes(app);
  registerRulesetRoutes(app);

  if ((process.env.ENABLE_E2E_HOOKS ?? "false").toLowerCase() === "true") {
    registerE2eHookRoutes(app);
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    store: Store;
    authStore: AuthStore;
    lockManager: LockManager;
    exportQueue: ExportQueueService;
    artifactDownloadUrlResolver: ArtifactDownloadUrlResolver;
    artifactStorage: ArtifactStorage;
    metrics: MetricsRegistry;
  }

  interface FastifyRequest {
    correlationId: string;
    currentSessionToken?: string;
    currentUser?: {
      id: string;
      email: string;
      role: import("./auth/rbac.js").UserRole;
      accountRole: import("./domain/auth.js").AccountRole;
      createdAt: string;
    };
  }
}
