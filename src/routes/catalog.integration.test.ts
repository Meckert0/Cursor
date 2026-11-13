import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../app.js";
import { MemoryStore } from "../infra/store/memory-store.js";
import { MemoryAuthStore } from "../infra/auth/memory-auth-store.js";
import { MemoryLockManager } from "../infra/locks/memory-lock-manager.js";
import { FileArtifactStorage } from "../infra/storage/file-artifact-storage.js";
import { PassthroughArtifactDownloadUrlResolver } from "../infra/storage/artifact-download-url-resolver.js";
import { ExportQueueService } from "../services/export-queue.js";
import { makePart } from "../domain/part-test-helpers.js";
import { hashSessionToken } from "../auth/session.js";

test("designers can create only new compatible accessories through the scoped canvas endpoint", async () => {
  const store = new MemoryStore();
  const authStore = new MemoryAuthStore();
  const storage = new FileArtifactStorage(process.cwd());
  const app = buildApp({ store, authStore, lockManager: new MemoryLockManager(), artifactStorage: storage, artifactDownloadUrlResolver: new PassthroughArtifactDownloadUrlResolver(), exportQueue: new ExportQueueService(store, storage) });
  try {
    const session = async (username: string, role: "editor" | "viewer" = "editor") => {
      const user = await authStore.createUser({ username, email: `${username}@example.com`, passwordHash: "unused", role, accountRole: "regular" });
      const token = `session-${username}`;
      await authStore.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000).toISOString() });
      return { user, headers: { cookie: `cdt_session=${token}` } };
    };
    const designer = await session("accessory-designer"), outsider = await session("accessory-outsider"), viewer = await session("accessory-viewer", "viewer");
    const project = await store.createProject({ name: "Accessory project", createdBy: designer.user.id });
    const harness = await store.createDesign({ projectId: project.id, name: "Accessory harness", createdBy: designer.user.id });
    await store.upsertProjectMember({ projectId: project.id, userId: viewer.user.id, role: "viewer" });
    await store.ingestLibraryComponents({ requestedByUserId: "seed", dryRun: false, items: [
      makePart({ id: "module", category: "module", family: "Test", partNumber: "M-1", description: "Module", attributes: { pinIds: ["1"] } }),
      makePart({ id: "blank", category: "module", family: "Blank insert", partNumber: "BLANK", description: "Blank module", attributes: { pinIds: [] } }),
      makePart({ id: "hidden", category: "module", family: "Test", partNumber: "HIDDEN", description: "Private draft", isReviewed: false, attributes: { pinIds: [] } })
    ] });
    const endpoint = "/v1/library/components/compatible-accessory";
    const payload = { harnessId: harness.id, parentPartId: "module", category: "backshell", partNumber: "NEW-BS", family: "Test", description: "A new backshell", attributes: {} };
    assert.equal((await app.inject({ method: "POST", url: endpoint, payload })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: endpoint, headers: outsider.headers, payload })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: endpoint, headers: viewer.headers, payload })).statusCode, 403);
    const created = await app.inject({ method: "POST", url: endpoint, headers: designer.headers, payload });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().part.isReviewed, false);
    assert.equal(created.json().part.createdByUserId, designer.user.id);
    assert.deepEqual(created.json().relationship.targetPartIds, [created.json().part.id]);
    assert.equal(created.json().relationship.relationshipType, "BACKSHELL_ALLOWED");
    const duplicate = await app.inject({ method: "POST", url: endpoint, headers: designer.headers, payload });
    assert.equal(duplicate.statusCode, 409);
    assert.match(duplicate.json().message, /part number already exists/);
    for (const invalid of [
      { ...payload, category: "module" },
      { ...payload, parentPartId: "blank", category: "strain-relief", partNumber: "BLANK-SR" },
      { ...payload, partNumber: "" }
    ]) assert.equal((await app.inject({ method: "POST", url: endpoint, headers: designer.headers, payload: invalid })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: endpoint, headers: designer.headers, payload: { ...payload, parentPartId: "hidden", partNumber: "PRIVATE" } })).statusCode, 404);
    assert.equal((await app.inject({ method: "POST", url: endpoint, headers: designer.headers, payload: { ...payload, category: "strain-relief", partNumber: "NEW-SR" } })).statusCode, 201);
    assert.equal((await app.inject({ method: "PUT", url: "/v1/library/relationships", headers: designer.headers, payload: { parentPartId: "module", targetPartIds: [created.json().part.id], relationshipType: "BACKSHELL_ALLOWED", parentPositions: [], status: "allowed" } })).statusCode, 403, "General compatibility editing remains admin-only");
    const parts = await store.listLibraryComponents({ requestingUserId: designer.user.id, canViewAllUnreviewed: true, canViewInactive: true });
    assert.equal(parts.filter(part => part.category === "backshell").length, 1);
    assert.equal(parts.filter(part => part.category === "strain-relief").length, 1);
  } finally { await app.close(); }
});

