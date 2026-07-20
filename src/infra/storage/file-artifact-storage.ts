import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactStorage } from "./artifact-storage.js";

export class FileArtifactStorage implements ArtifactStorage {
  constructor(private readonly baseDirectory: string) {}

  async saveArtifact(input: {
    exportId: string;
    format: "json" | "pdf" | "xlsx";
    content: string | Buffer;
  }): Promise<string> {
    const dir = path.join(this.baseDirectory, "exports");
    await mkdir(dir, { recursive: true });
    const extension = input.format === "json" ? "json" : input.format === "pdf" ? "pdf" : "xlsx";
    const filePath = path.join(dir, `${input.exportId}.${extension}`);
    if (typeof input.content === "string") {
      await writeFile(filePath, input.content, "utf8");
    } else {
      await writeFile(filePath, input.content);
    }
    return `file://${filePath.replaceAll("\\", "/")}`;
  }

  async deleteArtifact(artifactUri: string): Promise<void> {
    if (!artifactUri.startsWith("file://")) {
      return;
    }
    const filePath = artifactUri.replace(/^file:\/\//, "");
    const normalized = process.platform === "win32" ? filePath.replace(/^\/([A-Za-z]:\/)/, "$1") : filePath;
    try {
      await unlink(path.normalize(normalized));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; backend: string; detail?: string }> {
    try {
      await mkdir(this.baseDirectory, { recursive: true });
      await access(this.baseDirectory);
      return { ok: true, backend: "file", detail: this.baseDirectory };
    } catch (error) {
      return {
        ok: false,
        backend: "file",
        detail: error instanceof Error ? error.message : "Artifact directory is not accessible."
      };
    }
  }
}
