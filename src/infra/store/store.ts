import type {
  AuditEvent,
  Design,
  DesignSnapshot,
  DesignStatus,
  ExportArtifact,
  ProjectMember,
  ProjectRulesetPolicy,
  Project,
  QuoteSubmission,
  Revision,
  RulesetVersion,
  ValidationRun
} from "../../domain/types.js";
import type {
  LibraryCategory,
  LibraryComponentIngestItem,
  LibraryIngestResult,
  LibraryComponentRecord,
  LibraryReviewQueueRecord,
  LibraryFieldDefinitionRecord
} from "../../domain/library.js";
import type { TablePreferencesRecord } from "../../domain/table-preferences.js";

export interface Store {
  getUiCopySettings(): Promise<{
    projectsHeaderDescription: string;
    harnessHeaderDescription: string;
  }>;
  updateUiCopySettings(input: {
    projectsHeaderDescription?: string;
    harnessHeaderDescription?: string;
  }): Promise<{
    projectsHeaderDescription: string;
    harnessHeaderDescription: string;
  }>;
  deleteUserData(userId: string): Promise<void>;
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  createProject(input: { name: string; description?: string; createdBy: string }): Promise<Project>;
  updateProject(input: { projectId: string; name?: string; description?: string }): Promise<Project | null>;
  deleteProject(projectId: string): Promise<boolean>;
  getProjectMember(projectId: string, userId: string): Promise<ProjectMember | null>;
  upsertProjectMember(input: { projectId: string; userId: string; role: ProjectMember["role"] }): Promise<ProjectMember>;
  listProjectMembers(projectId: string): Promise<ProjectMember[]>;
  listDesignsByProject(projectId: string): Promise<Design[]>;
  createDesign(input: {
    projectId: string;
    name: string;
    createdBy: string;
    rulesetVersion?: string;
    libraryVersion?: string;
  }): Promise<Design>;
  deleteDesign(designId: string): Promise<boolean>;
  getDesign(designId: string): Promise<Design | null>;
  updateDesign(input: { designId: string; name?: string; description?: string }): Promise<Design | null>;
  updateDesignState(input: {
    designId: string;
    targetStatus: DesignStatus;
    expectedCurrentStatus?: DesignStatus;
  }): Promise<Design | null>;
  listRevisions(designId: string): Promise<Revision[]>;
  getRevision(revisionId: string): Promise<Revision | null>;
  createRevision(input: {
    designId: string;
    createdBy: string;
    rulesetVersion: string;
    libraryVersion: string;
    snapshot: DesignSnapshot;
  }): Promise<Revision>;
  updateRevisionSnapshot(input: {
    revisionId: string;
    snapshot: DesignSnapshot;
  }): Promise<Revision | null>;
  createValidationRun(input: {
    revisionId: string;
    rulesetVersion: string;
    mode: "quick" | "full";
    summary: ValidationRun["summary"];
    results: ValidationRun["results"];
  }): Promise<ValidationRun>;
  getValidationRun(validationRunId: string): Promise<ValidationRun | null>;
  getLatestValidationRunForRevision(revisionId: string): Promise<ValidationRun | null>;
  createQuoteSubmission(input: {
    designId: string;
    revisionId: string;
    validationRunId: string;
    message?: string;
    idempotencyKey?: string;
    estimatedResponseHours: number;
  }): Promise<QuoteSubmission>;
  getQuoteSubmission(submissionId: string): Promise<QuoteSubmission | null>;
  listQuoteSubmissionsByDesign(designId: string): Promise<QuoteSubmission[]>;
  findQuoteSubmissionByIdempotencyKey(designId: string, idempotencyKey: string): Promise<QuoteSubmission | null>;
  createAuditEvent(input: {
    designId: string;
    eventType: AuditEvent["eventType"];
    actorId: string;
    payload: AuditEvent["payload"];
  }): Promise<AuditEvent>;
  listAuditEventsByDesign(designId: string): Promise<AuditEvent[]>;
  createExportArtifact(input: {
    revisionId: string;
    format: ExportArtifact["format"];
    status: ExportArtifact["status"];
  }): Promise<ExportArtifact>;
  updateExportArtifact(input: {
    exportId: string;
    status: ExportArtifact["status"];
    contentHash?: string;
    artifactUri?: string;
    errorMessage?: string | null;
    attemptCount?: number;
    nextAttemptAt?: string | null;
    failureKind?: ExportArtifact["failureKind"] | null;
  }): Promise<ExportArtifact | null>;
  getExportArtifact(exportId: string): Promise<ExportArtifact | null>;
  listExportArtifactsByRevision(revisionId: string): Promise<ExportArtifact[]>;
  listExportArtifactsByStatuses(statuses: Array<ExportArtifact["status"]>): Promise<ExportArtifact[]>;
  listExportArtifactsOlderThan(input: {
    olderThanIso: string;
    statuses: Array<ExportArtifact["status"]>;
  }): Promise<ExportArtifact[]>;
  deleteExportArtifact(exportId: string): Promise<boolean>;
  listRulesets(): Promise<RulesetVersion[]>;
  getActiveRuleset(): Promise<RulesetVersion | null>;
  upsertRuleset(input: { version: string; isActive: boolean; notes?: string }): Promise<RulesetVersion>;
  getProjectRulesetPolicy(projectId: string): Promise<ProjectRulesetPolicy | null>;
  upsertProjectRulesetPolicy(input: {
    projectId: string;
    defaultRulesetVersion?: string;
    allowedRulesetVersions: string[];
  }): Promise<ProjectRulesetPolicy>;
  ingestLibraryComponents(input: {
    items: LibraryComponentIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
    idempotencyKey?: string;
  }): Promise<LibraryIngestResult>;
  listLibraryComponents(input: {
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<LibraryComponentRecord[]>;
  getLibraryComponent(input: {
    componentId: string;
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<LibraryComponentRecord | null>;
  setLibraryComponentReview(input: {
    componentId: string;
    isReviewed: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<LibraryComponentRecord | null>;
  archiveLibraryComponent(input: {
    componentId: string;
    archivedByUserId: string;
  }): Promise<LibraryComponentRecord | null>;
  deleteLibraryComponent(input: { componentId: string }): Promise<boolean>;
  updateLibraryComponent(input: {
    componentId: string;
    partNumber?: string;
    family?: string;
    description?: string;
    awg?: string;
    color?: string;
    isActive?: boolean;
    isReviewed?: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
    stockStatus?: LibraryComponentRecord["stockStatus"];
    compatibilityHints?: string[];
    createdByUserId?: string;
    createdAt?: string;
    lastEditedByUserId?: string;
    lastEditedAt?: string;
    editedByUserId?: string;
    customFieldValues?: Record<string, string>;
  }): Promise<LibraryComponentRecord | null>;
  listLibraryFieldDefinitions(input: { category: LibraryCategory }): Promise<LibraryFieldDefinitionRecord[]>;
  createLibraryFieldDefinition(input: {
    category: LibraryCategory;
    key: string;
    label: string;
    valueType: "text";
    isVisibleInViewer: boolean;
    showOnAddForm: boolean;
    showInSearch: boolean;
    createdByUserId: string;
  }): Promise<LibraryFieldDefinitionRecord>;
  updateLibraryFieldDefinition(input: {
    fieldDefinitionId: string;
    label?: string;
    isVisibleInViewer?: boolean;
    showOnAddForm?: boolean;
    showInSearch?: boolean;
  }): Promise<LibraryFieldDefinitionRecord | null>;
  deleteLibraryFieldDefinition(input: { fieldDefinitionId: string }): Promise<boolean>;
  listLibraryReviewQueue(input?: {
    category?: LibraryCategory;
    family?: string;
    enteredByUserId?: string;
  }): Promise<LibraryReviewQueueRecord[]>;
  getUserTablePreferences(input: { userId: string; scope: string }): Promise<TablePreferencesRecord | null>;
  upsertUserTablePreferences(input: {
    userId: string;
    scope: string;
    columnOrder: string[];
    columnWidths: Record<string, number>;
  }): Promise<TablePreferencesRecord>;
}
