import { del, list, put, type PutBlobResult } from "@vercel/blob";
import type { ArtifactStorage } from "./artifact-storage.js";

export type BlobPutFn = (
  pathname: string,
  body: string | Buffer,
  options: {
    access: "private";
    addRandomSuffix: boolean;
    allowOverwrite: boolean;
    contentType: string;
    token?: string;
  }
) => Promise<Pick<PutBlobResult, "url">>;

export type BlobDelFn = (urlOrPathname: string, options?: { token?: string }) => Promise<void>;

export type BlobListFn = (options: { limit: number; token?: string }) => Promise<unknown>;

export interface BlobArtifactClient {
  put: BlobPutFn;
  del: BlobDelFn;
  list: BlobListFn;
}

export interface BlobArtifactStorageConfig {
  keyPrefix?: string;
  token?: string;
  client?: BlobArtifactClient;
}

function contentTypeFor(format: "json" | "pdf" | "xlsx"): string {
  if (format === "json") {
    return "application/json";
  }
  if (format === "pdf") {
    return "application/pdf";
  }
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function artifactPathname(exportId: string, format: "json" | "pdf" | "xlsx", keyPrefix?: string): string {
  const extension = format === "json" ? "json" : format === "pdf" ? "pdf" : "xlsx";
  const trimmedPrefix = (keyPrefix ?? "").replace(/^\/+|\/+$/g, "");
  return trimmedPrefix ? `${trimmedPrefix}/exports/${exportId}.${extension}` : `exports/${exportId}.${extension}`;
}

const defaultClient: BlobArtifactClient = {
  put: (pathname, body, options) => put(pathname, body, options),
  del,
  list
};

export class BlobArtifactStorage implements ArtifactStorage {
  private readonly client: BlobArtifactClient;

  constructor(private readonly config: BlobArtifactStorageConfig = {}) {
    this.client = config.client ?? defaultClient;
  }

  async saveArtifact(input: {
    exportId: string;
    format: "json" | "pdf" | "xlsx";
    content: string | Buffer;
  }): Promise<string> {
    const pathname = artifactPathname(input.exportId, input.format, this.config.keyPrefix);
    const blob = await this.client.put(pathname, input.content, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: contentTypeFor(input.format),
      token: this.config.token
    });
    return blob.url;
  }

  async deleteArtifact(artifactUri: string): Promise<void> {
    if (!artifactUri) {
      return;
    }
    await this.client.del(artifactUri, { token: this.config.token });
  }

  async healthCheck(): Promise<{ ok: boolean; backend: string; detail?: string }> {
    try {
      await this.client.list({ limit: 1, token: this.config.token });
      return { ok: true, backend: "blob", detail: this.config.keyPrefix || "exports" };
    } catch (error) {
      return {
        ok: false,
        backend: "blob",
        detail: error instanceof Error ? error.message : "Blob store health check failed."
      };
    }
  }
}
