import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app.js";
import { MemoryLockManager } from "../infra/locks/memory-lock-manager.js";
import { MemoryStore } from "../infra/store/memory-store.js";
import { MemoryAuthStore } from "../infra/auth/memory-auth-store.js";
import { FileArtifactStorage } from "../infra/storage/file-artifact-storage.js";
import { PassthroughArtifactDownloadUrlResolver } from "../infra/storage/artifact-download-url-resolver.js";
import { ExportQueueService } from "../services/export-queue.js";

process.env.ENABLE_LEGACY_HEADER_AUTH = "true";

function buildTestApp() {
  const store = new MemoryStore();
  const exportQueue = new ExportQueueService(store, new FileArtifactStorage(process.cwd()));
  return buildApp({
    store,
    authStore: new MemoryAuthStore(),
    lockManager: new MemoryLockManager(),
    exportQueue,
    artifactDownloadUrlResolver: new PassthroughArtifactDownloadUrlResolver()
  });
}

async function registerAndGetCookie(
  app: ReturnType<typeof buildApp>,
  username: string,
  email: string,
  password = "pass1234!"
) {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { username, email, password }
  });
  assert.equal(registerResponse.statusCode, 201);
  const payload = registerResponse.json() as { sessionToken: string; user: { id: string } };
  return {
    cookie: `cdt_session=${encodeURIComponent(payload.sessionToken)}`,
    userId: payload.user.id
  };
}

test("auth register/login/me/logout lifecycle", async () => {
  const app = buildTestApp();

  try {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "alice", email: "alice@example.com", password: "pass1234!" }
    });
    assert.equal(registerResponse.statusCode, 201);
    const registerPayload = registerResponse.json() as {
      user: { id: string; email: string };
      sessionToken: string;
    };
    assert.equal(registerPayload.user.email, "alice@example.com");
    assert.ok(registerPayload.sessionToken.length > 20);

    const meUnauthorized = await app.inject({
      method: "GET",
      url: "/v1/auth/me"
    });
    assert.equal(meUnauthorized.statusCode, 401);

    const meAuthorized = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        cookie: `cdt_session=${encodeURIComponent(registerPayload.sessionToken)}`
      }
    });
    assert.equal(meAuthorized.statusCode, 200);
    assert.equal(meAuthorized.json().user.email, "alice@example.com");

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        cookie: `cdt_session=${encodeURIComponent(registerPayload.sessionToken)}`
      }
    });
    assert.equal(logoutResponse.statusCode, 204);

    const meAfterLogout = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        cookie: `cdt_session=${encodeURIComponent(registerPayload.sessionToken)}`
      }
    });
    assert.equal(meAfterLogout.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("auth/me does not fabricate users from headers when legacy auth is disabled", async () => {
  const previous = process.env.ENABLE_LEGACY_HEADER_AUTH;
  process.env.ENABLE_LEGACY_HEADER_AUTH = "false";
  const app = buildTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: {
        "x-user-id": "spoofed-user",
        "x-role": "owner"
      }
    });
    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
    if (previous === undefined) {
      delete process.env.ENABLE_LEGACY_HEADER_AUTH;
    } else {
      process.env.ENABLE_LEGACY_HEADER_AUTH = previous;
    }
  }
});

test("project visibility is isolated per authenticated user", async () => {
  const app = buildTestApp();
  try {
    const alice = await registerAndGetCookie(app, "alice2", "alice2@example.com");
    const bob = await registerAndGetCookie(app, "bob2", "bob2@example.com");

    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        cookie: alice.cookie,
        "x-user-id": alice.userId,
        "x-role": "owner"
      },
      payload: {
        name: "Alice Project"
      }
    });
    assert.equal(createProjectResponse.statusCode, 201);

    const listAsAlice = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: {
        cookie: alice.cookie,
        "x-user-id": alice.userId,
        "x-role": "owner"
      }
    });
    assert.equal(listAsAlice.statusCode, 200);
    assert.equal(listAsAlice.json().items.length, 1);

    const listAsBob = await app.inject({
      method: "GET",
      url: "/v1/projects",
      headers: {
        cookie: bob.cookie,
        "x-user-id": bob.userId,
        "x-role": "owner"
      }
    });
    assert.equal(listAsBob.statusCode, 200);
    assert.equal(listAsBob.json().items.length, 0);
  } finally {
    await app.close();
  }
});

