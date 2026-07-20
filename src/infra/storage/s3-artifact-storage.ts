import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ArtifactStorage } from "./artifact-storage.js";

export interface S3ArtifactStorageConfig {
  bucket: string;
  keyPrefix?: string;
  publicBaseUrl?: string;
}

export class S3ArtifactStorage implements ArtifactStorage {
  constructor(
    private readonly client: S3Client,
    private readonly config: S3ArtifactStorageConfig
  ) {}

  async saveArtifact(input: {
    exportId: string;
    format: "json" | "pdf" | "xlsx";
    content: string | Buffer;
  }): Promise<string> {
    const extension = input.format === "json" ? "json" : input.format === "pdf" ? "pdf" : "xlsx";
    const trimmedPrefix = (this.config.keyPrefix ?? "").replace(/^\/+|\/+$/g, "");
    const key = trimmedPrefix ? `${trimmedPrefix}/exports/${input.exportId}.${extension}` : `exports/${input.exportId}.${extension}`;
    const body = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: input.format === "json"
          ? "application/json"
          : input.format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
    );

    if (this.config.publicBaseUrl) {
      const base = this.config.publicBaseUrl.replace(/\/+$/g, "");
      return `${base}/${key}`;
    }

    return `s3://${this.config.bucket}/${key}`;
  }

  async deleteArtifact(artifactUri: string): Promise<void> {
    const key = this.resolveObjectKey(artifactUri);
    if (!key) {
      return;
    }
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      })
    );
  }

  async healthCheck(): Promise<{ ok: boolean; backend: string; detail?: string }> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.config.bucket
        })
      );
      return { ok: true, backend: "s3", detail: this.config.bucket };
    } catch (error) {
      return {
        ok: false,
        backend: "s3",
        detail: error instanceof Error ? error.message : "S3 bucket health check failed."
      };
    }
  }

  private resolveObjectKey(artifactUri: string): string | null {
    const trimmedPrefix = (this.config.keyPrefix ?? "").replace(/^\/+|\/+$/g, "");
    if (artifactUri.startsWith(`s3://${this.config.bucket}/`)) {
      return artifactUri.slice(`s3://${this.config.bucket}/`.length);
    }
    if (this.config.publicBaseUrl) {
      const base = this.config.publicBaseUrl.replace(/\/+$/g, "");
      if (artifactUri.startsWith(`${base}/`)) {
        return artifactUri.slice(base.length + 1);
      }
    }
    if (trimmedPrefix && artifactUri.includes(`${trimmedPrefix}/exports/`)) {
      const index = artifactUri.indexOf(`${trimmedPrefix}/exports/`);
      return artifactUri.slice(index);
    }
    if (artifactUri.includes("exports/")) {
      const index = artifactUri.indexOf("exports/");
      return artifactUri.slice(index);
    }
    return null;
  }
}
