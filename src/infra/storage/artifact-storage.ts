export interface ArtifactStorage {
  saveArtifact(input: {
    exportId: string;
    format: "json" | "pdf" | "xlsx";
    content: string | Buffer;
  }): Promise<string>;
  deleteArtifact(artifactUri: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; backend: string; detail?: string }>;
}
