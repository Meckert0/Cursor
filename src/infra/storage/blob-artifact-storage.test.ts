import assert from "node:assert/strict";
import test from "node:test";
import { BlobDownloadUrlResolver } from "./artifact-download-url-resolver.js";
import { BlobArtifactStorage, type BlobArtifactClient } from "./blob-artifact-storage.js";

function createMockClient(overrides: Partial<BlobArtifactClient> = {}): BlobArtifactClient & {
  puts: Array<{ pathname: string; options: Record<string, unknown> }>;
  deleted: string[];
} {
  const puts: Array<{ pathname: string; options: Record<string, unknown> }> = [];
  const deleted: string[] = [];
  return {
    puts,
    deleted,
    async put(pathname, _body, options) {
      puts.push({ pathname, options });
      return { url: `https://blob.example/${pathname}` };
    },
    async del(urlOrPathname) {
      deleted.push(urlOrPathname);
    },
    async list() {
      return { blobs: [], hasMore: false };
    },
    ...overrides
  };
}

test("BlobArtifactStorage puts private overwriteable objects and returns the blob URL", async () => {
  const client = createMockClient();
  const storage = new BlobArtifactStorage({ keyPrefix: "cdt", token: "blob-token", client });

  const uri = await storage.saveArtifact({
    exportId: "exp-1",
    format: "pdf",
    content: Buffer.from("pdf")
  });

  assert.equal(uri, "https://blob.example/cdt/exports/exp-1.pdf");
  assert.equal(client.puts.length, 1);
  assert.equal(client.puts[0]?.pathname, "cdt/exports/exp-1.pdf");
  assert.deepEqual(client.puts[0]?.options, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/pdf",
    token: "blob-token"
  });
});

test("BlobArtifactStorage deletes by stored URL and reports blob health", async () => {
  const client = createMockClient();
  const storage = new BlobArtifactStorage({ client });
  const uri = "https://blob.example/exports/exp-2.json";

  await storage.deleteArtifact(uri);
  assert.deepEqual(client.deleted, [uri]);

  const health = await storage.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(health.backend, "blob");
});

test("BlobArtifactStorage healthCheck surfaces list failures", async () => {
  const client = createMockClient({
    async list() {
      throw new Error("token missing");
    }
  });
  const storage = new BlobArtifactStorage({ client });
  const health = await storage.healthCheck();
  assert.equal(health.ok, false);
  assert.equal(health.backend, "blob");
  assert.match(health.detail ?? "", /token missing/);
});

test("BlobDownloadUrlResolver returns the head() downloadUrl", async () => {
  const resolver = new BlobDownloadUrlResolver(async (url) => {
    assert.equal(url, "https://blob.example/exports/exp-3.xlsx");
    return { downloadUrl: "https://blob.example/exports/exp-3.xlsx?download=1" };
  });

  const downloadUrl = await resolver.resolveDownloadUrl("https://blob.example/exports/exp-3.xlsx");
  assert.equal(downloadUrl, "https://blob.example/exports/exp-3.xlsx?download=1");
});