test("catalog API validates stable compatibility references, label edits, and media permissions", async () => {
  const store = new MemoryStore();
  const storage = new FileArtifactStorage(process.cwd());
  const app = buildApp({ store, authStore: new MemoryAuthStore(), lockManager: new MemoryLockManager(), artifactStorage: storage, artifactDownloadUrlResolver: new PassthroughArtifactDownloadUrlResolver(), exportQueue: new ExportQueueService(store, storage) });
  try {
    const signIn = async (username: string, email: string) => {
      const response = await app.inject({ method: "POST", url: "/v1/auth/register", payload: { username, email, password: "pass1234!" } });
      assert.equal(response.statusCode, 201);
      return { cookie: `cdt_session=${encodeURIComponent(response.json().sessionToken)}` };
    };
    const headers = await signIn("catalog-admin", "meckert@vpc.com");
    const regular = await signIn("catalog-user", "catalog-user@example.com");
    await store.ingestLibraryComponents({ requestedByUserId: "test", dryRun: false, items: [
      makePart({ id: "frame", category: "frame", family: "Test", partNumber: "F1", description: "Frame", attributes: { slotIds: ["A"] } }),
      makePart({ id: "module", category: "module", family: "Test", partNumber: "M1", description: "Module", attributes: { pinIds: ["1"] } })
    ] });

    const label = await app.inject({ method: "POST", url: "/v1/library/components/ingest", headers, payload: { items: [{
      id: "label", category: "label", partNumber: "00123", description: "Heat shrink label", family: "Test", stockStatus: "unknown",
      attributes: { diaIn: 0.25, fitDiameterMinIn: 0.04, fitDiameterMaxIn: 0.12, printableWidthIn: 0.75, maxCharactersPerLine: 18, maxLines: 2, printProfile: "Mono 8 pt" }
    }] } });
    assert.equal(label.statusCode, 201);
    assert.equal(label.json().summary.committed, 1);
    const patch = (attributes: Record<string, unknown>) => app.inject({ method: "PATCH", url: "/v1/library/components/label", headers, payload: { attributes } });
    assert.equal((await patch({ fitDiameterMaxIn: 0.02 })).statusCode, 400);
    const updated = await patch({ maxLines: 3 });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().attributes.fitDiameterMinIn, 0.04);
    assert.equal(updated.json().attributes.printProfile, "Mono 8 pt");
    assert.equal(updated.json().partNumber, "00123");
    assert.equal((await patch({ maxCharactersPerLine: 1.5 })).statusCode, 400);
    assert.equal((await patch({ maxLines: null })).json().attributes.maxLines, undefined);

    const group = await app.inject({ method: "PUT", url: "/v1/library/relationships", headers, payload: { parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["module"], parentPositions: ["A"], status: "allowed" } });
    assert.equal(group.statusCode, 200);
    assert.deepEqual(group.json().compatibleParts, ["M1"]);
    const invalid = await app.inject({ method: "PUT", url: "/v1/library/relationships", headers, payload: { parentPartId: "frame", relationshipType: "MODULE_ALLOWED", targetPartIds: ["label"], status: "allowed" } });
    assert.equal(invalid.statusCode, 400);
    await store.updateLibraryComponent({ componentId: "module", partNumber: "M2" });
    const renamed = await app.inject({ method: "GET", url: "/v1/library/relationships?parentPartId=frame", headers });
    assert.deepEqual(renamed.json().items[0].compatibleParts, ["M2"]);
    assert.deepEqual(renamed.json().items[0].targetPartIds, ["module"]);

    const mediaBody = { partId: "module", url: "https://example.com/mating.png", mimeType: "image/png", viewType: "mating_face", orientation: "looking_into_mating_face", pixelWidth: 320, pixelHeight: 240, isPrimary: true, caption: "Module mating face" };
    const media = await app.inject({ method: "PUT", url: "/v1/library/media", headers, payload: mediaBody });
    assert.equal(media.statusCode, 200);
    const publicMedia = await app.inject({ method: "GET", url: "/v1/library/components/module/media", headers: regular });
    assert.equal(publicMedia.statusCode, 200);
    assert.equal(publicMedia.json().items[0].orientation, "looking_into_mating_face");
    assert.equal((await app.inject({ method: "PUT", url: "/v1/library/media", headers: regular, payload: mediaBody })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: "/v1/library/media", headers: regular })).statusCode, 403);
    assert.equal((await app.inject({ method: "PUT", url: "/v1/library/media", headers, payload: { ...mediaBody, url: "javascript:alert(1)" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "PUT", url: "/v1/library/media", headers, payload: { ...mediaBody, id: media.json().id, partId: "frame" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: "/v1/library/components/label/media", headers: regular })).statusCode, 404, "Media respects draft item visibility");
    const sideBody = { ...mediaBody, url: "/part-media/vpc-side-profiles/510161101.png", viewType: "side_profile" };
    assert.equal((await app.inject({ method: "PUT", url: "/v1/library/media", headers, payload: sideBody })).statusCode, 200);
    assert.equal((await app.inject({ method: "PUT", url: "/v1/library/media", headers, payload: { ...sideBody, partId: "label" } })).statusCode, 200);
    const sides = await app.inject({ method: "GET", url: "/v1/library/media/side-profiles", headers: regular });
    assert.equal(sides.statusCode, 200);
    assert.deepEqual(sides.json().items.map((row: { partId: string }) => row.partId), ["module"], "Batch side profiles exclude other users' unreviewed parts and other view types");
    await store.updateLibraryComponent({ componentId: "module", isActive: false });
    assert.deepEqual((await app.inject({ method: "GET", url: "/v1/library/media/side-profiles", headers: regular })).json().items, [], "Inactive catalog media stays hidden from ordinary users");
    assert.equal((await app.inject({ method: "GET", url: "/v1/library/media/side-profiles", headers })).json().items.length, 2, "Admins retain visibility into inactive and draft item media");
    assert.ok((await app.inject({ method: "GET", url: "/v1/library/media/side-profiles" })).statusCode >= 400, "Batch media requires authentication");
    for (const url of ["//evil.example/part-media/image.png", "/part-media/../secret.png", "/part-media/%2e%2e/secret.png", "/part-media/a.png?redirect=https://evil.example", "/part-media/a\\b.png", "/other/image.png"]) {
      assert.equal((await app.inject({ method: "PUT", url: "/v1/library/media", headers, payload: { ...sideBody, url } })).statusCode, 400, `Reject unsafe bundled path ${url}`);
    }
    assert.equal((await app.inject({ method: "DELETE", url: `/v1/library/media?id=${media.json().id}&partId=module`, headers })).statusCode, 204);
  } finally { await app.close(); }
});