test("registration rejects duplicate usernames", async () => {
  const app = buildTestApp();
  try {
    const first = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "shared-name", email: "first@example.com", password: "pass1234!" }
    });
    assert.equal(first.statusCode, 201);

    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "shared-name", email: "second@example.com", password: "pass1234!" }
    });
    assert.equal(duplicate.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("registration assigns account roles by email rule", async () => {
  const app = buildTestApp();
  try {
    const regularRegister = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "regular1", email: "regular1@example.com", password: "pass1234!" }
    });
    assert.equal(regularRegister.statusCode, 201);
    assert.equal(regularRegister.json().user.accountRole, "regular");

    const adminRegister = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "admin1", email: "meckert@vpc.com", password: "pass1234!" }
    });
    assert.equal(adminRegister.statusCode, 201);
    assert.equal(adminRegister.json().user.accountRole, "admin");
  } finally {
    await app.close();
  }
});

test("admin endpoints require admin account and provide project overview", async () => {
  const app = buildTestApp();
  try {
    const regular = await registerAndGetCookie(app, "regular2", "regular2@example.com");
    const admin = await registerAndGetCookie(app, "admin2", "meckert@vpc.com");

    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        cookie: regular.cookie
      },
      payload: {
        name: "Admin visibility project"
      }
    });
    assert.equal(createProjectResponse.statusCode, 201);
    const createdProject = createProjectResponse.json() as { id: string };

    const createHarnessResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${createdProject.id}/harnesses`,
      headers: {
        cookie: regular.cookie
      },
      payload: {
        name: "Admin visibility harness"
      }
    });
    assert.equal(createHarnessResponse.statusCode, 201);

    const regularUsersResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: {
        cookie: regular.cookie
      }
    });
    assert.equal(regularUsersResponse.statusCode, 403);

    const adminUsersResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(adminUsersResponse.statusCode, 200);
    const usersPayload = adminUsersResponse.json() as {
      items: Array<{ email: string; accountRole: "regular" | "admin" }>;
    };
    assert.ok(usersPayload.items.some((entry) => entry.email === "meckert@vpc.com" && entry.accountRole === "admin"));

    const overviewResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/projects-overview",
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(overviewResponse.statusCode, 200);
    const overviewPayload = overviewResponse.json() as {
      items: Array<{
        id: string;
        members: Array<{ userId: string }>;
        harnesses: Array<{ id: string }>;
      }>;
    };
    const targetProject = overviewPayload.items.find((item) => item.id === createdProject.id);
    assert.ok(targetProject);
    assert.ok(targetProject?.members.some((member) => member.userId === regular.userId));
    assert.equal(targetProject?.harnesses.length, 1);
  } finally {
    await app.close();
  }
});

test("admin can update page descriptions and non-admin cannot", async () => {
  const app = buildTestApp();
  try {
    const regular = await registerAndGetCookie(app, "regular3", "regular3@example.com");
    const admin = await registerAndGetCookie(app, "admin3", "meckert@vpc.com");

    const regularUpdateAttempt = await app.inject({
      method: "PUT",
      url: "/v1/admin/ui/page-descriptions",
      headers: {
        cookie: regular.cookie
      },
      payload: {
        projectsHeaderDescription: "Regular cannot update this.",
        harnessHeaderDescription: "Regular cannot update this either."
      }
    });
    assert.equal(regularUpdateAttempt.statusCode, 403);

    const adminUpdate = await app.inject({
      method: "PUT",
      url: "/v1/admin/ui/page-descriptions",
      headers: {
        cookie: admin.cookie
      },
      payload: {
        projectsHeaderDescription: "Admin managed projects copy.",
        harnessHeaderDescription: "Admin managed harness copy."
      }
    });
    assert.equal(adminUpdate.statusCode, 200);

    const regularRead = await app.inject({
      method: "GET",
      url: "/v1/ui/page-descriptions",
      headers: {
        cookie: regular.cookie
      }
    });
    assert.equal(regularRead.statusCode, 200);
    const payload = regularRead.json() as {
      projectsHeaderDescription: string;
      harnessHeaderDescription: string;
    };
    assert.equal(payload.projectsHeaderDescription, "Admin managed projects copy.");
    assert.equal(payload.harnessHeaderDescription, "Admin managed harness copy.");
  } finally {
    await app.close();
  }
});

test("admin user deletion removes owned data and blocks self-delete", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-del", "meckert@vpc.com");
    const victimRegister = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "victim1", email: "victim1@example.com", password: "pass1234!" }
    });
    assert.equal(victimRegister.statusCode, 201);
    const victimPayload = victimRegister.json() as { sessionToken: string; user: { id: string } };
    const victimCookie = `cdt_session=${encodeURIComponent(victimPayload.sessionToken)}`;

    const createProject = await app.inject({
      method: "POST",
      url: "/v1/projects",
      headers: {
        cookie: victimCookie
      },
      payload: {
        name: "Victim project"
      }
    });
    assert.equal(createProject.statusCode, 201);
    const createdProject = createProject.json() as { id: string };

    const createHarness = await app.inject({
      method: "POST",
      url: `/v1/projects/${createdProject.id}/harnesses`,
      headers: {
        cookie: victimCookie
      },
      payload: {
        name: "Victim harness"
      }
    });
    assert.equal(createHarness.statusCode, 201);

    const selfDeleteAttempt = await app.inject({
      method: "DELETE",
      url: `/v1/admin/users/${admin.userId}`,
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(selfDeleteAttempt.statusCode, 400);

    const deleteVictim = await app.inject({
      method: "DELETE",
      url: `/v1/admin/users/${victimPayload.user.id}`,
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(deleteVictim.statusCode, 204);

    const usersResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(usersResponse.statusCode, 200);
    const usersPayload = usersResponse.json() as { items: Array<{ id: string }> };
    assert.ok(!usersPayload.items.some((user) => user.id === victimPayload.user.id));

    const overviewResponse = await app.inject({
      method: "GET",
      url: "/v1/admin/projects-overview",
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(overviewResponse.statusCode, 200);
    const overviewPayload = overviewResponse.json() as { items: Array<{ id: string }> };
    assert.ok(!overviewPayload.items.some((project) => project.id === createdProject.id));

    const victimLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: "victim1@example.com",
        password: "pass1234!"
      }
    });
    assert.equal(victimLogin.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("inactive library items are hidden from regular users but visible to admins", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-lib", "meckert@vpc.com");
    const regular = await registerAndGetCookie(app, "regular-lib", "regular-lib@example.com");

    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: {
        cookie: admin.cookie
      },
      payload: {
        items: [
          {
            id: "cmp-admin-toggle-1",
            category: "contact",
            family: "Toggle Family",
            partNumber: "TOGGLE-001",
            description: "Toggle visibility test component",
            isActive: true,
            stockStatus: "in_stock",
            compatibilityHints: [],
            isReviewed: false
          }
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const reviewResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/cmp-admin-toggle-1/review",
      headers: {
        cookie: admin.cookie
      },
      payload: {}
    });
    assert.equal(reviewResponse.statusCode, 200);

    const deactivateResponse = await app.inject({
      method: "PATCH",
      url: "/v1/library/components/cmp-admin-toggle-1",
      headers: {
        cookie: admin.cookie
      },
      payload: {
        partNumber: "TOGGLE-001",
        family: "Toggle Family",
        description: "Toggle visibility test component",
        isActive: false
      }
    });
    assert.equal(deactivateResponse.statusCode, 200);
    assert.equal(deactivateResponse.json().isActive, false);

    const listAsRegular = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: {
        cookie: regular.cookie
      }
    });
    assert.equal(listAsRegular.statusCode, 200);
    assert.ok(!listAsRegular.json().items.some((item: { id: string }) => item.id === "cmp-admin-toggle-1"));

    const listAsAdmin = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: {
        cookie: admin.cookie
      }
    });
    assert.equal(listAsAdmin.statusCode, 200);
    assert.ok(listAsAdmin.json().items.some((item: { id: string }) => item.id === "cmp-admin-toggle-1"));
  } finally {
    await app.close();
  }
});
