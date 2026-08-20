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
  const artifactStorage = new FileArtifactStorage(process.cwd());
  const exportQueue = new ExportQueueService(store, artifactStorage);
  return buildApp({
    store,
    authStore: new MemoryAuthStore(),
    lockManager: new MemoryLockManager(),
    exportQueue,
    artifactDownloadUrlResolver: new PassthroughArtifactDownloadUrlResolver(),
    artifactStorage
  });
}

async function registerAndGetCookie(app: ReturnType<typeof buildApp>, username: string, email: string) {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { username, email, password: "pass1234!" }
  });
  assert.equal(registerResponse.statusCode, 201);
  const payload = registerResponse.json() as { sessionToken: string; user: { id: string } };
  return {
    cookie: `cdt_session=${encodeURIComponent(payload.sessionToken)}`,
    userId: payload.user.id
  };
}

function ingestItem(input: {
  id: string;
  category: string;
  family: string;
  partNumber: string;
  attributes: Record<string, unknown>;
}) {
  return {
    id: input.id,
    category: input.category,
    family: input.family,
    partNumber: input.partNumber,
    description: `${input.family} ${input.partNumber}`,
    isActive: true,
    stockStatus: "unknown",
    isReviewed: false,
    attributes: input.attributes
  };
}

test("bulk endpoints require an admin account", async () => {
  const app = buildTestApp();
  try {
    const regular = await registerAndGetCookie(app, "regular-bulk", "regular-bulk@example.com");
    const cases: Array<{ method: "POST" | "PUT"; url: string; payload: unknown }> = [
      {
        method: "POST",
        url: "/v1/library/compat/contact-wire/bulk",
        payload: { rows: [{ contactPartId: "a", wirePartId: "b", status: "allowed" }] }
      },
      {
        method: "POST",
        url: "/v1/library/compat/module-contact/bulk",
        payload: { rows: [{ modulePartId: "a", contactPartId: "b", status: "allowed" }] }
      },
      {
        method: "POST",
        url: "/v1/library/compat/module-backshell/bulk",
        payload: { rows: [{ modulePartId: "a", backshellPartId: "b", status: "allowed" }] }
      },
      {
        method: "POST",
        url: "/v1/library/compat/module-strain-relief/bulk",
        payload: { rows: [{ modulePartId: "a", strainReliefPartId: "b", status: "allowed" }] }
      },
      {
        method: "POST",
        url: "/v1/library/components/review/bulk",
        payload: { componentIds: ["a"] }
      },
      {
        method: "PUT",
        url: "/v1/library/awg-cma-reference",
        payload: { rows: [{ awg: "22", cma: 640 }] }
      },
      {
        method: "POST",
        url: "/v1/library/relationships/bulk",
        payload: {
          rows: [{ parentPartId: "a", childPartId: "b", relationshipType: "MATES_WITH", status: "allowed" }]
        }
      }
    ];
    for (const testCase of cases) {
      const asRegular = await app.inject({
        method: testCase.method,
        url: testCase.url,
        headers: { cookie: regular.cookie },
        payload: testCase.payload as Record<string, unknown>
      });
      assert.equal(asRegular.statusCode, 403, `${testCase.url} should reject non-admin accounts`);

      const anonymous = await app.inject({
        method: testCase.method,
        url: testCase.url,
        payload: testCase.payload as Record<string, unknown>
      });
      assert.equal(anonymous.statusCode, 401, `${testCase.url} should reject unauthenticated calls`);
    }
  } finally {
    await app.close();
  }
});

test("bulk contact-wire compat upsert is idempotent and updates on conflict", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-bulk-cw", "meckert@vpc.com");
    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: admin.cookie },
      payload: {
        items: [
          ingestItem({ id: "cnt-1", category: "contact", family: "TP", partNumber: "CNT-1", attributes: { acceptedFamilies: [] } }),
          ingestItem({ id: "wre-1", category: "wire", family: "Single", partNumber: "WRE-1", attributes: { awg: "22", color: "RED" } }),
          ingestItem({ id: "wre-2", category: "wire", family: "Single", partNumber: "WRE-2", attributes: { awg: "24", color: "BLU" } })
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const bulkResponse = await app.inject({
      method: "POST",
      url: "/v1/library/compat/contact-wire/bulk",
      headers: { cookie: admin.cookie },
      payload: {
        rows: [
          { contactPartId: "cnt-1", wirePartId: "wre-1", status: "allowed", crimpClass: "ZZ" },
          { contactPartId: "cnt-1", wirePartId: "wre-2", status: "forbidden" }
        ]
      }
    });
    assert.equal(bulkResponse.statusCode, 200);
    assert.equal(bulkResponse.json().upserted, 2);

    const rerunResponse = await app.inject({
      method: "POST",
      url: "/v1/library/compat/contact-wire/bulk",
      headers: { cookie: admin.cookie },
      payload: {
        rows: [
          { contactPartId: "cnt-1", wirePartId: "wre-1", status: "allowed", crimpClass: "CA" },
          { contactPartId: "cnt-1", wirePartId: "wre-2", status: "forbidden" }
        ]
      }
    });
    assert.equal(rerunResponse.statusCode, 200);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/library/compat/contact-wire",
      headers: { cookie: admin.cookie }
    });
    assert.equal(listResponse.statusCode, 200);
    const items = listResponse.json().items as Array<{
      contactPartId: string;
      wirePartId: string;
      status: string;
      crimpClass?: string;
    }>;
    assert.equal(items.length, 2);
    const updated = items.find((item) => item.wirePartId === "wre-1");
    assert.equal(updated?.crimpClass, "CA");
  } finally {
    await app.close();
  }
});

