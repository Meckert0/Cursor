import Database from "better-sqlite3";
import type {
  Design,
  DesignSnapshot,
  DesignStatus,
  ExportArtifact,
  Project,
  ProjectMember,
  ProjectRulesetPolicy,
  QuoteSubmission,
  Revision,
  RulesetVersion,
  ValidationRun
} from "../../domain/types.js";
import type {
  AwgCmaReference,
  CategoryAttributesMap,
  ContactWireCompat,
  LibraryCategory,
  LibraryIngestResult,
  ModuleBackshellCompat,
  ModuleContactCompat,
  ModuleStrainReliefCompat,
  PartAlias,
  PartIngestItem,
  PartRelationship,
  PartRelationshipInput,
  PartWithAttributes
} from "../../domain/library.js";
import type { TablePreferencesRecord } from "../../domain/table-preferences.js";
import { MemoryStore, type MemoryStoreState } from "./memory-store.js";

type SqliteBootstrap = {
  db: Database.Database;
  state?: MemoryStoreState;
};

function bootstrapDatabase(dbPath: string): SqliteBootstrap {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const row = db.prepare<[string], { payload: string }>(`SELECT payload FROM app_state WHERE id = ?`).get("memory_store");
  if (!row) {
    return { db };
  }
  return { db, state: JSON.parse(row.payload) as MemoryStoreState };
}

