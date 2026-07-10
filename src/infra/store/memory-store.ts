import type {
  AuditEvent,
  Design,
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
import {
  DEFAULT_LIBRARY_COMPONENTS,
  type LibraryCategory,
  type LibraryComponentRecord,
  type LibraryComponentIngestItem,
  type LibraryIngestResult,
  type LibraryFieldDefinitionRecord,
  type LibraryReviewQueueRecord
} from "../../domain/library.js";
import {
  BUILTIN_FIELDS_BY_CATEGORY,
  builtinFieldDefinitionId
} from "../../domain/library-builtin-fields.js";
import type { TablePreferencesRecord } from "../../domain/table-preferences.js";
import type { Store } from "./store.js";

const EMPTY_SNAPSHOT = {
  connectors: [],
  paths: [],
  pinMappings: [],
  bundles: [],
  annotations: []
};

type UiCopySettings = {
  projectsHeaderDescription: string;
  harnessHeaderDescription: string;
};

const DEFAULT_UI_COPY_SETTINGS: UiCopySettings = {
  projectsHeaderDescription: "Projects are collections of cable designs. They can be used to keep cable designs separate.",
  harnessHeaderDescription:
    "Drag connectors to define a visual harness shape. Connector positions are carried forward in Details. Use node handles to drag-connect paths directly on canvas, including connector-to-junction topology."
};

function getDefaultFieldDefinitions(): LibraryFieldDefinitionRecord[] {
  const now = new Date().toISOString();
  return (Object.keys(BUILTIN_FIELDS_BY_CATEGORY) as LibraryCategory[]).flatMap((category) =>
    BUILTIN_FIELDS_BY_CATEGORY[category].map((field) => ({
      id: builtinFieldDefinitionId(category, field.key),
      category,
      key: field.key,
      label: field.label,
      valueType: "text",
      isSystem: true,
      isVisibleInViewer: field.isVisibleInViewer,
      showOnAddForm: field.showOnAddForm ?? false,
      showInSearch: field.showInSearch ?? false,
      createdByUserId: "system-user",
      createdAt: now,
      updatedAt: now
    }))
  );
}

type StoredLibraryComponent = LibraryComponentRecord & {
  enteredByUserId: string;
  enteredAt: string;
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  isArchived: boolean;
};

export interface MemoryStoreState {
  uiCopySettings?: {
    projectsHeaderDescription: string;
    harnessHeaderDescription: string;
  };
  projects: Project[];
  designs: Design[];
  revisions: Revision[];
  validationRuns: ValidationRun[];
  quoteSubmissions: QuoteSubmission[];
  auditEvents: AuditEvent[];
  exports: ExportArtifact[];
  rulesets: RulesetVersion[];
  projectRulesetPolicies: ProjectRulesetPolicy[];
  projectMembers: ProjectMember[];
  libraryIngestResultsByIdempotencyKey: Array<{ key: string; value: LibraryIngestResult }>;
  libraryComponents: StoredLibraryComponent[];
  libraryFieldDefinitions: LibraryFieldDefinitionRecord[];
  userTablePreferences: TablePreferencesRecord[];
}

export class MemoryStore implements Store {
  private uiCopySettings = { ...DEFAULT_UI_COPY_SETTINGS };
  private readonly projects = new Map<string, Project>();
  private readonly designs = new Map<string, Design>();
  private readonly revisions = new Map<string, Revision>();
  private readonly revisionByDesign = new Map<string, Revision[]>();
  private readonly validationRuns = new Map<string, ValidationRun>();
  private readonly quoteSubmissions = new Map<string, QuoteSubmission>();
  private readonly auditEvents = new Map<string, AuditEvent>();
  private readonly exports = new Map<string, ExportArtifact>();
  private readonly rulesets = new Map<string, RulesetVersion>();
  private readonly projectRulesetPolicies = new Map<string, ProjectRulesetPolicy>();
  private readonly projectMembers = new Map<string, ProjectMember>();
  private readonly libraryIngestResultsByIdempotencyKey = new Map<string, LibraryIngestResult>();
  private readonly libraryComponents = new Map<string, StoredLibraryComponent>();
  private readonly libraryFieldDefinitions = new Map<string, LibraryFieldDefinitionRecord>();
  private readonly userTablePreferences = new Map<string, TablePreferencesRecord>();

  constructor(input?: { state?: MemoryStoreState }) {
    if (input?.state) {
      this.applyState(input.state);
      return;
    }

    const now = new Date().toISOString();
    this.rulesets.set("rules-2026.03", {
      version: "rules-2026.03",
      isActive: true,
      notes: "Default ruleset.",
      createdAt: now,
      updatedAt: now
    });
    for (const component of DEFAULT_LIBRARY_COMPONENTS) {
      this.libraryComponents.set(component.id, {
        ...component,
        customFieldValues: component.customFieldValues ?? {},
        enteredByUserId: "seed",
        enteredAt: component.updatedAt,
        isReviewed: true,
        reviewedByUserId: "seed",
        reviewedAt: component.updatedAt,
        isArchived: false
      });
    }
    for (const definition of getDefaultFieldDefinitions()) {
      this.libraryFieldDefinitions.set(definition.id, definition);
    }
  }

  static fromState(state: MemoryStoreState): MemoryStore {
    return new MemoryStore({ state });
  }

  exportState(): MemoryStoreState {
    return {
      uiCopySettings: { ...this.uiCopySettings },
      projects: Array.from(this.projects.values()),
      designs: Array.from(this.designs.values()),
      revisions: Array.from(this.revisions.values()),
      validationRuns: Array.from(this.validationRuns.values()),
      quoteSubmissions: Array.from(this.quoteSubmissions.values()),
      auditEvents: Array.from(this.auditEvents.values()),
      exports: Array.from(this.exports.values()),
      rulesets: Array.from(this.rulesets.values()),
      projectRulesetPolicies: Array.from(this.projectRulesetPolicies.values()),
      projectMembers: Array.from(this.projectMembers.values()),
      libraryIngestResultsByIdempotencyKey: Array.from(this.libraryIngestResultsByIdempotencyKey.entries()).map(([key, value]) => ({
        key,
        value
      })),
      libraryComponents: Array.from(this.libraryComponents.values()),
      libraryFieldDefinitions: Array.from(this.libraryFieldDefinitions.values()),
      userTablePreferences: Array.from(this.userTablePreferences.values())
    };
  }

  private applyState(state: MemoryStoreState) {
    this.uiCopySettings = {
      projectsHeaderDescription:
        state.uiCopySettings?.projectsHeaderDescription?.trim() || DEFAULT_UI_COPY_SETTINGS.projectsHeaderDescription,
      harnessHeaderDescription:
        state.uiCopySettings?.harnessHeaderDescription?.trim() || DEFAULT_UI_COPY_SETTINGS.harnessHeaderDescription
    };

    this.projects.clear();
    for (const project of state.projects) {
      this.projects.set(project.id, project);
    }

    this.designs.clear();
    for (const design of state.designs) {
      this.designs.set(design.id, design);
    }

    this.revisions.clear();
    for (const revision of state.revisions) {
      this.revisions.set(revision.id, revision);
    }

    this.revisionByDesign.clear();
    for (const revision of state.revisions) {
      const existing = this.revisionByDesign.get(revision.designId) ?? [];
      this.revisionByDesign.set(revision.designId, [...existing, revision]);
    }
    for (const [designId, revisions] of this.revisionByDesign.entries()) {
      this.revisionByDesign.set(
        designId,
        revisions.slice().sort((left, right) => left.revisionNumber - right.revisionNumber)
      );
    }

    this.validationRuns.clear();
    for (const run of state.validationRuns) {
      this.validationRuns.set(run.id, run);
    }

    this.quoteSubmissions.clear();
    for (const submission of state.quoteSubmissions) {
      this.quoteSubmissions.set(submission.id, submission);
    }

    this.auditEvents.clear();
    for (const event of state.auditEvents) {
      this.auditEvents.set(event.id, event);
    }

    this.exports.clear();
    for (const artifact of state.exports) {
      this.exports.set(artifact.id, {
        ...artifact,
        attemptCount: artifact.attemptCount ?? 0
      });
    }

    this.rulesets.clear();
    for (const ruleset of state.rulesets) {
      this.rulesets.set(ruleset.version, ruleset);
    }

    this.projectRulesetPolicies.clear();
    for (const policy of state.projectRulesetPolicies) {
      this.projectRulesetPolicies.set(policy.projectId, policy);
    }

    this.projectMembers.clear();
    for (const member of state.projectMembers) {
      this.projectMembers.set(`${member.projectId}:${member.userId}`, member);
    }

    this.libraryIngestResultsByIdempotencyKey.clear();
    for (const entry of state.libraryIngestResultsByIdempotencyKey) {
      this.libraryIngestResultsByIdempotencyKey.set(entry.key, entry.value);
    }

    this.libraryComponents.clear();
    for (const component of state.libraryComponents) {
      this.libraryComponents.set(component.id, {
        ...component,
        customFieldValues: component.customFieldValues ?? {},
        createdByUserId: component.createdByUserId ?? component.enteredByUserId ?? "system-user",
        createdAt: component.createdAt ?? component.enteredAt ?? component.updatedAt,
        lastEditedByUserId: component.lastEditedByUserId ?? component.enteredByUserId ?? "system-user",
        lastEditedAt: component.lastEditedAt ?? component.updatedAt
      });
    }

    this.libraryFieldDefinitions.clear();
    const loadedDefinitions = state.libraryFieldDefinitions ?? getDefaultFieldDefinitions();
    for (const definition of loadedDefinitions) {
      this.libraryFieldDefinitions.set(definition.id, {
        ...definition,
        showOnAddForm: definition.showOnAddForm ?? false,
        showInSearch: definition.showInSearch ?? false
      });
    }
    const existingByCategoryAndKey = new Set(
      Array.from(this.libraryFieldDefinitions.values()).map((definition) => `${definition.category}:${definition.key}`)
    );
    for (const defaultDefinition of getDefaultFieldDefinitions()) {
      const compositeKey = `${defaultDefinition.category}:${defaultDefinition.key}`;
      if (existingByCategoryAndKey.has(compositeKey)) {
        continue;
      }
      this.libraryFieldDefinitions.set(defaultDefinition.id, defaultDefinition);
      existingByCategoryAndKey.add(compositeKey);
    }

    this.userTablePreferences.clear();
    for (const preference of state.userTablePreferences ?? []) {
      this.userTablePreferences.set(`${preference.userId}:${preference.scope}`, {
        ...preference
      });
    }
  }

  async listProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getUiCopySettings(): Promise<{ projectsHeaderDescription: string; harnessHeaderDescription: string }> {
    return {
      projectsHeaderDescription: this.uiCopySettings.projectsHeaderDescription,
      harnessHeaderDescription: this.uiCopySettings.harnessHeaderDescription
    };
  }

  async updateUiCopySettings(input: {
    projectsHeaderDescription?: string;
    harnessHeaderDescription?: string;
  }): Promise<{ projectsHeaderDescription: string; harnessHeaderDescription: string }> {
    const nextProjectsHeaderDescription = input.projectsHeaderDescription?.trim();
    const nextHarnessHeaderDescription = input.harnessHeaderDescription?.trim();
    this.uiCopySettings = {
      projectsHeaderDescription:
        nextProjectsHeaderDescription && nextProjectsHeaderDescription.length > 0
          ? nextProjectsHeaderDescription
          : this.uiCopySettings.projectsHeaderDescription,
      harnessHeaderDescription:
        nextHarnessHeaderDescription && nextHarnessHeaderDescription.length > 0
          ? nextHarnessHeaderDescription
          : this.uiCopySettings.harnessHeaderDescription
    };
    return this.getUiCopySettings();
  }

  async deleteUserData(userId: string): Promise<void> {
    const ownedProjectIds = Array.from(this.projects.values())
      .filter((project) => project.createdBy === userId)
      .map((project) => project.id);
    for (const projectId of ownedProjectIds) {
      await this.deleteProject(projectId);
    }
    for (const [key, member] of this.projectMembers.entries()) {
      if (member.userId === userId) {
        this.projectMembers.delete(key);
      }
    }
    for (const [key, preference] of this.userTablePreferences.entries()) {
      if (preference.userId === userId) {
        this.userTablePreferences.delete(key);
      }
    }
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) ?? null;
  }

  async createProject(input: { name: string; description?: string; createdBy: string }): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(project.id, project);
    await this.upsertProjectMember({ projectId: project.id, userId: input.createdBy, role: "owner" });
    if (input.createdBy !== "system-user") {
      await this.upsertProjectMember({ projectId: project.id, userId: "system-user", role: "owner" });
    }
    return project;
  }

  async updateProject(input: { projectId: string; name?: string; description?: string }): Promise<Project | null> {
    const existing = this.projects.get(input.projectId);
    if (!existing) {
      return null;
    }
    const updated: Project = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      updatedAt: new Date().toISOString()
    };
    this.projects.set(input.projectId, updated);
    return updated;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const existing = this.projects.get(projectId);
    if (!existing) {
      return false;
    }

    const designIds = Array.from(this.designs.values())
      .filter((design) => design.projectId === projectId)
      .map((design) => design.id);
    const revisionIds = Array.from(this.revisions.values())
      .filter((revision) => designIds.includes(revision.designId))
      .map((revision) => revision.id);

    for (const designId of designIds) {
      this.designs.delete(designId);
      this.revisionByDesign.delete(designId);
    }

    for (const revisionId of revisionIds) {
      this.revisions.delete(revisionId);
    }

    for (const [key, run] of this.validationRuns.entries()) {
      if (revisionIds.includes(run.revisionId)) {
        this.validationRuns.delete(key);
      }
    }

    for (const [key, artifact] of this.exports.entries()) {
      if (revisionIds.includes(artifact.revisionId)) {
        this.exports.delete(key);
      }
    }

    for (const [key, submission] of this.quoteSubmissions.entries()) {
      if (designIds.includes(submission.designId) || revisionIds.includes(submission.revisionId)) {
        this.quoteSubmissions.delete(key);
      }
    }

    for (const [key, event] of this.auditEvents.entries()) {
      if (designIds.includes(event.designId)) {
        this.auditEvents.delete(key);
      }
    }

    for (const [key, member] of this.projectMembers.entries()) {
      if (member.projectId === projectId) {
        this.projectMembers.delete(key);
      }
    }

    this.projectRulesetPolicies.delete(projectId);
    this.projects.delete(projectId);
    return true;
  }

  async getProjectMember(projectId: string, userId: string): Promise<ProjectMember | null> {
    return this.projectMembers.get(`${projectId}:${userId}`) ?? null;
  }

  async upsertProjectMember(input: { projectId: string; userId: string; role: ProjectMember["role"] }): Promise<ProjectMember> {
    const key = `${input.projectId}:${input.userId}`;
    const now = new Date().toISOString();
    const existing = this.projectMembers.get(key);
    const member: ProjectMember = {
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.projectMembers.set(key, member);
    return member;
  }

  async listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return Array.from(this.projectMembers.values())
      .filter((member) => member.projectId === projectId)
      .sort((left, right) => left.userId.localeCompare(right.userId));
  }

  async listDesignsByProject(projectId: string): Promise<Design[]> {
    return Array.from(this.designs.values())
      .filter((design) => design.projectId === projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createDesign(input: {
    projectId: string;
    name: string;
    createdBy: string;
    rulesetVersion?: string;
    libraryVersion?: string;
  }): Promise<Design> {
    const project = this.projects.get(input.projectId);
    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const revision: Revision = {
      id: crypto.randomUUID(),
      designId: "pending",
      revisionNumber: 1,
      createdBy: input.createdBy,
      createdAt: now,
      rulesetVersion: input.rulesetVersion ?? "rules-2026.03",
      libraryVersion: input.libraryVersion ?? "lib-2026.03.1",
      snapshot: EMPTY_SNAPSHOT
    };

    const designId = crypto.randomUUID();
    revision.designId = designId;

    const design: Design = {
      id: designId,
      projectId: input.projectId,
      name: input.name,
      status: "draft",
      currentRevisionId: revision.id,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    };

    this.designs.set(design.id, design);
    this.revisions.set(revision.id, revision);
    this.revisionByDesign.set(design.id, [revision]);
    return design;
  }

  async deleteDesign(designId: string): Promise<boolean> {
    const existing = this.designs.get(designId);
    if (!existing) {
      return false;
    }

    const revisionIds = Array.from(this.revisions.values())
      .filter((revision) => revision.designId === designId)
      .map((revision) => revision.id);

    this.designs.delete(designId);
    this.revisionByDesign.delete(designId);

    for (const revisionId of revisionIds) {
      this.revisions.delete(revisionId);
    }

    for (const [key, run] of this.validationRuns.entries()) {
      if (revisionIds.includes(run.revisionId)) {
        this.validationRuns.delete(key);
      }
    }

    for (const [key, artifact] of this.exports.entries()) {
      if (revisionIds.includes(artifact.revisionId)) {
        this.exports.delete(key);
      }
    }

    for (const [key, submission] of this.quoteSubmissions.entries()) {
      if (submission.designId === designId || revisionIds.includes(submission.revisionId)) {
        this.quoteSubmissions.delete(key);
      }
    }

    for (const [key, event] of this.auditEvents.entries()) {
      if (event.designId === designId) {
        this.auditEvents.delete(key);
      }
    }

    return true;
  }

  async getDesign(designId: string): Promise<Design | null> {
    return this.designs.get(designId) ?? null;
  }

  async updateDesign(input: { designId: string; name?: string; description?: string }): Promise<Design | null> {
    const existing = this.designs.get(input.designId);
    if (!existing) {
      return null;
    }
    const updated: Design = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      updatedAt: new Date().toISOString()
    };
    this.designs.set(input.designId, updated);
    return updated;
  }

  async updateDesignState(input: {
    designId: string;
    targetStatus: DesignStatus;
    expectedCurrentStatus?: DesignStatus;
  }): Promise<Design | null> {
    const existing = this.designs.get(input.designId);
    if (!existing) {
      return null;
    }
    if (input.expectedCurrentStatus && existing.status !== input.expectedCurrentStatus) {
      throw new Error("STATE_MISMATCH");
    }

    const updated: Design = {
      ...existing,
      status: input.targetStatus,
      updatedAt: new Date().toISOString()
    };
    this.designs.set(input.designId, updated);
    return updated;
  }

  async listRevisions(designId: string): Promise<Revision[]> {
    return this.revisionByDesign.get(designId) ?? [];
  }

  async getRevision(revisionId: string): Promise<Revision | null> {
    return this.revisions.get(revisionId) ?? null;
  }

  async createRevision(input: {
    designId: string;
    createdBy: string;
    rulesetVersion: string;
    libraryVersion: string;
    snapshot: Revision["snapshot"];
  }): Promise<Revision> {
    const design = this.designs.get(input.designId);
    if (!design) {
      throw new Error("DESIGN_NOT_FOUND");
    }

    const existing = this.revisionByDesign.get(input.designId) ?? [];
    const latest = existing[existing.length - 1];
    const now = new Date().toISOString();

    const revision: Revision = {
      id: crypto.randomUUID(),
      designId: input.designId,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      baseRevisionId: latest?.id,
      createdBy: input.createdBy,
      createdAt: now,
      rulesetVersion: input.rulesetVersion,
      libraryVersion: input.libraryVersion,
      snapshot: input.snapshot
    };

    this.revisions.set(revision.id, revision);
    this.revisionByDesign.set(input.designId, [...existing, revision]);
    this.designs.set(input.designId, { ...design, currentRevisionId: revision.id, updatedAt: now });
    return revision;
  }

  async updateRevisionSnapshot(input: {
    revisionId: string;
    snapshot: Revision["snapshot"];
  }): Promise<Revision | null> {
    const existing = this.revisions.get(input.revisionId);
    if (!existing) {
      return null;
    }
    const updatedRevision: Revision = {
      ...existing,
      snapshot: input.snapshot
    };
    this.revisions.set(updatedRevision.id, updatedRevision);
    const history = this.revisionByDesign.get(updatedRevision.designId) ?? [];
    this.revisionByDesign.set(
      updatedRevision.designId,
      history.map((revision) => (revision.id === updatedRevision.id ? updatedRevision : revision))
    );
    const design = this.designs.get(updatedRevision.designId);
    if (design) {
      this.designs.set(design.id, {
        ...design,
        updatedAt: new Date().toISOString()
      });
    }
    return updatedRevision;
  }

  async createValidationRun(input: {
    revisionId: string;
    rulesetVersion: string;
    mode: "quick" | "full";
    snapshotHash: string;
    summary: ValidationRun["summary"];
    results: ValidationRun["results"];
  }): Promise<ValidationRun> {
    const revision = this.revisions.get(input.revisionId);
    if (!revision) {
      throw new Error("REVISION_NOT_FOUND");
    }

    const run: ValidationRun = {
      id: crypto.randomUUID(),
      revisionId: input.revisionId,
      rulesetVersion: input.rulesetVersion,
      mode: input.mode,
      status: "completed",
      snapshotHash: input.snapshotHash,
      summary: input.summary,
      results: input.results,
      createdAt: new Date().toISOString()
    };

    this.validationRuns.set(run.id, run);
    return run;
  }

  async getValidationRun(validationRunId: string): Promise<ValidationRun | null> {
    return this.validationRuns.get(validationRunId) ?? null;
  }

  async getLatestValidationRunForRevision(revisionId: string): Promise<ValidationRun | null> {
    const runs = Array.from(this.validationRuns.values())
      .filter((run) => run.revisionId === revisionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return runs[0] ?? null;
  }

  async createQuoteSubmission(input: {
    designId: string;
    revisionId: string;
    validationRunId: string;
    message?: string;
    idempotencyKey?: string;
    estimatedResponseHours: number;
  }): Promise<QuoteSubmission> {
    const submission: QuoteSubmission = {
      id: crypto.randomUUID(),
      designId: input.designId,
      revisionId: input.revisionId,
      validationRunId: input.validationRunId,
      message: input.message,
      idempotencyKey: input.idempotencyKey,
      status: "received",
      estimatedResponseHours: input.estimatedResponseHours,
      createdAt: new Date().toISOString()
    };
    this.quoteSubmissions.set(submission.id, submission);
    return submission;
  }

  async getQuoteSubmission(submissionId: string): Promise<QuoteSubmission | null> {
    return this.quoteSubmissions.get(submissionId) ?? null;
  }

  async listQuoteSubmissionsByDesign(designId: string): Promise<QuoteSubmission[]> {
    return Array.from(this.quoteSubmissions.values())
      .filter((submission) => submission.designId === designId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findQuoteSubmissionByIdempotencyKey(designId: string, idempotencyKey: string): Promise<QuoteSubmission | null> {
    return (
      Array.from(this.quoteSubmissions.values()).find(
        (submission) => submission.designId === designId && submission.idempotencyKey === idempotencyKey
      ) ?? null
    );
  }

  async createAuditEvent(input: {
    designId: string;
    eventType: AuditEvent["eventType"];
    actorId: string;
    payload: AuditEvent["payload"];
  }): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      designId: input.designId,
      eventType: input.eventType,
      actorId: input.actorId,
      payload: input.payload,
      createdAt: new Date().toISOString()
    };
    this.auditEvents.set(event.id, event);
    return event;
  }

  async listAuditEventsByDesign(designId: string): Promise<AuditEvent[]> {
    return Array.from(this.auditEvents.values())
      .filter((event) => event.designId === designId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createExportArtifact(input: {
    revisionId: string;
    format: ExportArtifact["format"];
    status: ExportArtifact["status"];
  }): Promise<ExportArtifact> {
    const revision = this.revisions.get(input.revisionId);
    if (!revision) {
      throw new Error("REVISION_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const exportArtifact: ExportArtifact = {
      id: crypto.randomUUID(),
      revisionId: input.revisionId,
      format: input.format,
      status: input.status,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.exports.set(exportArtifact.id, exportArtifact);
    return exportArtifact;
  }

  async updateExportArtifact(input: {
    exportId: string;
    status: ExportArtifact["status"];
    contentHash?: string;
    artifactUri?: string;
    errorMessage?: string | null;
    attemptCount?: number;
    nextAttemptAt?: string | null;
    failureKind?: ExportArtifact["failureKind"] | null;
  }): Promise<ExportArtifact | null> {
    const existing = this.exports.get(input.exportId);
    if (!existing) {
      return null;
    }
    const updated: ExportArtifact = {
      ...existing,
      status: input.status,
      contentHash: input.contentHash ?? existing.contentHash,
      artifactUri: input.artifactUri ?? existing.artifactUri,
      errorMessage:
        input.errorMessage === null
          ? undefined
          : input.errorMessage !== undefined
            ? input.errorMessage
            : existing.errorMessage,
      attemptCount: input.attemptCount ?? existing.attemptCount,
      nextAttemptAt:
        input.nextAttemptAt === null
          ? undefined
          : input.nextAttemptAt !== undefined
            ? input.nextAttemptAt
            : existing.nextAttemptAt,
      failureKind:
        input.failureKind === null
          ? undefined
          : input.failureKind !== undefined
            ? input.failureKind
            : existing.failureKind,
      updatedAt: new Date().toISOString()
    };
    this.exports.set(updated.id, updated);
    return updated;
  }

  async getExportArtifact(exportId: string): Promise<ExportArtifact | null> {
    return this.exports.get(exportId) ?? null;
  }

  async listExportArtifactsByRevision(revisionId: string): Promise<ExportArtifact[]> {
    return Array.from(this.exports.values())
      .filter((artifact) => artifact.revisionId === revisionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listExportArtifactsByStatuses(statuses: Array<ExportArtifact["status"]>): Promise<ExportArtifact[]> {
    const statusSet = new Set(statuses);
    return Array.from(this.exports.values())
      .filter((artifact) => statusSet.has(artifact.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listExportArtifactsOlderThan(input: {
    olderThanIso: string;
    statuses: Array<ExportArtifact["status"]>;
  }): Promise<ExportArtifact[]> {
    const statusSet = new Set(input.statuses);
    return Array.from(this.exports.values())
      .filter((artifact) => statusSet.has(artifact.status) && artifact.updatedAt < input.olderThanIso)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  async deleteExportArtifact(exportId: string): Promise<boolean> {
    return this.exports.delete(exportId);
  }

  async listRulesets(): Promise<RulesetVersion[]> {
    return Array.from(this.rulesets.values()).sort((left, right) => left.version.localeCompare(right.version));
  }

  async getActiveRuleset(): Promise<RulesetVersion | null> {
    return Array.from(this.rulesets.values()).find((ruleset) => ruleset.isActive) ?? null;
  }

  async upsertRuleset(input: { version: string; isActive: boolean; notes?: string }): Promise<RulesetVersion> {
    const existing = this.rulesets.get(input.version);
    const now = new Date().toISOString();
    if (input.isActive) {
      for (const [key, ruleset] of this.rulesets.entries()) {
        this.rulesets.set(key, { ...ruleset, isActive: false, updatedAt: now });
      }
    }
    const updated: RulesetVersion = {
      version: input.version,
      isActive: input.isActive,
      notes: input.notes,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.rulesets.set(input.version, updated);
    return updated;
  }

  async getProjectRulesetPolicy(projectId: string): Promise<ProjectRulesetPolicy | null> {
    return this.projectRulesetPolicies.get(projectId) ?? null;
  }

  async upsertProjectRulesetPolicy(input: {
    projectId: string;
    defaultRulesetVersion?: string;
    allowedRulesetVersions: string[];
  }): Promise<ProjectRulesetPolicy> {
    const now = new Date().toISOString();
    const existing = this.projectRulesetPolicies.get(input.projectId);
    const policy: ProjectRulesetPolicy = {
      projectId: input.projectId,
      defaultRulesetVersion: input.defaultRulesetVersion,
      allowedRulesetVersions: [...input.allowedRulesetVersions].sort((left, right) => left.localeCompare(right)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.projectRulesetPolicies.set(input.projectId, policy);
    return policy;
  }

  async ingestLibraryComponents(input: {
    items: LibraryComponentIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
    idempotencyKey?: string;
  }): Promise<LibraryIngestResult> {
    if (input.idempotencyKey) {
      const existing = this.libraryIngestResultsByIdempotencyKey.get(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const accepted: Array<{
      item: LibraryComponentIngestItem;
      rowNumber: number;
      componentId: string;
      existing?: StoredLibraryComponent;
    }> = [];
    const results: LibraryIngestResult["results"] = [];
    const seenKeys = new Set<string>();

    input.items.forEach((item, index) => {
      const rowNumber = index + 1;
      const componentId = item.id?.trim() || `cmp-${item.category}-${crypto.randomUUID().slice(0, 8)}`;
      const candidateKey = `${item.category}:${item.family.trim().toLowerCase()}:${item.partNumber.trim().toLowerCase()}`;
      if (seenKeys.has(candidateKey)) {
        results.push({
          rowNumber,
          status: "rejected",
          componentId,
          message: "Duplicate item in current ingest payload."
        });
        return;
      }
      const duplicate = Array.from(this.libraryComponents.values()).some(
        (existing) =>
          existing.id !== componentId &&
          existing.category === item.category &&
          existing.family.toLowerCase() === item.family.trim().toLowerCase() &&
          existing.partNumber.toLowerCase() === item.partNumber.trim().toLowerCase()
      );
      if (duplicate) {
        results.push({
          rowNumber,
          status: "rejected",
          componentId,
          message: "Duplicate active component for category/family/partNumber."
        });
        return;
      }
      seenKeys.add(candidateKey);
      accepted.push({
        item,
        rowNumber,
        componentId,
        existing: this.libraryComponents.get(componentId)
      });
      results.push({
        rowNumber,
        status: input.dryRun ? "accepted" : "committed",
        componentId
      });
    });

    if (!input.dryRun) {
      const now = new Date().toISOString();
      for (const entry of accepted) {
        const existing = entry.existing;
        const editedReviewedEntry =
          Boolean(existing?.isReviewed) &&
          Boolean(
            existing &&
              (existing.category !== entry.item.category ||
                existing.family !== entry.item.family.trim() ||
                existing.partNumber !== entry.item.partNumber.trim() ||
                existing.description !== entry.item.description.trim() ||
                existing.awg !== entry.item.awg?.trim() ||
                existing.color !== entry.item.color?.trim() ||
                existing.isActive !== entry.item.isActive ||
                existing.stockStatus !== entry.item.stockStatus ||
                JSON.stringify(existing.compatibilityHints) !== JSON.stringify(entry.item.compatibilityHints))
          );
        const isReviewed = editedReviewedEntry ? false : entry.item.isReviewed;
        this.libraryComponents.set(entry.componentId, {
          id: entry.componentId,
          category: entry.item.category,
          family: entry.item.family.trim(),
          partNumber: entry.item.partNumber.trim(),
          description: entry.item.description.trim(),
          awg: entry.item.awg?.trim(),
          color: entry.item.color?.trim(),
          isActive: entry.item.isActive,
          isReviewed,
          reviewedByUserId: isReviewed ? entry.item.reviewedByUserId ?? input.requestedByUserId : undefined,
          reviewedAt: isReviewed ? entry.item.reviewedAt ?? now : undefined,
          stockStatus: entry.item.stockStatus,
          compatibilityHints: entry.item.compatibilityHints,
          customFieldValues: entry.item.customFieldValues ?? existing?.customFieldValues ?? {},
          createdByUserId: existing?.createdByUserId ?? input.requestedByUserId,
          createdAt: existing?.createdAt ?? now,
          lastEditedByUserId: input.requestedByUserId,
          lastEditedAt: now,
          updatedAt: now,
          enteredByUserId: existing?.enteredByUserId ?? input.requestedByUserId,
          enteredAt: existing?.enteredAt ?? now,
          isArchived: false
        });
      }
    }

    const rejected = results.filter((row) => row.status === "rejected").length;
    const committed = input.dryRun ? 0 : accepted.length;
    const result: LibraryIngestResult = {
      jobId: crypto.randomUUID(),
      dryRun: input.dryRun,
      summary: {
        received: input.items.length,
        accepted: accepted.length,
        rejected,
        committed
      },
      results
    };
    if (input.idempotencyKey) {
      this.libraryIngestResultsByIdempotencyKey.set(input.idempotencyKey, result);
    }
    return result;
  }

  async listLibraryComponents(input: {
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<LibraryComponentRecord[]> {
    return Array.from(this.libraryComponents.values())
      .filter(
        (component) =>
          !component.isArchived &&
          (component.isActive || input.canViewInactive) &&
          (component.isReviewed || component.enteredByUserId === input.requestingUserId || input.canViewAllUnreviewed)
      )
      .map((component) => ({
        id: component.id,
        category: component.category,
        family: component.family,
        partNumber: component.partNumber,
        description: component.description,
        awg: component.awg,
        color: component.color,
        isActive: component.isActive,
        isReviewed: component.isReviewed,
        reviewedByUserId: component.reviewedByUserId,
        reviewedAt: component.reviewedAt,
        stockStatus: component.stockStatus,
        compatibilityHints: component.compatibilityHints,
        customFieldValues: component.customFieldValues ?? {},
        createdByUserId: component.createdByUserId,
        createdAt: component.createdAt,
        lastEditedByUserId: component.lastEditedByUserId,
        lastEditedAt: component.lastEditedAt,
        updatedAt: component.updatedAt
      }))
      .sort((left, right) => left.partNumber.localeCompare(right.partNumber));
  }

  async getLibraryComponent(input: {
    componentId: string;
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<LibraryComponentRecord | null> {
    const component = this.libraryComponents.get(input.componentId);
    if (!component || component.isArchived) {
      return null;
    }
    if (!component.isActive && !input.canViewInactive) {
      return null;
    }
    const visible =
      component.isReviewed || component.enteredByUserId === input.requestingUserId || input.canViewAllUnreviewed;
    if (!visible) {
      return null;
    }
    return {
      id: component.id,
      category: component.category,
      family: component.family,
      partNumber: component.partNumber,
      description: component.description,
      awg: component.awg,
      color: component.color,
      isActive: component.isActive,
      isReviewed: component.isReviewed,
      reviewedByUserId: component.reviewedByUserId,
      reviewedAt: component.reviewedAt,
      stockStatus: component.stockStatus,
      compatibilityHints: component.compatibilityHints,
      customFieldValues: component.customFieldValues ?? {},
      createdByUserId: component.createdByUserId,
      createdAt: component.createdAt,
      lastEditedByUserId: component.lastEditedByUserId,
      lastEditedAt: component.lastEditedAt,
      updatedAt: component.updatedAt
    };
  }

  async setLibraryComponentReview(input: {
    componentId: string;
    isReviewed: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<LibraryComponentRecord | null> {
    const component = this.libraryComponents.get(input.componentId);
    if (!component || component.isArchived) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: StoredLibraryComponent = {
      ...component,
      isReviewed: input.isReviewed,
      reviewedByUserId: input.isReviewed ? input.reviewedByUserId : undefined,
      reviewedAt: input.isReviewed ? input.reviewedAt ?? now : undefined,
      lastEditedByUserId: input.reviewedByUserId ?? component.lastEditedByUserId,
      lastEditedAt: now,
      updatedAt: now
    };
    this.libraryComponents.set(input.componentId, updated);
    return {
      id: updated.id,
      category: updated.category,
      family: updated.family,
      partNumber: updated.partNumber,
      description: updated.description,
      awg: updated.awg,
      color: updated.color,
      isActive: updated.isActive,
      isReviewed: updated.isReviewed,
      reviewedByUserId: updated.reviewedByUserId,
      reviewedAt: updated.reviewedAt,
      stockStatus: updated.stockStatus,
      compatibilityHints: updated.compatibilityHints,
      customFieldValues: updated.customFieldValues ?? {},
      createdByUserId: updated.createdByUserId,
      createdAt: updated.createdAt,
      lastEditedByUserId: updated.lastEditedByUserId,
      lastEditedAt: updated.lastEditedAt,
      updatedAt: updated.updatedAt
    };
  }

  async archiveLibraryComponent(input: { componentId: string; archivedByUserId: string }): Promise<LibraryComponentRecord | null> {
    void input.archivedByUserId;
    const component = this.libraryComponents.get(input.componentId);
    if (!component || component.isArchived) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: StoredLibraryComponent = {
      ...component,
      isArchived: true,
      lastEditedByUserId: input.archivedByUserId,
      lastEditedAt: now,
      updatedAt: now
    };
    this.libraryComponents.set(input.componentId, updated);
    return {
      id: updated.id,
      category: updated.category,
      family: updated.family,
      partNumber: updated.partNumber,
      description: updated.description,
      awg: updated.awg,
      color: updated.color,
      isActive: updated.isActive,
      isReviewed: updated.isReviewed,
      reviewedByUserId: updated.reviewedByUserId,
      reviewedAt: updated.reviewedAt,
      stockStatus: updated.stockStatus,
      compatibilityHints: updated.compatibilityHints,
      customFieldValues: updated.customFieldValues ?? {},
      createdByUserId: updated.createdByUserId,
      createdAt: updated.createdAt,
      lastEditedByUserId: updated.lastEditedByUserId,
      lastEditedAt: updated.lastEditedAt,
      updatedAt: updated.updatedAt
    };
  }

  async deleteLibraryComponent(input: { componentId: string }): Promise<boolean> {
    const component = this.libraryComponents.get(input.componentId);
    if (!component) {
      return false;
    }
    this.libraryComponents.delete(input.componentId);
    return true;
  }

  async updateLibraryComponent(input: {
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
  }): Promise<LibraryComponentRecord | null> {
    const component = this.libraryComponents.get(input.componentId);
    if (!component || component.isArchived) {
      return null;
    }
    const nextAwg = input.awg ?? component.awg;
    const nextColor = input.color ?? component.color;
    if (component.category === "wire" && (!nextAwg || !nextColor)) {
      throw new Error("WIRE_FIELDS_REQUIRED");
    }
    const nextIsReviewed = input.isReviewed ?? component.isReviewed;
    const nextReviewedByUserId = nextIsReviewed
      ? (input.reviewedByUserId ?? component.reviewedByUserId)
      : undefined;
    const nextReviewedAt = nextIsReviewed ? (input.reviewedAt ?? component.reviewedAt) : undefined;
    const updated: StoredLibraryComponent = {
      ...component,
      partNumber: input.partNumber ?? component.partNumber,
      family: input.family ?? component.family,
      description: input.description ?? component.description,
      awg: nextAwg,
      color: nextColor,
      isActive: input.isActive ?? component.isActive,
      isReviewed: nextIsReviewed,
      reviewedByUserId: nextReviewedByUserId,
      reviewedAt: nextReviewedAt,
      stockStatus: input.stockStatus ?? component.stockStatus,
      compatibilityHints: input.compatibilityHints ?? component.compatibilityHints,
      customFieldValues: input.customFieldValues ?? component.customFieldValues ?? {},
      createdByUserId: input.createdByUserId ?? component.createdByUserId,
      createdAt: input.createdAt ?? component.createdAt,
      lastEditedByUserId: input.lastEditedByUserId ?? input.editedByUserId ?? component.lastEditedByUserId,
      lastEditedAt: input.lastEditedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.libraryComponents.set(input.componentId, updated);
    return {
      id: updated.id,
      category: updated.category,
      family: updated.family,
      partNumber: updated.partNumber,
      description: updated.description,
      awg: updated.awg,
      color: updated.color,
      isActive: updated.isActive,
      isReviewed: updated.isReviewed,
      reviewedByUserId: updated.reviewedByUserId,
      reviewedAt: updated.reviewedAt,
      stockStatus: updated.stockStatus,
      compatibilityHints: updated.compatibilityHints,
      customFieldValues: updated.customFieldValues ?? {},
      createdByUserId: updated.createdByUserId,
      createdAt: updated.createdAt,
      lastEditedByUserId: updated.lastEditedByUserId,
      lastEditedAt: updated.lastEditedAt,
      updatedAt: updated.updatedAt
    };
  }

  async listLibraryFieldDefinitions(input: {
    category: LibraryCategory;
  }): Promise<LibraryFieldDefinitionRecord[]> {
    return Array.from(this.libraryFieldDefinitions.values())
      .filter((definition) => definition.category === input.category)
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async createLibraryFieldDefinition(input: {
    category: LibraryCategory;
    key: string;
    label: string;
    valueType: "text";
    isVisibleInViewer: boolean;
    showOnAddForm: boolean;
    showInSearch: boolean;
    createdByUserId: string;
  }): Promise<LibraryFieldDefinitionRecord> {
    const duplicate = Array.from(this.libraryFieldDefinitions.values()).find(
      (definition) => definition.category === input.category && definition.key.toLowerCase() === input.key.toLowerCase()
    );
    if (duplicate) {
      throw new Error("FIELD_KEY_EXISTS");
    }
    const now = new Date().toISOString();
    const created: LibraryFieldDefinitionRecord = {
      id: crypto.randomUUID(),
      category: input.category,
      key: input.key,
      label: input.label,
      valueType: input.valueType,
      isSystem: false,
      isVisibleInViewer: input.isVisibleInViewer,
      showOnAddForm: input.showOnAddForm,
      showInSearch: input.showInSearch,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now
    };
    this.libraryFieldDefinitions.set(created.id, created);
    return created;
  }

  async updateLibraryFieldDefinition(input: {
    fieldDefinitionId: string;
    label?: string;
    isVisibleInViewer?: boolean;
    showOnAddForm?: boolean;
    showInSearch?: boolean;
  }): Promise<LibraryFieldDefinitionRecord | null> {
    const existing = this.libraryFieldDefinitions.get(input.fieldDefinitionId);
    if (!existing) {
      return null;
    }
    const updated: LibraryFieldDefinitionRecord = {
      ...existing,
      label: input.label ?? existing.label,
      isVisibleInViewer: input.isVisibleInViewer ?? existing.isVisibleInViewer,
      showOnAddForm: input.showOnAddForm ?? existing.showOnAddForm,
      showInSearch: input.showInSearch ?? existing.showInSearch,
      updatedAt: new Date().toISOString()
    };
    this.libraryFieldDefinitions.set(existing.id, updated);
    return updated;
  }

  async deleteLibraryFieldDefinition(input: { fieldDefinitionId: string }): Promise<boolean> {
    const existing = this.libraryFieldDefinitions.get(input.fieldDefinitionId);
    if (!existing) {
      return false;
    }
    this.libraryFieldDefinitions.delete(input.fieldDefinitionId);
    for (const [componentId, component] of this.libraryComponents.entries()) {
      if (component.category !== existing.category) {
        continue;
      }
      if (!(existing.key in (component.customFieldValues ?? {}))) {
        continue;
      }
      const nextValues = { ...(component.customFieldValues ?? {}) };
      delete nextValues[existing.key];
      this.libraryComponents.set(componentId, {
        ...component,
        customFieldValues: nextValues,
        updatedAt: new Date().toISOString()
      });
    }
    return true;
  }

  async listLibraryReviewQueue(input?: {
    category?: LibraryCategory;
    family?: string;
    enteredByUserId?: string;
  }): Promise<LibraryReviewQueueRecord[]> {
    return Array.from(this.libraryComponents.values())
      .filter(
        (component) =>
          !component.isArchived &&
          !component.isReviewed &&
          (!input?.category || component.category === input.category) &&
          (!input?.family || component.family.toLowerCase() === input.family.trim().toLowerCase()) &&
          (!input?.enteredByUserId || component.enteredByUserId === input.enteredByUserId)
      )
      .sort((left, right) => left.enteredAt.localeCompare(right.enteredAt))
      .map((component) => ({
        id: component.id,
        category: component.category,
        family: component.family,
        partNumber: component.partNumber,
        description: component.description,
        awg: component.awg,
        color: component.color,
        isActive: component.isActive,
        isReviewed: component.isReviewed,
        reviewedByUserId: component.reviewedByUserId,
        reviewedAt: component.reviewedAt,
        stockStatus: component.stockStatus,
        compatibilityHints: component.compatibilityHints,
        customFieldValues: component.customFieldValues ?? {},
        createdByUserId: component.createdByUserId,
        createdAt: component.createdAt,
        lastEditedByUserId: component.lastEditedByUserId,
        lastEditedAt: component.lastEditedAt,
        updatedAt: component.updatedAt,
        enteredByUserId: component.enteredByUserId,
        enteredAt: component.enteredAt
      }));
  }

  async getUserTablePreferences(input: { userId: string; scope: string }): Promise<TablePreferencesRecord | null> {
    return this.userTablePreferences.get(`${input.userId}:${input.scope}`) ?? null;
  }

  async upsertUserTablePreferences(input: {
    userId: string;
    scope: string;
    columnOrder: string[];
    columnWidths: Record<string, number>;
  }): Promise<TablePreferencesRecord> {
    const updated: TablePreferencesRecord = {
      userId: input.userId,
      scope: input.scope,
      columnOrder: input.columnOrder,
      columnWidths: input.columnWidths,
      updatedAt: new Date().toISOString()
    };
    this.userTablePreferences.set(`${input.userId}:${input.scope}`, updated);
    return updated;
  }
}