test("bulk module-contact and module-backshell compat upserts", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-bulk-mc", "meckert@vpc.com");
    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: admin.cookie },
      payload: {
        items: [
          ingestItem({ id: "mod-1", category: "module", family: "DSUB", partNumber: "MOD-1", attributes: { pinIds: [] } }),
          ingestItem({ id: "cnt-2", category: "contact", family: "TP", partNumber: "CNT-2", attributes: { acceptedFamilies: [] } }),
          ingestItem({ id: "bsh-1", category: "backshell", family: "i1", partNumber: "BSH-1", attributes: { fitments: [] } })
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const moduleContactResponse = await app.inject({
      method: "POST",
      url: "/v1/library/compat/module-contact/bulk",
      headers: { cookie: admin.cookie },
      payload: {
        rows: [{ modulePartId: "mod-1", contactPartId: "cnt-2", status: "review", notes: "heuristic", source: "cpq-import" }]
      }
    });
    assert.equal(moduleContactResponse.statusCode, 200);
    assert.equal(moduleContactResponse.json().upserted, 1);

    const moduleBackshellResponse = await app.inject({
      method: "POST",
      url: "/v1/library/compat/module-backshell/bulk",
      headers: { cookie: admin.cookie },
      payload: {
        rows: [{ modulePartId: "mod-1", backshellPartId: "bsh-1", status: "allowed", source: "cpq-import" }]
      }
    });
    assert.equal(moduleBackshellResponse.statusCode, 200);
    assert.equal(moduleBackshellResponse.json().upserted, 1);

    const listMc = await app.inject({
      method: "GET",
      url: "/v1/library/compat/module-contact",
      headers: { cookie: admin.cookie }
    });
    assert.equal(listMc.json().items.length, 1);
    assert.equal(listMc.json().items[0].source, "cpq-import");

    const listMb = await app.inject({
      method: "GET",
      url: "/v1/library/compat/module-backshell",
      headers: { cookie: admin.cookie }
    });
    assert.equal(listMb.json().items.length, 1);

    const designer = await registerAndGetCookie(app, "designer-mc-get", "designer-mc-get@example.com");
    const designerListMc = await app.inject({
      method: "GET",
      url: "/v1/library/compat/module-contact",
      headers: { cookie: designer.cookie }
    });
    assert.equal(designerListMc.statusCode, 200);
    assert.equal(designerListMc.json().items.length, 1);
  } finally {
    await app.close();
  }
});

test("bulk review approves parts and reports missing ids", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-bulk-rev", "meckert@vpc.com");
    const regular = await registerAndGetCookie(app, "regular-bulk-rev", "regular-bulk-rev@example.com");

    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: admin.cookie },
      payload: {
        items: [
          ingestItem({ id: "rev-1", category: "contact", family: "TP", partNumber: "REV-1", attributes: { acceptedFamilies: [] } }),
          ingestItem({ id: "rev-2", category: "contact", family: "TP", partNumber: "REV-2", attributes: { acceptedFamilies: [] } })
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);

    const hiddenBefore = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: { cookie: regular.cookie }
    });
    assert.ok(!hiddenBefore.json().items.some((item: { id: string }) => item.id === "rev-1"));

    const bulkReviewResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/review/bulk",
      headers: { cookie: admin.cookie },
      payload: { componentIds: ["rev-1", "rev-2", "does-not-exist"] }
    });
    assert.equal(bulkReviewResponse.statusCode, 200);
    const reviewResult = bulkReviewResponse.json() as { reviewed: number; missing: string[] };
    assert.equal(reviewResult.reviewed, 2);
    assert.deepEqual(reviewResult.missing, ["does-not-exist"]);

    const visibleAfter = await app.inject({
      method: "GET",
      url: "/v1/library/components",
      headers: { cookie: regular.cookie }
    });
    assert.ok(visibleAfter.json().items.some((item: { id: string }) => item.id === "rev-1"));
    assert.ok(visibleAfter.json().items.some((item: { id: string }) => item.id === "rev-2"));

    const detail = await app.inject({
      method: "GET",
      url: "/v1/library/components/rev-1",
      headers: { cookie: admin.cookie }
    });
    assert.equal(detail.json().isReviewed, true);
    assert.equal(detail.json().reviewedByUserId, admin.userId);
  } finally {
    await app.close();
  }
});

