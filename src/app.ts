import Fastify from "fastify";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import type { ArtifactDownloadUrlResolver } from "./infra/storage/artifact-download-url-resolver.js";
import type { ExportQueueService } from "./services/export-queue.js";
import type { LockManager } from "./infra/locks/lock-manager.js";
import type { Store } from "./infra/store/store.js";
import type { AuthStore } from "./infra/auth/auth-store.js";
import { hashSessionToken, parseCookieHeader } from "./auth/session.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDesignRoutes } from "./routes/designs.js";
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
}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  app.register(sensible);
  app.register(cookie);

  app.decorate("store", deps.store);
  app.decorate("authStore", deps.authStore);
  app.decorate("lockManager", deps.lockManager);
  app.decorate("exportQueue", deps.exportQueue);
  app.decorate("artifactDownloadUrlResolver", deps.artifactDownloadUrlResolver);

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

  app.get("/v1/health", async () => {
    return { ok: true, service: "cdt-api", now: new Date().toISOString() };
  });

  registerAuthRoutes(app);
  registerProjectRoutes(app);
  registerLibraryRoutes(app);
  registerDesignRoutes(app);
  registerRevisionRoutes(app);
  registerRulesetRoutes(app);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    store: Store;
    authStore: AuthStore;
    lockManager: LockManager;
    exportQueue: ExportQueueService;
    artifactDownloadUrlResolver: ArtifactDownloadUrlResolver;
  }

  interface FastifyRequest {
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