export class SqliteStore extends MemoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const bootstrap = bootstrapDatabase(dbPath);
    super(bootstrap.state ? { state: bootstrap.state } : undefined);
    this.db = bootstrap.db;
    this.persistState();
  }

  private persistState() {
    this.db
      .prepare(
        `INSERT INTO app_state (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`
      )
      .run("memory_store", JSON.stringify(this.exportState()), new Date().toISOString());
  }

  override async createProject(input: { name: string; description?: string; createdBy: string }): Promise<Project> {
    const result = await super.createProject(input);
    this.persistState();
    return result;
  }

  override async getUiCopySettings(): Promise<{ projectsHeaderDescription: string; harnessHeaderDescription: string }> {
    return super.getUiCopySettings();
  }

  override async updateUiCopySettings(input: {
    projectsHeaderDescription?: string;
    harnessHeaderDescription?: string;
  }): Promise<{ projectsHeaderDescription: string; harnessHeaderDescription: string }> {
    const result = await super.updateUiCopySettings(input);
    this.persistState();
    return result;
  }

  override async deleteUserData(userId: string): Promise<void> {
    await super.deleteUserData(userId);
    this.persistState();
  }

  override async updateProject(input: { projectId: string; name?: string; description?: string }): Promise<Project | null> {
    const result = await super.updateProject(input);
    this.persistState();
    return result;
  }

  override async deleteProject(projectId: string): Promise<boolean> {
    const result = await super.deleteProject(projectId);
    this.persistState();
    return result;
  }

  override async upsertProjectMember(input: {
    projectId: string;
    userId: string;
    role: ProjectMember["role"];
  }): Promise<ProjectMember> {
    const result = await super.upsertProjectMember(input);
    this.persistState();
    return result;
  }

  override async createDesign(input: {
    projectId: string;
    name: string;
    createdBy: string;
    rulesetVersion?: string;
    libraryVersion?: string;
  }): Promise<import("../../domain/types.js").Design> {
    const result = await super.createDesign(input);
    this.persistState();
    return result;
  }

  override async deleteDesign(designId: string): Promise<boolean> {
    const result = await super.deleteDesign(designId);
    this.persistState();
    return result;
  }

  override async updateDesign(input: {
    designId: string;
    name?: string;
    description?: string;
  }): Promise<import("../../domain/types.js").Design | null> {
    const result = await super.updateDesign(input);
    this.persistState();
    return result;
  }

  override async updateDesignState(input: {
    designId: string;
    targetStatus: DesignStatus;
    expectedCurrentStatus?: DesignStatus;
  }): Promise<import("../../domain/types.js").Design | null> {
    const result = await super.updateDesignState(input);
    this.persistState();
    return result;
  }

  override async createRevision(input: {
    designId: string;
    createdBy: string;
    rulesetVersion: string;
    libraryVersion: string;
    snapshot: DesignSnapshot;
  }): Promise<Revision> {
    const result = await super.createRevision(input);
    this.persistState();
    return result;
  }

  override async updateRevisionSnapshot(input: {
    revisionId: string;
    snapshot: DesignSnapshot;
    expectedSnapshotHash?: string;
  }): Promise<Revision | null> {
    const result = await super.updateRevisionSnapshot(input);
    this.persistState();
    return result;
  }

  override async createValidationRun(input: {
    revisionId: string;
    rulesetVersion: string;
    mode: "quick" | "full";
    snapshotHash: string;
    summary: ValidationRun["summary"];
    results: ValidationRun["results"];
  }): Promise<ValidationRun> {
    const result = await super.createValidationRun(input);
    this.persistState();
    return result;
  }

  override async createQuoteSubmission(input: {
    designId: string;
    revisionId: string;
    validationRunId: string;
    message?: string;
    idempotencyKey?: string;
    estimatedResponseHours: number;
  }): Promise<QuoteSubmission> {
    const result = await super.createQuoteSubmission(input);
    this.persistState();
    return result;
  }

  override async createAuditEvent(input: {
    designId: string;
    eventType: import("../../domain/types.js").AuditEvent["eventType"];
    actorId: string;
    payload: import("../../domain/types.js").AuditEvent["payload"];
  }): Promise<import("../../domain/types.js").AuditEvent> {
    const result = await super.createAuditEvent(input);
    this.persistState();
    return result;
  }

  override async createExportArtifact(input: {
    revisionId: string;
    format: ExportArtifact["format"];
    status: ExportArtifact["status"];
  }): Promise<ExportArtifact> {
    const result = await super.createExportArtifact(input);
    this.persistState();
    return result;
  }

  override async updateExportArtifact(input: {
    exportId: string;
    status: ExportArtifact["status"];
    contentHash?: string;
    artifactUri?: string;
    errorMessage?: string | null;
    attemptCount?: number;
    nextAttemptAt?: string | null;
    failureKind?: ExportArtifact["failureKind"] | null;
  }): Promise<ExportArtifact | null> {
    const result = await super.updateExportArtifact(input);
    this.persistState();
    return result;
  }

  override async deleteExportArtifact(exportId: string): Promise<boolean> {
    const result = await super.deleteExportArtifact(exportId);
    this.persistState();
    return result;
  }

  override async upsertRuleset(input: { version: string; isActive: boolean; notes?: string }): Promise<RulesetVersion> {
    const result = await super.upsertRuleset(input);
    this.persistState();
    return result;
  }

  override async upsertProjectRulesetPolicy(input: {
    projectId: string;
    defaultRulesetVersion?: string;
    allowedRulesetVersions: string[];
    inactivePartSeverity?: "error" | "warning";
    outOfStockSeverity?: "error" | "warning" | "info";
    unreviewedPartSeverity?: "error" | "warning" | "info";
  }): Promise<ProjectRulesetPolicy> {
    const result = await super.upsertProjectRulesetPolicy(input);
    this.persistState();
    return result;
  }

  override async ingestLibraryComponents(input: {
    items: PartIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
    idempotencyKey?: string;
  }): Promise<LibraryIngestResult> {
    const result = await super.ingestLibraryComponents(input);
    if (!input.dryRun) {
      this.persistState();
    }
    return result;
  }

  override async setLibraryComponentReview(input: {
    componentId: string;
    isReviewed: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<PartWithAttributes | null> {
    const result = await super.setLibraryComponentReview(input);
    this.persistState();
    return result;
  }

  override async bulkSetLibraryComponentReview(input: {
    componentIds: string[];
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<{ reviewed: number; missing: string[] }> {
    const result = await super.bulkSetLibraryComponentReview(input);
    this.persistState();
    return result;
  }

  override async archiveLibraryComponent(input: {
    componentId: string;
    archivedByUserId: string;
  }): Promise<PartWithAttributes | null> {
    const result = await super.archiveLibraryComponent(input);
    this.persistState();
    return result;
  }

  override async listArchivedLibraryComponents(): Promise<PartWithAttributes[]> {
    return super.listArchivedLibraryComponents();
  }

  override async restoreLibraryComponent(input: {
    componentId: string;
    restoredByUserId: string;
    reactivate?: boolean;
  }): Promise<PartWithAttributes | null> {
    const result = await super.restoreLibraryComponent(input);
    this.persistState();
    return result;
  }

  override async deleteLibraryComponent(input: { componentId: string }): Promise<boolean> {
    const result = await super.deleteLibraryComponent(input);
    this.persistState();
    return result;
  }

  override async updateLibraryComponent(input: {
    componentId: string;
    partNumber?: string;
    family?: string;
    description?: string;
    isActive?: boolean;
    isReviewed?: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
    stockStatus?: PartWithAttributes["stockStatus"];
    createdByUserId?: string;
    createdAt?: string;
    lastEditedByUserId?: string;
    lastEditedAt?: string;
    editedByUserId?: string;
    partType?: string;
    side?: string;
    notes?: string;
    electricalMode?: string;
    extraAttributes?: Record<string, unknown>;
    attributes?: Partial<CategoryAttributesMap[LibraryCategory]>;
  }): Promise<PartWithAttributes | null> {
    const result = await super.updateLibraryComponent(input);
    this.persistState();
    return result;
  }

  override async upsertContactWireCompat(input: ContactWireCompat): Promise<ContactWireCompat> {
    const result = await super.upsertContactWireCompat(input);
    this.persistState();
    return result;
  }

  override async deleteContactWireCompat(input: { contactPartId: string; wirePartId: string }): Promise<boolean> {
    const result = await super.deleteContactWireCompat(input);
    this.persistState();
    return result;
  }

  override async bulkUpsertContactWireCompat(input: { rows: ContactWireCompat[] }): Promise<{ upserted: number }> {
    const result = await super.bulkUpsertContactWireCompat(input);
    this.persistState();
    return result;
  }

  override async upsertModuleContactCompat(input: ModuleContactCompat): Promise<ModuleContactCompat> {
    const result = await super.upsertModuleContactCompat(input);
    this.persistState();
    return result;
  }

  override async deleteModuleContactCompat(input: {
    modulePartId: string;
    contactPartId: string;
  }): Promise<boolean> {
    const result = await super.deleteModuleContactCompat(input);
    this.persistState();
    return result;
  }

  override async bulkUpsertModuleContactCompat(input: { rows: ModuleContactCompat[] }): Promise<{ upserted: number }> {
    const result = await super.bulkUpsertModuleContactCompat(input);
    this.persistState();
    return result;
  }

  override async upsertModuleBackshellCompat(input: ModuleBackshellCompat): Promise<ModuleBackshellCompat> {
    const result = await super.upsertModuleBackshellCompat(input);
    this.persistState();
    return result;
  }

  override async deleteModuleBackshellCompat(input: {
    modulePartId: string;
    backshellPartId: string;
  }): Promise<boolean> {
    const result = await super.deleteModuleBackshellCompat(input);
    this.persistState();
    return result;
  }

  override async bulkUpsertModuleBackshellCompat(input: { rows: ModuleBackshellCompat[] }): Promise<{ upserted: number }> {
    const result = await super.bulkUpsertModuleBackshellCompat(input);
    this.persistState();
    return result;
  }

  override async upsertModuleStrainReliefCompat(input: ModuleStrainReliefCompat): Promise<ModuleStrainReliefCompat> {
    const result = await super.upsertModuleStrainReliefCompat(input);
    this.persistState();
    return result;
  }

  override async bulkUpsertModuleStrainReliefCompat(input: { rows: ModuleStrainReliefCompat[] }): Promise<{ upserted: number }> {
    const result = await super.bulkUpsertModuleStrainReliefCompat(input);
    this.persistState();
    return result;
  }

  override async deleteModuleStrainReliefCompat(input: {
    modulePartId: string;
    strainReliefPartId: string;
  }): Promise<boolean> {
    const result = await super.deleteModuleStrainReliefCompat(input);
    this.persistState();
    return result;
  }

  override async bulkUpsertAwgCmaReference(input: { rows: AwgCmaReference[] }): Promise<{ upserted: number }> {
    const result = await super.bulkUpsertAwgCmaReference(input);
    this.persistState();
    return result;
  }

  override async upsertPartAlias(input: PartAlias): Promise<PartAlias> {
    const result = await super.upsertPartAlias(input);
    this.persistState();
    return result;
  }

  override async deletePartAlias(input: { codeSystem: string; code: string }): Promise<boolean> {
    const result = await super.deletePartAlias(input);
    this.persistState();
    return result;
  }

  override async upsertPartRelationship(input: PartRelationshipInput): Promise<PartRelationship> {
    const result = await super.upsertPartRelationship(input);
    this.persistState();
    return result;
  }

  override async bulkUpsertPartRelationships(input: { rows: PartRelationshipInput[] }): Promise<{ upserted: number }> {
    const result = await super.bulkUpsertPartRelationships(input);
    this.persistState();
    return result;
  }

  override async deletePartRelationship(input: { id: string }): Promise<boolean> {
    const result = await super.deletePartRelationship(input);
    this.persistState();
    return result;
  }

  override async upsertUserTablePreferences(input: {
    userId: string;
    scope: string;
    columnOrder: string[];
    columnWidths: Record<string, number>;
  }): Promise<TablePreferencesRecord> {
    const result = await super.upsertUserTablePreferences(input);
    this.persistState();
    return result;
  }

  close() {
    this.db.close();
  }
}