test("awg-cma reference bulk upsert and list roundtrip", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-bulk-cma", "meckert@vpc.com");
    const putResponse = await app.inject({
      method: "PUT",
      url: "/v1/library/awg-cma-reference",
      headers: { cookie: admin.cookie },
      payload: {
        rows: [
          { awg: "20", cma: 1020 },
          { awg: "22", cma: 640 }
        ]
      }
    });
    assert.equal(putResponse.statusCode, 200);
    assert.equal(putResponse.json().upserted, 2);

    const rerunResponse = await app.inject({
      method: "PUT",
      url: "/v1/library/awg-cma-reference",
      headers: { cookie: admin.cookie },
      payload: { rows: [{ awg: "22", cma: 642 }] }
    });
    assert.equal(rerunResponse.statusCode, 200);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/library/awg-cma-reference",
      headers: { cookie: admin.cookie }
    });
    assert.equal(listResponse.statusCode, 200);
    const items = listResponse.json().items as Array<{ awg: string; cma: number }>;
    assert.equal(items.length, 2);
    assert.equal(items.find((item) => item.awg === "22")?.cma, 642);
  } finally {
    await app.close();
  }
});

test("frame ingest, partType filter, and generic relationship CRUD", async () => {
  const app = buildTestApp();
  try {
    const admin = await registerAndGetCookie(app, "admin-vpc-rel", "meckert@vpc.com");
    const ingestResponse = await app.inject({
      method: "POST",
      url: "/v1/library/components/ingest",
      headers: { cookie: admin.cookie },
      payload: {
        items: [
          {
            ...ingestItem({
              id: "frame-ita",
              category: "frame",
              family: "iCon",
              partNumber: "ITA-100",
              attributes: { moduleCapacity: 2, slotIds: ["A", "B"] }
            }),
            partType: "ITA",
            side: "ITA",
            electricalMode: "NONE"
          },
          {
            ...ingestItem({
              id: "mod-ita",
              category: "module",
              family: "iCon",
              partNumber: "MOD-100",
              attributes: { positionCount: 4, pinIds: ["1", "2", "3", "4"] }
            }),
            partType: "MODULE",
            side: "ITA"
          },
          {
            ...ingestItem({
              id: "sim-insert",
              category: "module",
              family: "iCon",
              partNumber: "SIM-100",
              attributes: { slotOccupancy: 1, pinIds: [] }
            }),
            partType: "SIM_INSERT"
          }
        ]
      }
    });
    assert.equal(ingestResponse.statusCode, 201);
    assert.equal(ingestResponse.json().summary.committed, 3);

    const filtered = await app.inject({
      method: "GET",
      url: "/v1/library/components?partType=ITA&side=ITA",
      headers: { cookie: admin.cookie }
    });
    assert.equal(filtered.statusCode, 200);
    const filteredItems = filtered.json().items as Array<{ id: string; partType?: string }>;
    assert.equal(filteredItems.length, 1);
    assert.equal(filteredItems[0]?.id, "frame-ita");

    const upsert = await app.inject({
      method: "PUT",
      url: "/v1/library/relationships",
      headers: { cookie: admin.cookie },
      payload: {
        parentPartId: "frame-ita",
        childPartId: "mod-ita",
        relationshipType: "MODULE_ALLOWED",
        positionType: "MODULE_SLOT",
        parentPositions: ["A", "B"],
        status: "allowed",
        sourceStatus: "CONFIRMED"
      }
    });
    assert.equal(upsert.statusCode, 200);
    const created = upsert.json() as { id: string; status: string };
    assert.equal(created.status, "allowed");

    const bulk = await app.inject({
      method: "POST",
      url: "/v1/library/relationships/bulk",
      headers: { cookie: admin.cookie },
      payload: {
        rows: [
          {
            parentPartId: "frame-ita",
            childPartId: "mod-ita",
            relationshipType: "MODULE_ALLOWED",
            positionType: "MODULE_SLOT",
            parentPositions: ["A"],
            status: "review",
            sourceStatus: "CONDITIONAL_CLEARANCE"
          },
          {
            parentPartId: "mod-ita",
            childPartId: "sim-insert",
            relationshipType: "INSERT_ALLOWED",
            positionType: "SIM_SLOT",
            parentPositions: ["A1"],
            status: "allowed"
          }
        ]
      }
    });
    assert.equal(bulk.statusCode, 200);
    assert.equal(bulk.json().upserted, 2);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/library/relationships?parentPartId=frame-ita",
      headers: { cookie: admin.cookie }
    });
    assert.equal(listed.statusCode, 200);
    const rows = listed.json().items as Array<{ id: string; status: string; parentPositions: string[] }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "review");
    assert.deepEqual(rows[0]?.parentPositions, ["A"]);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/library/relationships?id=${encodeURIComponent(created.id)}`,
      headers: { cookie: admin.cookie }
    });
    assert.equal(deleted.statusCode, 204);
  } finally {
    await app.close();
  }
});
