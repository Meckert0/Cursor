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
  emptyAttributesForCategory,
  normalizePartRelationship,
  partRelationshipNaturalKey,
  type AwgCmaReference,
  type LibraryCategory,
  type PartIngestItem,
  type LibraryIngestResult,
  type PartWithAttributes,
  type LibraryReviewQueueRecord,
  type ContactWireCompat,
  type ModuleContactCompat,
  type ModuleBackshellCompat,
  type ModuleStrainReliefCompat,
  type PartAlias,
  type PartRelationship,
  type PartRelationshipInput,
  type CategoryAttributesMap
} from "../../domain/library.js";
import { hashDesignSnapshot } from "../../domain/snapshot-hash.js";
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

type StoredPart = PartWithAttributes & {
  enteredByUserId: string;
  enteredAt: string;
  isArchived: boolean;
  archivedAt?: string;
  archivedByUserId?: string;
};

function toPartRecord(part: StoredPart): PartWithAttributes {
  const { enteredByUserId: _enteredByUserId, enteredAt: _enteredAt, ...record } = part;
  return record;
}

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
  parts?: StoredPart[];
  partAliases?: PartAlias[];
  contactWireCompat?: ContactWireCompat[];
  moduleContactCompat?: ModuleContactCompat[];
  moduleBackshellCompat?: ModuleBackshellCompat[];
  moduleStrainReliefCompat?: ModuleStrainReliefCompat[];
  partRelationships?: PartRelationship[];
  awgCmaReference?: AwgCmaReference[];
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
  private readonly parts = new Map<string, StoredPart>();
  private readonly partAliases = new Map<string, PartAlias>();
  private readonly contactWireCompat = new Map<string, ContactWireCompat>();
  private readonly moduleContactCompat = new Map<string, ModuleContactCompat>();
  private readonly moduleBackshellCompat = new Map<string, ModuleBackshellCompat>();
  private readonly moduleStrainReliefCompat = new Map<string, ModuleStrainReliefCompat>();
  private readonly partRelationships = new Map<string, PartRelationship>();
  private readonly awgCmaReference = new Map<string, AwgCmaReference>();
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
      notes: "Default ruleset (topology + library existence).",
      createdAt: now,
      updatedAt: now
    });
    this.rulesets.set("rules-2026.04", {
      version: "rules-2026.04",
      isActive: false,
      notes: "Manufacturability ruleset (compatibility + strict inactive/OOS).",
      createdAt: now,
      updatedAt: now
    });
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
      parts: Array.from(this.parts.values()),
      partAliases: Array.from(this.partAliases.values()),
      contactWireCompat: Array.from(this.contactWireCompat.values()),
      moduleContactCompat: Array.from(this.moduleContactCompat.values()),
      moduleBackshellCompat: Array.from(this.moduleBackshellCompat.values()),
      moduleStrainReliefCompat: Array.from(this.moduleStrainReliefCompat.values()),
      partRelationships: Array.from(this.partRelationships.values()),
      awgCmaReference: Array.from(this.awgCmaReference.values()),
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

    // Legacy libraryComponents / libraryFieldDefinitions keys are intentionally discarded.
    this.parts.clear();
    for (const part of state.parts ?? []) {
      this.parts.set(part.id, {
        ...part,
        isArchived: part.isArchived ?? false,
        enteredByUserId: part.enteredByUserId ?? part.createdByUserId ?? "system-user",
        enteredAt: part.enteredAt ?? part.createdAt ?? part.updatedAt
      });
    }

    this.partAliases.clear();
    for (const alias of state.partAliases ?? []) {
      this.partAliases.set(`${alias.codeSystem}:${alias.code}`, alias);
    }

    this.contactWireCompat.clear();
    for (const row of state.contactWireCompat ?? []) {
      this.contactWireCompat.set(`${row.contactPartId}:${row.wirePartId}`, row);
    }

    this.moduleContactCompat.clear();
    for (const row of state.moduleContactCompat ?? []) {
      this.moduleContactCompat.set(`${row.modulePartId}:${row.contactPartId}`, row);
    }

    this.moduleBackshellCompat.clear();
    for (const row of state.moduleBackshellCompat ?? []) {
      this.moduleBackshellCompat.set(`${row.modulePartId}:${row.backshellPartId}`, row);
    }

    this.moduleStrainReliefCompat.clear();
    for (const row of state.moduleStrainReliefCompat ?? []) {
      this.moduleStrainReliefCompat.set(`${row.modulePartId}:${row.strainReliefPartId}`, row);
    }

    this.partRelationships.clear();
    for (const row of state.partRelationships ?? []) {
      const normalized = normalizePartRelationship(row);
      this.partRelationships.set(partRelationshipNaturalKey(normalized), normalized);
    }

    this.awgCmaReference.clear();
    for (const row of state.awgCmaReference ?? []) {
      this.awgCmaReference.set(row.awg, row);
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
    expectedSnapshotHash?: string;
  }): Promise<Revision | null> {
    const existing = this.revisions.get(input.revisionId);
    if (!existing) {
      return null;
    }
    if (input.expectedSnapshotHash !== undefined) {
      const currentHash = hashDesignSnapshot(existing.snapshot);
      if (currentHash !== input.expectedSnapshotHash) {
        throw new Error("SNAPSHOT_MISMATCH");
      }
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
    inactivePartSeverity?: "error" | "warning";
    outOfStockSeverity?: "error" | "warning" | "info";
    unreviewedPartSeverity?: "error" | "warning" | "info";
  }): Promise<ProjectRulesetPolicy> {
    const now = new Date().toISOString();
    const existing = this.projectRulesetPolicies.get(input.projectId);
    const policy: ProjectRulesetPolicy = {
      projectId: input.projectId,
      defaultRulesetVersion: input.defaultRulesetVersion,
      allowedRulesetVersions: [...input.allowedRulesetVersions].sort((left, right) => left.localeCompare(right)),
      inactivePartSeverity: input.inactivePartSeverity,
      outOfStockSeverity: input.outOfStockSeverity,
      unreviewedPartSeverity: input.unreviewedPartSeverity,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.projectRulesetPolicies.set(input.projectId, policy);
    return policy;
  }

  async ingestLibraryComponents(input: {
    items: PartIngestItem[];
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
      item: PartIngestItem;
      rowNumber: number;
      componentId: string;
      existing?: StoredPart;
    }> = [];
    const results: LibraryIngestResult["results"] = [];
    const seenKeys = new Set<string>();

    input.items.forEach((item, index) => {
      const rowNumber = index + 1;
      const componentId = item.id?.trim() || `cmp-${item.category}-${crypto.randomUUID().slice(0, 8)}`;
      if (item.category === "wire") {
        const awg = "awg" in item.attributes ? String(item.attributes.awg ?? "").trim() : "";
        const color = "color" in item.attributes ? String(item.attributes.color ?? "").trim() : "";
        if (!awg || !color) {
          results.push({
            rowNumber,
            status: "rejected",
            componentId,
            message: "WIRE_FIELDS_REQUIRED"
          });
          return;
        }
      }
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
      const duplicate = Array.from(this.parts.values()).some(
        (existing) =>
          !existing.isArchived &&
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
        existing: this.parts.get(componentId)
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
        const item = entry.item;
        const attributes = {
          ...emptyAttributesForCategory(item.category),
          ...item.attributes
        } as CategoryAttributesMap[LibraryCategory];
        const editedReviewedEntry =
          Boolean(existing?.isReviewed) &&
          Boolean(
            existing &&
              (existing.category !== item.category ||
                existing.family !== item.family.trim() ||
                existing.partNumber !== item.partNumber.trim() ||
                existing.description !== item.description.trim() ||
                existing.isActive !== item.isActive ||
                existing.stockStatus !== item.stockStatus ||
                (existing.partType ?? "") !== (item.partType?.trim() ?? "") ||
                (existing.side ?? "") !== (item.side?.trim() ?? "") ||
                (existing.notes ?? "") !== (item.notes?.trim() ?? "") ||
                (existing.electricalMode ?? "") !== (item.electricalMode?.trim() ?? "") ||
                JSON.stringify(existing.extraAttributes ?? {}) !== JSON.stringify(item.extraAttributes ?? {}) ||
                JSON.stringify(existing.attributes) !== JSON.stringify(attributes))
          );
        const isReviewed = editedReviewedEntry ? false : item.isReviewed;
        const stored = {
          id: entry.componentId,
          category: item.category,
          family: item.family.trim(),
          partNumber: item.partNumber.trim(),
          description: item.description.trim(),
          isActive: item.isActive,
          isReviewed,
          reviewedByUserId: isReviewed ? item.reviewedByUserId ?? input.requestedByUserId : undefined,
          reviewedAt: isReviewed ? item.reviewedAt ?? now : undefined,
          stockStatus: item.stockStatus,
          partType: item.partType?.trim() || undefined,
          side: item.side?.trim() || undefined,
          notes: item.notes?.trim() || undefined,
          electricalMode: item.electricalMode?.trim() || undefined,
          extraAttributes:
            item.extraAttributes && Object.keys(item.extraAttributes).length > 0 ? item.extraAttributes : undefined,
          attributes,
          createdByUserId: existing?.createdByUserId ?? input.requestedByUserId,
          createdAt: existing?.createdAt ?? now,
          lastEditedByUserId: input.requestedByUserId,
          lastEditedAt: now,
          updatedAt: now,
          enteredByUserId: existing?.enteredByUserId ?? input.requestedByUserId,
          enteredAt: existing?.enteredAt ?? now,
          isArchived: false,
          archivedAt: undefined,
          archivedByUserId: undefined
        } as StoredPart;
        this.parts.set(entry.componentId, stored);

        if (item.aliases) {
          for (const alias of item.aliases) {
            const codeSystem = alias.codeSystem.trim();
            const code = alias.code.trim();
            if (!codeSystem || !code) {
              continue;
            }
            this.partAliases.set(`${codeSystem}:${code}`, {
              partId: entry.componentId,
              codeSystem,
              code
            });
          }
        }
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
  }): Promise<PartWithAttributes[]> {
    return Array.from(this.parts.values())
      .filter(
        (part) =>
          !part.isArchived &&
          (part.isActive || input.canViewInactive) &&
          (part.isReviewed || part.enteredByUserId === input.requestingUserId || input.canViewAllUnreviewed)
      )
      .map(toPartRecord)
      .sort((left, right) => left.partNumber.localeCompare(right.partNumber));
  }

  async getLibraryComponent(input: {
    componentId: string;
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<PartWithAttributes | null> {
    const part = this.parts.get(input.componentId);
    if (!part || part.isArchived) {
      return null;
    }
    if (!part.isActive && !input.canViewInactive) {
      return null;
    }
    const visible = part.isReviewed || part.enteredByUserId === input.requestingUserId || input.canViewAllUnreviewed;
    if (!visible) {
      return null;
    }
    return toPartRecord(part);
  }

  async setLibraryComponentReview(input: {
    componentId: string;
    isReviewed: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<PartWithAttributes | null> {
    const part = this.parts.get(input.componentId);
    if (!part || part.isArchived) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: StoredPart = {
      ...part,
      isReviewed: input.isReviewed,
      reviewedByUserId: input.isReviewed ? input.reviewedByUserId : undefined,
      reviewedAt: input.isReviewed ? input.reviewedAt ?? now : undefined,
      lastEditedByUserId: input.reviewedByUserId ?? part.lastEditedByUserId,
      lastEditedAt: now,
      updatedAt: now
    };
    this.parts.set(input.componentId, updated);
    return toPartRecord(updated);
  }

  async bulkSetLibraryComponentReview(input: {
    componentIds: string[];
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<{ reviewed: number; missing: string[] }> {
    const now = new Date().toISOString();
    const missing: string[] = [];
    let reviewed = 0;
    for (const componentId of input.componentIds) {
      const part = this.parts.get(componentId);
      if (!part || part.isArchived) {
        missing.push(componentId);
        continue;
      }
      const updated: StoredPart = {
        ...part,
        isReviewed: true,
        reviewedByUserId: input.reviewedByUserId ?? "system-user",
        reviewedAt: input.reviewedAt ?? now,
        lastEditedByUserId: input.reviewedByUserId ?? part.lastEditedByUserId,
        lastEditedAt: now,
        updatedAt: now
      };
      this.parts.set(componentId, updated);
      reviewed += 1;
    }
    return { reviewed, missing };
  }

  async archiveLibraryComponent(input: {
    componentId: string;
    archivedByUserId: string;
  }): Promise<PartWithAttributes | null> {
    const part = this.parts.get(input.componentId);
    if (!part || part.isArchived) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: StoredPart = {
      ...part,
      isArchived: true,
      isActive: false,
      archivedAt: now,
      archivedByUserId: input.archivedByUserId,
      lastEditedByUserId: input.archivedByUserId,
      lastEditedAt: now,
      updatedAt: now
    };
    this.parts.set(input.componentId, updated);
    return toPartRecord(updated);
  }

  async listArchivedLibraryComponents(): Promise<PartWithAttributes[]> {
    return Array.from(this.parts.values())
      .filter((part) => part.isArchived === true)
      .map(toPartRecord)
      .sort((left, right) => left.partNumber.localeCompare(right.partNumber));
  }

  async restoreLibraryComponent(input: {
    componentId: string;
    restoredByUserId: string;
    reactivate?: boolean;
  }): Promise<PartWithAttributes | null> {
    const part = this.parts.get(input.componentId);
    if (!part || !part.isArchived) {
      return null;
    }
    const now = new Date().toISOString();
    const reactivate = input.reactivate !== false;
    const updated: StoredPart = {
      ...part,
      isArchived: false,
      archivedAt: undefined,
      archivedByUserId: undefined,
      isActive: reactivate ? true : part.isActive,
      lastEditedByUserId: input.restoredByUserId,
      lastEditedAt: now,
      updatedAt: now
    };
    this.parts.set(input.componentId, updated);
    return toPartRecord(updated);
  }

  async deleteLibraryComponent(input: { componentId: string }): Promise<boolean> {
    const part = this.parts.get(input.componentId);
    if (!part) {
      return false;
    }
    this.parts.delete(input.componentId);
    for (const [key, row] of this.partRelationships.entries()) {
      if (row.parentPartId === input.componentId || row.compatibleParts.includes(part.partNumber)) {
        this.partRelationships.delete(key);
      }
    }
    return true;
  }

  async updateLibraryComponent(input: {
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
    const part = this.parts.get(input.componentId);
    if (!part || part.isArchived) {
      return null;
    }
    const nextAttributes = {
      ...part.attributes,
      ...(input.attributes ?? {})
    } as CategoryAttributesMap[LibraryCategory];
    if (part.category === "wire") {
      const awg = "awg" in nextAttributes ? String(nextAttributes.awg ?? "").trim() : "";
      const color = "color" in nextAttributes ? String(nextAttributes.color ?? "").trim() : "";
      if (!awg || !color) {
        throw new Error("WIRE_FIELDS_REQUIRED");
      }
    }
    const nextIsReviewed = input.isReviewed ?? part.isReviewed;
    const nextReviewedByUserId = nextIsReviewed ? (input.reviewedByUserId ?? part.reviewedByUserId) : undefined;
    const nextReviewedAt = nextIsReviewed ? (input.reviewedAt ?? part.reviewedAt) : undefined;
    const nextPartType = input.partType !== undefined ? input.partType.trim() || undefined : part.partType;
    const nextSide = input.side !== undefined ? input.side.trim() || undefined : part.side;
    const nextNotes = input.notes !== undefined ? input.notes.trim() || undefined : part.notes;
    const nextElectricalMode =
      input.electricalMode !== undefined ? input.electricalMode.trim() || undefined : part.electricalMode;
    const nextExtraAttributes =
      input.extraAttributes !== undefined
        ? Object.keys(input.extraAttributes).length > 0
          ? input.extraAttributes
          : undefined
        : part.extraAttributes;
    const updated = {
      ...part,
      partNumber: input.partNumber ?? part.partNumber,
      family: input.family ?? part.family,
      description: input.description ?? part.description,
      isActive: input.isActive ?? part.isActive,
      isReviewed: nextIsReviewed,
      reviewedByUserId: nextReviewedByUserId,
      reviewedAt: nextReviewedAt,
      stockStatus: input.stockStatus ?? part.stockStatus,
      partType: nextPartType,
      side: nextSide,
      notes: nextNotes,
      electricalMode: nextElectricalMode,
      extraAttributes: nextExtraAttributes,
      attributes: nextAttributes,
      createdByUserId: input.createdByUserId ?? part.createdByUserId,
      createdAt: input.createdAt ?? part.createdAt,
      lastEditedByUserId: input.lastEditedByUserId ?? input.editedByUserId ?? part.lastEditedByUserId,
      lastEditedAt: input.lastEditedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as StoredPart;
    this.parts.set(input.componentId, updated);
    return toPartRecord(updated);
  }

  async listLibraryReviewQueue(input?: {
    category?: LibraryCategory;
    family?: string;
    enteredByUserId?: string;
  }): Promise<LibraryReviewQueueRecord[]> {
    return Array.from(this.parts.values())
      .filter(
        (part) =>
          !part.isArchived &&
          !part.isReviewed &&
          (!input?.category || part.category === input.category) &&
          (!input?.family || part.family.toLowerCase() === input.family.trim().toLowerCase()) &&
          (!input?.enteredByUserId || part.enteredByUserId === input.enteredByUserId)
      )
      .sort((left, right) => left.enteredAt.localeCompare(right.enteredAt))
      .map((part) => ({
        ...toPartRecord(part),
        enteredByUserId: part.enteredByUserId,
        enteredAt: part.enteredAt
      }));
  }

  async listContactWireCompat(): Promise<ContactWireCompat[]> {
    return Array.from(this.contactWireCompat.values());
  }

  async upsertContactWireCompat(input: ContactWireCompat): Promise<ContactWireCompat> {
    const row: ContactWireCompat = {
      contactPartId: input.contactPartId,
      wirePartId: input.wirePartId,
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.crimpClass !== undefined ? { crimpClass: input.crimpClass } : {})
    };
    this.contactWireCompat.set(`${row.contactPartId}:${row.wirePartId}`, row);
    return row;
  }

  async bulkUpsertContactWireCompat(input: { rows: ContactWireCompat[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      this.contactWireCompat.set(`${row.contactPartId}:${row.wirePartId}`, {
        contactPartId: row.contactPartId,
        wirePartId: row.wirePartId,
        status: row.status,
        ...(row.notes !== undefined ? { notes: row.notes } : {}),
        ...(row.crimpClass !== undefined ? { crimpClass: row.crimpClass } : {})
      });
    }
    return { upserted: input.rows.length };
  }

  async deleteContactWireCompat(input: { contactPartId: string; wirePartId: string }): Promise<boolean> {
    return this.contactWireCompat.delete(`${input.contactPartId}:${input.wirePartId}`);
  }

  async listModuleContactCompat(): Promise<ModuleContactCompat[]> {
    return Array.from(this.moduleContactCompat.values());
  }

  async upsertModuleContactCompat(input: ModuleContactCompat): Promise<ModuleContactCompat> {
    const row: ModuleContactCompat = {
      modulePartId: input.modulePartId,
      contactPartId: input.contactPartId,
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.source !== undefined ? { source: input.source } : {})
    };
    this.moduleContactCompat.set(`${row.modulePartId}:${row.contactPartId}`, row);
    return row;
  }

  async bulkUpsertModuleContactCompat(input: { rows: ModuleContactCompat[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      this.moduleContactCompat.set(`${row.modulePartId}:${row.contactPartId}`, {
        modulePartId: row.modulePartId,
        contactPartId: row.contactPartId,
        status: row.status,
        ...(row.notes !== undefined ? { notes: row.notes } : {}),
        ...(row.source !== undefined ? { source: row.source } : {})
      });
    }
    return { upserted: input.rows.length };
  }

  async deleteModuleContactCompat(input: { modulePartId: string; contactPartId: string }): Promise<boolean> {
    return this.moduleContactCompat.delete(`${input.modulePartId}:${input.contactPartId}`);
  }

  async listModuleBackshellCompat(): Promise<ModuleBackshellCompat[]> {
    return Array.from(this.moduleBackshellCompat.values());
  }

  async upsertModuleBackshellCompat(input: ModuleBackshellCompat): Promise<ModuleBackshellCompat> {
    const row: ModuleBackshellCompat = {
      modulePartId: input.modulePartId,
      backshellPartId: input.backshellPartId,
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.source !== undefined ? { source: input.source } : {})
    };
    this.moduleBackshellCompat.set(`${row.modulePartId}:${row.backshellPartId}`, row);
    return row;
  }

  async bulkUpsertModuleBackshellCompat(input: { rows: ModuleBackshellCompat[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      this.moduleBackshellCompat.set(`${row.modulePartId}:${row.backshellPartId}`, {
        modulePartId: row.modulePartId,
        backshellPartId: row.backshellPartId,
        status: row.status,
        ...(row.notes !== undefined ? { notes: row.notes } : {}),
        ...(row.source !== undefined ? { source: row.source } : {})
      });
    }
    return { upserted: input.rows.length };
  }

  async deleteModuleBackshellCompat(input: { modulePartId: string; backshellPartId: string }): Promise<boolean> {
    return this.moduleBackshellCompat.delete(`${input.modulePartId}:${input.backshellPartId}`);
  }

  async listModuleStrainReliefCompat(): Promise<ModuleStrainReliefCompat[]> {
    return Array.from(this.moduleStrainReliefCompat.values());
  }

  async upsertModuleStrainReliefCompat(input: ModuleStrainReliefCompat): Promise<ModuleStrainReliefCompat> {
    const row: ModuleStrainReliefCompat = {
      modulePartId: input.modulePartId,
      strainReliefPartId: input.strainReliefPartId,
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.source !== undefined ? { source: input.source } : {})
    };
    this.moduleStrainReliefCompat.set(`${row.modulePartId}:${row.strainReliefPartId}`, row);
    return row;
  }

  async bulkUpsertModuleStrainReliefCompat(input: { rows: ModuleStrainReliefCompat[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      this.moduleStrainReliefCompat.set(`${row.modulePartId}:${row.strainReliefPartId}`, {
        modulePartId: row.modulePartId,
        strainReliefPartId: row.strainReliefPartId,
        status: row.status,
        ...(row.notes !== undefined ? { notes: row.notes } : {}),
        ...(row.source !== undefined ? { source: row.source } : {})
      });
    }
    return { upserted: input.rows.length };
  }

  async deleteModuleStrainReliefCompat(input: {
    modulePartId: string;
    strainReliefPartId: string;
  }): Promise<boolean> {
    return this.moduleStrainReliefCompat.delete(`${input.modulePartId}:${input.strainReliefPartId}`);
  }

  async listAwgCmaReference(): Promise<AwgCmaReference[]> {
    return Array.from(this.awgCmaReference.values()).sort((left, right) => left.awg.localeCompare(right.awg));
  }

  async bulkUpsertAwgCmaReference(input: { rows: AwgCmaReference[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      this.awgCmaReference.set(row.awg, { awg: row.awg, cma: row.cma });
    }
    return { upserted: input.rows.length };
  }

  async listPartAliases(input?: { partId?: string }): Promise<PartAlias[]> {
    return Array.from(this.partAliases.values()).filter(
      (alias) => !input?.partId || alias.partId === input.partId
    );
  }

  async upsertPartAlias(input: PartAlias): Promise<PartAlias> {
    const alias: PartAlias = {
      partId: input.partId,
      codeSystem: input.codeSystem,
      code: input.code
    };
    this.partAliases.set(`${alias.codeSystem}:${alias.code}`, alias);
    return alias;
  }

  async deletePartAlias(input: { codeSystem: string; code: string }): Promise<boolean> {
    return this.partAliases.delete(`${input.codeSystem}:${input.code}`);
  }

  async listPartRelationships(input?: {
    parentPartId?: string;
    compatiblePart?: string;
    relationshipType?: string;
  }): Promise<PartRelationship[]> {
    return Array.from(this.partRelationships.values()).filter((row) => {
      if (input?.parentPartId && row.parentPartId !== input.parentPartId) {
        return false;
      }
      if (input?.compatiblePart && !row.compatibleParts.includes(input.compatiblePart)) {
        return false;
      }
      if (input?.relationshipType && row.relationshipType !== input.relationshipType) {
        return false;
      }
      return true;
    });
  }

  async upsertPartRelationship(input: PartRelationshipInput): Promise<PartRelationship> {
    const normalized = normalizePartRelationship(input);
    const naturalKey = partRelationshipNaturalKey(normalized);
    const existingByNaturalKey = this.partRelationships.get(naturalKey);
    const row: PartRelationship = {
      ...normalized,
      id: existingByNaturalKey?.id ?? normalized.id
    };
    if (existingByNaturalKey && existingByNaturalKey.id !== row.id) {
      this.partRelationships.delete(naturalKey);
    }
    for (const [key, existing] of this.partRelationships.entries()) {
      if (existing.id === row.id && key !== naturalKey) {
        this.partRelationships.delete(key);
      }
    }
    this.partRelationships.set(naturalKey, row);
    return row;
  }

  async bulkUpsertPartRelationships(input: { rows: PartRelationshipInput[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      await this.upsertPartRelationship(row);
    }
    return { upserted: input.rows.length };
  }

  async deletePartRelationship(input: { id: string }): Promise<boolean> {
    for (const [key, row] of this.partRelationships.entries()) {
      if (row.id === input.id) {
        this.partRelationships.delete(key);
        return true;
      }
    }
    return false;
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
