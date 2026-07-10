import type { Pool, PoolClient } from "pg";
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
import {
  BUILTIN_FIELDS_BY_CATEGORY,
  builtinFieldDefinitionId
} from "../../domain/library-builtin-fields.js";
import type { TablePreferencesRecord } from "../../domain/table-preferences.js";
import type { Store } from "./store.js";

const EMPTY_SNAPSHOT: DesignSnapshot = {
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

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: ProjectMember["role"];
  created_at: Date;
  updated_at: Date;
};

type DesignRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: Design["status"];
  current_revision_id: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

type RevisionRow = {
  id: string;
  design_id: string;
  revision_number: number;
  base_revision_id: string | null;
  created_by: string;
  created_at: Date;
  ruleset_version: string;
  library_version: string;
  snapshot: DesignSnapshot;
};

type ValidationRunRow = {
  id: string;
  revision_id: string;
  ruleset_version: string;
  mode: "quick" | "full";
  status: "completed";
  errors: number;
  warnings: number;
  infos: number;
  results: ValidationRun["results"];
  created_at: Date;
};

type QuoteSubmissionRow = {
  id: string;
  design_id: string;
  revision_id: string;
  validation_run_id: string;
  message: string | null;
  idempotency_key: string | null;
  status: "received";
  estimated_response_hours: number;
  created_at: Date;
};

type AuditEventRow = {
  id: string;
  design_id: string;
  event_type: AuditEvent["eventType"];
  actor_id: string;
  payload: AuditEvent["payload"];
  created_at: Date;
};

type ExportArtifactRow = {
  id: string;
  revision_id: string;
  format: ExportArtifact["format"];
  status: ExportArtifact["status"];
  content_hash: string | null;
  artifact_uri: string | null;
  error_message: string | null;
  attempt_count: number;
  next_attempt_at: Date | null;
  failure_kind: ExportArtifact["failureKind"] | null;
  created_at: Date;
  updated_at: Date;
};

type RulesetRow = {
  version: string;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type ProjectRulesetPolicyRow = {
  project_id: string;
  default_ruleset_version: string | null;
  allowed_ruleset_versions: string[];
  created_at: Date;
  updated_at: Date;
};

type LibraryComponentRow = {
  id: string;
  category: LibraryCategory;
  family: string;
  part_number: string;
  description: string;
  awg: string | null;
  color: string | null;
  is_active: boolean;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  compatibility_hints_json: string[];
  entered_by_user_id: string;
  entered_at: Date;
  last_edited_by_user_id: string | null;
  last_edited_at: Date | null;
  is_reviewed: boolean;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  is_archived: boolean;
  updated_at: Date;
};

type LibraryFieldDefinitionRow = {
  id: string;
  category: LibraryCategory;
  key: string;
  label: string;
  value_type: "text";
  is_system: boolean;
  is_visible_in_viewer: boolean;
  show_on_add_form: boolean;
  show_in_search: boolean;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
};

type LibraryCustomFieldValueRow = {
  component_id: string;
  key: string;
  value_text: string;
};

type DatastoreIngestJobRow = {
  id: string;
  dry_run: boolean;
  summary_json: {
    received?: number;
    accepted?: number;
    rejected?: number;
    committed?: number;
  } | null;
};

type DatastoreIngestJobResultRow = {
  row_number: number;
  entity_key: string | null;
  result_status: "validated" | "committed" | "failed" | "skipped";
  error_message: string | null;
};

type UserTablePreferenceRow = {
  user_id: string;
  scope: string;
  column_order: string[];
  column_widths: Record<string, number>;
  updated_at: Date;
};

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapProjectMember(row: ProjectMemberRow): ProjectMember {
  return {
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapDesign(row: DesignRow): Design {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    currentRevisionId: row.current_revision_id,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapRevision(row: RevisionRow): Revision {
  return {
    id: row.id,
    designId: row.design_id,
    revisionNumber: row.revision_number,
    baseRevisionId: row.base_revision_id ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    rulesetVersion: row.ruleset_version,
    libraryVersion: row.library_version,
    snapshot: row.snapshot
  };
}

function mapValidationRun(row: ValidationRunRow): ValidationRun {
  return {
    id: row.id,
    revisionId: row.revision_id,
    rulesetVersion: row.ruleset_version,
    mode: row.mode,
    status: row.status,
    summary: {
      errors: row.errors,
      warnings: row.warnings,
      infos: row.infos
    },
    results: row.results,
    createdAt: row.created_at.toISOString()
  };
}

function mapQuoteSubmission(row: QuoteSubmissionRow): QuoteSubmission {
  return {
    id: row.id,
    designId: row.design_id,
    revisionId: row.revision_id,
    validationRunId: row.validation_run_id,
    message: row.message ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    status: row.status,
    estimatedResponseHours: row.estimated_response_hours,
    createdAt: row.created_at.toISOString()
  };
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    designId: row.design_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    payload: row.payload,
    createdAt: row.created_at.toISOString()
  };
}

function mapExportArtifact(row: ExportArtifactRow): ExportArtifact {
  return {
    id: row.id,
    revisionId: row.revision_id,
    format: row.format,
    status: row.status,
    contentHash: row.content_hash ?? undefined,
    artifactUri: row.artifact_uri ?? undefined,
    errorMessage: row.error_message ?? undefined,
    attemptCount: row.attempt_count ?? 0,
    nextAttemptAt: row.next_attempt_at ? row.next_attempt_at.toISOString() : undefined,
    failureKind: row.failure_kind ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapRuleset(row: RulesetRow): RulesetVersion {
  return {
    version: row.version,
    isActive: row.is_active,
    notes: row.notes ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapProjectRulesetPolicy(row: ProjectRulesetPolicyRow): ProjectRulesetPolicy {
  return {
    projectId: row.project_id,
    defaultRulesetVersion: row.default_ruleset_version ?? undefined,
    allowedRulesetVersions: row.allowed_ruleset_versions,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapLibraryComponent(
  row: LibraryComponentRow,
  customFieldValues: Record<string, string> = {}
): LibraryComponentRecord {
  return {
    id: row.id,
    category: row.category,
    family: row.family,
    partNumber: row.part_number,
    description: row.description,
    awg: row.awg ?? undefined,
    color: row.color ?? undefined,
    isActive: row.is_active,
    isReviewed: row.is_reviewed,
    reviewedByUserId: row.reviewed_by_user_id ?? undefined,
    reviewedAt: row.reviewed_at?.toISOString(),
    stockStatus: row.stock_status,
    compatibilityHints: row.compatibility_hints_json ?? [],
    createdByUserId: row.entered_by_user_id,
    createdAt: row.entered_at.toISOString(),
    lastEditedByUserId: row.last_edited_by_user_id ?? row.entered_by_user_id,
    lastEditedAt: (row.last_edited_at ?? row.entered_at).toISOString(),
    updatedAt: row.updated_at.toISOString(),
    customFieldValues
  };
}

function mapLibraryReviewQueueRecord(
  row: LibraryComponentRow,
  customFieldValues: Record<string, string> = {}
): LibraryReviewQueueRecord {
  return {
    id: row.id,
    category: row.category,
    family: row.family,
    partNumber: row.part_number,
    description: row.description,
    awg: row.awg ?? undefined,
    color: row.color ?? undefined,
    isActive: row.is_active,
    isReviewed: row.is_reviewed,
    reviewedByUserId: row.reviewed_by_user_id ?? undefined,
    reviewedAt: row.reviewed_at?.toISOString(),
    stockStatus: row.stock_status,
    compatibilityHints: row.compatibility_hints_json ?? [],
    createdByUserId: row.entered_by_user_id,
    createdAt: row.entered_at.toISOString(),
    lastEditedByUserId: row.last_edited_by_user_id ?? row.entered_by_user_id,
    lastEditedAt: (row.last_edited_at ?? row.entered_at).toISOString(),
    updatedAt: row.updated_at.toISOString(),
    customFieldValues,
    enteredByUserId: row.entered_by_user_id,
    enteredAt: row.entered_at.toISOString()
  };
}

function mapLibraryFieldDefinition(row: LibraryFieldDefinitionRow): LibraryFieldDefinitionRecord {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    label: row.label,
    valueType: row.value_type,
    isSystem: row.is_system,
    isVisibleInViewer: row.is_visible_in_viewer,
    showOnAddForm: row.show_on_add_form,
    showInSearch: row.show_in_search,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapStoredIngestResults(
  job: DatastoreIngestJobRow,
  rows: DatastoreIngestJobResultRow[]
): LibraryIngestResult {
  const summary = {
    received: job.summary_json?.received ?? rows.length,
    accepted: job.summary_json?.accepted ?? 0,
    rejected: job.summary_json?.rejected ?? 0,
    committed: job.summary_json?.committed ?? 0
  };
  return {
    jobId: job.id,
    dryRun: job.dry_run,
    summary,
    results: rows
      .sort((left, right) => left.row_number - right.row_number)
      .map((row) => ({
        rowNumber: row.row_number,
        status: row.result_status === "failed" ? "rejected" : row.result_status === "committed" ? "committed" : "accepted",
        componentId: row.entity_key ?? undefined,
        message: row.error_message ?? undefined
      }))
  };
}

function mapUserTablePreference(row: UserTablePreferenceRow): TablePreferencesRecord {
  return {
    userId: row.user_id,
    scope: row.scope,
    columnOrder: row.column_order ?? [],
    columnWidths: row.column_widths ?? {},
    updatedAt: row.updated_at.toISOString()
  };
}

export class PostgresStore implements Store {
  constructor(private readonly pool: Pool) {}

  private async getCustomFieldValuesByComponentIds(
    componentIds: string[],
    client?: Pool | PoolClient
  ): Promise<Map<string, Record<string, string>>> {
    const resultMap = new Map<string, Record<string, string>>();
    if (componentIds.length === 0) {
      return resultMap;
    }
    const queryClient = client ?? this.pool;
    const valuesResult = await queryClient.query<LibraryCustomFieldValueRow>(
      `SELECT v.component_id, d.key, v.value_text
       FROM library_component_custom_values v
       JOIN library_field_definitions d ON d.id = v.field_definition_id
       WHERE v.component_id = ANY($1::text[])`,
      [componentIds]
    );
    for (const row of valuesResult.rows) {
      const existing = resultMap.get(row.component_id) ?? {};
      existing[row.key] = row.value_text;
      resultMap.set(row.component_id, existing);
    }
    return resultMap;
  }

  private async upsertCustomFieldValues(
    client: PoolClient,
    componentId: string,
    category: LibraryCategory,
    customFieldValues: Record<string, string>
  ): Promise<void> {
    await client.query(
      `DELETE FROM library_component_custom_values
       WHERE component_id = $1
         AND field_definition_id IN (
           SELECT id
           FROM library_field_definitions
           WHERE category = $2
             AND is_system = FALSE
         )`,
      [componentId, category]
    );
    const entries = Object.entries(customFieldValues);
    if (entries.length === 0) {
      return;
    }
    for (const [key, valueText] of entries) {
      await client.query(
        `INSERT INTO library_component_custom_values (
           component_id, field_definition_id, value_text, created_at, updated_at
         )
         SELECT $1, id, $3, NOW(), NOW()
         FROM library_field_definitions
         WHERE category = $2 AND key = $4 AND is_system = FALSE
         ON CONFLICT (component_id, field_definition_id)
         DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = NOW()`,
        [componentId, category, valueText, key]
      );
    }
  }

  async getUiCopySettings(): Promise<{ projectsHeaderDescription: string; harnessHeaderDescription: string }> {
    const result = await this.pool.query<{ key: string; value: string }>(
      `SELECT key, value
       FROM app_settings
       WHERE key = ANY($1::text[])`,
      [["ui.projectsHeaderDescription", "ui.harnessHeaderDescription"]]
    );
    const byKey = new Map(result.rows.map((row) => [row.key, row.value]));
    return {
      projectsHeaderDescription:
        byKey.get("ui.projectsHeaderDescription") ?? DEFAULT_UI_COPY_SETTINGS.projectsHeaderDescription,
      harnessHeaderDescription:
        byKey.get("ui.harnessHeaderDescription") ?? DEFAULT_UI_COPY_SETTINGS.harnessHeaderDescription
    };
  }

  async updateUiCopySettings(input: {
    projectsHeaderDescription?: string;
    harnessHeaderDescription?: string;
  }): Promise<{ projectsHeaderDescription: string; harnessHeaderDescription: string }> {
    const current = await this.getUiCopySettings();
    const next = {
      projectsHeaderDescription:
        input.projectsHeaderDescription?.trim() || current.projectsHeaderDescription,
      harnessHeaderDescription:
        input.harnessHeaderDescription?.trim() || current.harnessHeaderDescription
    };
    await this.pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES
         ('ui.projectsHeaderDescription', $1, NOW()),
         ('ui.harnessHeaderDescription', $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [next.projectsHeaderDescription, next.harnessHeaderDescription]
    );
    return next;
  }

  async deleteUserData(userId: string): Promise<void> {
    const ownedProjects = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM projects
       WHERE created_by = $1`,
      [userId]
    );
    for (const project of ownedProjects.rows) {
      await this.deleteProject(project.id);
    }
    await this.pool.query(`DELETE FROM project_members WHERE user_id = $1`, [userId]);
    await this.pool.query(`DELETE FROM user_table_preferences WHERE user_id = $1`, [userId]);
  }

  async listProjects(): Promise<Project[]> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT id, name, description, created_by, created_at, updated_at
       FROM projects
       ORDER BY created_at DESC`
    );
    return result.rows.map(mapProject);
  }

  async getProject(projectId: string): Promise<Project | null> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT id, name, description, created_by, created_at, updated_at
       FROM projects
       WHERE id = $1`,
      [projectId]
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async createProject(input: { name: string; description?: string; createdBy: string }): Promise<Project> {
    const id = crypto.randomUUID();
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ProjectRow>(
        `INSERT INTO projects (id, name, description, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, name, description, created_by, created_at, updated_at`,
        [id, input.name, input.description ?? null, input.createdBy, now]
      );
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at, updated_at)
         VALUES ($1, $2, 'owner', $3, $3)
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, updated_at = EXCLUDED.updated_at`,
        [id, input.createdBy, now]
      );
      if (input.createdBy !== "system-user") {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, role, created_at, updated_at)
           VALUES ($1, $2, 'owner', $3, $3)
           ON CONFLICT (project_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, updated_at = EXCLUDED.updated_at`,
          [id, "system-user", now]
        );
      }
      await client.query("COMMIT");
      return mapProject(result.rows[0]);
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProject(input: { projectId: string; name?: string; description?: string }): Promise<Project | null> {
    const result = await this.pool.query<ProjectRow>(
      `UPDATE projects
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, description, created_by, created_at, updated_at`,
      [input.projectId, input.name ?? null, input.description ?? null]
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`DELETE FROM audit_events WHERE design_id IN (SELECT id FROM designs WHERE project_id = $1)`, [projectId]);
      await client.query(
        `DELETE FROM quote_submissions
         WHERE design_id IN (SELECT id FROM designs WHERE project_id = $1)
            OR revision_id IN (SELECT r.id FROM design_revisions r JOIN designs d ON d.id = r.design_id WHERE d.project_id = $1)`,
        [projectId]
      );
      await client.query(`DELETE FROM exports WHERE revision_id IN (SELECT r.id FROM design_revisions r JOIN designs d ON d.id = r.design_id WHERE d.project_id = $1)`, [projectId]);
      await client.query(`DELETE FROM validation_runs WHERE revision_id IN (SELECT r.id FROM design_revisions r JOIN designs d ON d.id = r.design_id WHERE d.project_id = $1)`, [projectId]);
      await client.query(`DELETE FROM design_revisions WHERE design_id IN (SELECT id FROM designs WHERE project_id = $1)`, [projectId]);
      await client.query(`DELETE FROM designs WHERE project_id = $1`, [projectId]);
      await client.query(`DELETE FROM project_members WHERE project_id = $1`, [projectId]);
      await client.query(`DELETE FROM project_ruleset_policies WHERE project_id = $1`, [projectId]);
      await client.query(`DELETE FROM project_library_overrides WHERE project_id = $1`, [projectId]);
      await client.query(`DELETE FROM artifact_manifests WHERE project_id = $1`, [projectId]);

      const deleteProjectResult = await client.query<{ id: string }>(`DELETE FROM projects WHERE id = $1 RETURNING id`, [projectId]);
      await client.query("COMMIT");
      return (deleteProjectResult.rowCount ?? 0) > 0;
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getProjectMember(projectId: string, userId: string): Promise<ProjectMember | null> {
    const result = await this.pool.query<ProjectMemberRow>(
      `SELECT project_id, user_id, role, created_at, updated_at
       FROM project_members
       WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    return result.rows[0] ? mapProjectMember(result.rows[0]) : null;
  }

  async upsertProjectMember(input: { projectId: string; userId: string; role: ProjectMember["role"] }): Promise<ProjectMember> {
    const projectExists = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1) AS exists`,
      [input.projectId]
    );
    if (!projectExists.rows[0]?.exists) {
      throw new Error("PROJECT_NOT_FOUND");
    }
    const result = await this.pool.query<ProjectMemberRow>(
      `INSERT INTO project_members (project_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
       RETURNING project_id, user_id, role, created_at, updated_at`,
      [input.projectId, input.userId, input.role]
    );
    return mapProjectMember(result.rows[0]);
  }

  async listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const result = await this.pool.query<ProjectMemberRow>(
      `SELECT project_id, user_id, role, created_at, updated_at
       FROM project_members
       WHERE project_id = $1
       ORDER BY user_id ASC`,
      [projectId]
    );
    return result.rows.map(mapProjectMember);
  }

  async listDesignsByProject(projectId: string): Promise<Design[]> {
    const result = await this.pool.query<DesignRow>(
      `SELECT id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at
       FROM designs
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );
    return result.rows.map(mapDesign);
  }

  async createDesign(input: {
    projectId: string;
    name: string;
    createdBy: string;
    rulesetVersion?: string;
    libraryVersion?: string;
  }): Promise<Design> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const projectExists = await client.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1) AS exists",
        [input.projectId]
      );
      if (!projectExists.rows[0]?.exists) {
        throw new Error("PROJECT_NOT_FOUND");
      }

      const now = new Date();
      const designId = crypto.randomUUID();
      const revisionId = crypto.randomUUID();

      const designResult = await client.query<DesignRow>(
        `INSERT INTO designs (
            id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, NULL, 'draft', $4, $5, $6, $6)
         RETURNING id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at`,
        [designId, input.projectId, input.name, revisionId, input.createdBy, now]
      );

      await client.query(
        `INSERT INTO design_revisions (
            id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot
         ) VALUES ($1, $2, 1, NULL, $3, $4, $5, $6, $7::jsonb)`,
        [
          revisionId,
          designId,
          input.createdBy,
          now,
          input.rulesetVersion ?? "rules-2026.03",
          input.libraryVersion ?? "lib-2026.03.1",
          JSON.stringify(EMPTY_SNAPSHOT)
        ]
      );

      await client.query("COMMIT");
      return mapDesign(designResult.rows[0]);
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteDesign(designId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`DELETE FROM audit_events WHERE design_id = $1`, [designId]);
      await client.query(`DELETE FROM quote_submissions WHERE design_id = $1 OR revision_id IN (SELECT id FROM design_revisions WHERE design_id = $1)`, [designId]);
      await client.query(`DELETE FROM exports WHERE revision_id IN (SELECT id FROM design_revisions WHERE design_id = $1)`, [designId]);
      await client.query(`DELETE FROM validation_runs WHERE revision_id IN (SELECT id FROM design_revisions WHERE design_id = $1)`, [designId]);
      await client.query(`DELETE FROM design_revisions WHERE design_id = $1`, [designId]);
      const deleteDesignResult = await client.query<{ id: string }>(`DELETE FROM designs WHERE id = $1 RETURNING id`, [designId]);

      await client.query("COMMIT");
      return (deleteDesignResult.rowCount ?? 0) > 0;
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getDesign(designId: string): Promise<Design | null> {
    const result = await this.pool.query<DesignRow>(
      `SELECT id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at
       FROM designs WHERE id = $1`,
      [designId]
    );
    return result.rows[0] ? mapDesign(result.rows[0]) : null;
  }

  async updateDesign(input: { designId: string; name?: string; description?: string }): Promise<Design | null> {
    const result = await this.pool.query<DesignRow>(
      `UPDATE designs
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at`,
      [input.designId, input.name ?? null, input.description ?? null]
    );
    return result.rows[0] ? mapDesign(result.rows[0]) : null;
  }

  async updateDesignState(input: {
    designId: string;
    targetStatus: DesignStatus;
    expectedCurrentStatus?: DesignStatus;
  }): Promise<Design | null> {
    if (input.expectedCurrentStatus) {
      const result = await this.pool.query<DesignRow>(
        `UPDATE designs
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND status = $3
         RETURNING id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at`,
        [input.targetStatus, input.designId, input.expectedCurrentStatus]
      );
      if (result.rows[0]) {
        return mapDesign(result.rows[0]);
      }

      const exists = await this.pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM designs WHERE id = $1) AS exists",
        [input.designId]
      );
      if (!exists.rows[0]?.exists) {
        return null;
      }
      throw new Error("STATE_MISMATCH");
    }

    const result = await this.pool.query<DesignRow>(
      `UPDATE designs
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at`,
      [input.targetStatus, input.designId]
    );
    return result.rows[0] ? mapDesign(result.rows[0]) : null;
  }

  async listRevisions(designId: string): Promise<Revision[]> {
    const result = await this.pool.query<RevisionRow>(
      `SELECT id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot
       FROM design_revisions
       WHERE design_id = $1
       ORDER BY revision_number ASC`,
      [designId]
    );
    return result.rows.map(mapRevision);
  }

  async getRevision(revisionId: string): Promise<Revision | null> {
    const result = await this.pool.query<RevisionRow>(
      `SELECT id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot
       FROM design_revisions
       WHERE id = $1`,
      [revisionId]
    );
    return result.rows[0] ? mapRevision(result.rows[0]) : null;
  }

  async updateRevisionSnapshot(input: {
    revisionId: string;
    snapshot: DesignSnapshot;
  }): Promise<Revision | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<RevisionRow>(
        `UPDATE design_revisions
         SET snapshot = $2::jsonb
         WHERE id = $1
         RETURNING id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot`,
        [input.revisionId, JSON.stringify(input.snapshot)]
      );
      if (!result.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(`UPDATE designs SET updated_at = NOW() WHERE id = $1`, [result.rows[0].design_id]);
      await client.query("COMMIT");
      return mapRevision(result.rows[0]);
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createRevision(input: {
    designId: string;
    createdBy: string;
    rulesetVersion: string;
    libraryVersion: string;
    snapshot: DesignSnapshot;
  }): Promise<Revision> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const designResult = await client.query<DesignRow>(
        `SELECT id, project_id, name, description, status, current_revision_id, created_by, created_at, updated_at
         FROM designs
         WHERE id = $1
         FOR UPDATE`,
        [input.designId]
      );
      if (!designResult.rows[0]) {
        throw new Error("DESIGN_NOT_FOUND");
      }

      const latestResult = await client.query<RevisionRow>(
        `SELECT id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot
         FROM design_revisions
         WHERE design_id = $1
         ORDER BY revision_number DESC
         LIMIT 1`,
        [input.designId]
      );

      const latest = latestResult.rows[0];
      const revisionNumber = (latest?.revision_number ?? 0) + 1;
      const revisionId = crypto.randomUUID();
      const now = new Date();

      const revisionResult = await client.query<RevisionRow>(
        `INSERT INTO design_revisions (
           id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot`,
        [
          revisionId,
          input.designId,
          revisionNumber,
          latest?.id ?? null,
          input.createdBy,
          now,
          input.rulesetVersion,
          input.libraryVersion,
          JSON.stringify(input.snapshot)
        ]
      );

      await client.query(`UPDATE designs SET current_revision_id = $1, updated_at = $2 WHERE id = $3`, [
        revisionId,
        now,
        input.designId
      ]);

      await client.query("COMMIT");
      return mapRevision(revisionResult.rows[0]);
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createValidationRun(input: {
    revisionId: string;
    rulesetVersion: string;
    mode: "quick" | "full";
    summary: ValidationRun["summary"];
    results: ValidationRun["results"];
  }): Promise<ValidationRun> {
    const revisionExists = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM design_revisions WHERE id = $1) AS exists`,
      [input.revisionId]
    );
    if (!revisionExists.rows[0]?.exists) {
      throw new Error("REVISION_NOT_FOUND");
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const result = await this.pool.query<ValidationRunRow>(
      `INSERT INTO validation_runs (
         id, revision_id, ruleset_version, mode, status, errors, warnings, infos, results, created_at
       ) VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8::jsonb, $9)
       RETURNING id, revision_id, ruleset_version, mode, status, errors, warnings, infos, results, created_at`,
      [
        id,
        input.revisionId,
        input.rulesetVersion,
        input.mode,
        input.summary.errors,
        input.summary.warnings,
        input.summary.infos,
        JSON.stringify(input.results),
        now
      ]
    );
    return mapValidationRun(result.rows[0]);
  }

  async getValidationRun(validationRunId: string): Promise<ValidationRun | null> {
    const result = await this.pool.query<ValidationRunRow>(
      `SELECT id, revision_id, ruleset_version, mode, status, errors, warnings, infos, results, created_at
       FROM validation_runs
       WHERE id = $1`,
      [validationRunId]
    );
    return result.rows[0] ? mapValidationRun(result.rows[0]) : null;
  }

  async getLatestValidationRunForRevision(revisionId: string): Promise<ValidationRun | null> {
    const result = await this.pool.query<ValidationRunRow>(
      `SELECT id, revision_id, ruleset_version, mode, status, errors, warnings, infos, results, created_at
       FROM validation_runs
       WHERE revision_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [revisionId]
    );
    return result.rows[0] ? mapValidationRun(result.rows[0]) : null;
  }

  async createQuoteSubmission(input: {
    designId: string;
    revisionId: string;
    validationRunId: string;
    message?: string;
    idempotencyKey?: string;
    estimatedResponseHours: number;
  }): Promise<QuoteSubmission> {
    const id = crypto.randomUUID();
    const now = new Date();
    const result = await this.pool.query<QuoteSubmissionRow>(
      `INSERT INTO quote_submissions (
         id, design_id, revision_id, validation_run_id, message, idempotency_key, status, estimated_response_hours, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'received', $7, $8)
       RETURNING id, design_id, revision_id, validation_run_id, message, idempotency_key, status, estimated_response_hours, created_at`,
      [
        id,
        input.designId,
        input.revisionId,
        input.validationRunId,
        input.message ?? null,
        input.idempotencyKey ?? null,
        input.estimatedResponseHours,
        now
      ]
    );
    return mapQuoteSubmission(result.rows[0]);
  }

  async getQuoteSubmission(submissionId: string): Promise<QuoteSubmission | null> {
    const result = await this.pool.query<QuoteSubmissionRow>(
      `SELECT id, design_id, revision_id, validation_run_id, message, idempotency_key, status, estimated_response_hours, created_at
       FROM quote_submissions
       WHERE id = $1`,
      [submissionId]
    );
    return result.rows[0] ? mapQuoteSubmission(result.rows[0]) : null;
  }

  async listQuoteSubmissionsByDesign(designId: string): Promise<QuoteSubmission[]> {
    const result = await this.pool.query<QuoteSubmissionRow>(
      `SELECT id, design_id, revision_id, validation_run_id, message, idempotency_key, status, estimated_response_hours, created_at
       FROM quote_submissions
       WHERE design_id = $1
       ORDER BY created_at DESC`,
      [designId]
    );
    return result.rows.map(mapQuoteSubmission);
  }

  async findQuoteSubmissionByIdempotencyKey(designId: string, idempotencyKey: string): Promise<QuoteSubmission | null> {
    const result = await this.pool.query<QuoteSubmissionRow>(
      `SELECT id, design_id, revision_id, validation_run_id, message, idempotency_key, status, estimated_response_hours, created_at
       FROM quote_submissions
       WHERE design_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [designId, idempotencyKey]
    );
    return result.rows[0] ? mapQuoteSubmission(result.rows[0]) : null;
  }

  async createAuditEvent(input: {
    designId: string;
    eventType: AuditEvent["eventType"];
    actorId: string;
    payload: AuditEvent["payload"];
  }): Promise<AuditEvent> {
    const id = crypto.randomUUID();
    const now = new Date();
    const result = await this.pool.query<AuditEventRow>(
      `INSERT INTO audit_events (id, design_id, event_type, actor_id, payload, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, design_id, event_type, actor_id, payload, created_at`,
      [id, input.designId, input.eventType, input.actorId, JSON.stringify(input.payload), now]
    );
    return mapAuditEvent(result.rows[0]);
  }

  async listAuditEventsByDesign(designId: string): Promise<AuditEvent[]> {
    const result = await this.pool.query<AuditEventRow>(
      `SELECT id, design_id, event_type, actor_id, payload, created_at
       FROM audit_events
       WHERE design_id = $1
       ORDER BY created_at DESC`,
      [designId]
    );
    return result.rows.map(mapAuditEvent);
  }

  async createExportArtifact(input: {
    revisionId: string;
    format: ExportArtifact["format"];
    status: ExportArtifact["status"];
  }): Promise<ExportArtifact> {
    const revisionExists = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM design_revisions WHERE id = $1) AS exists`,
      [input.revisionId]
    );
    if (!revisionExists.rows[0]?.exists) {
      throw new Error("REVISION_NOT_FOUND");
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const result = await this.pool.query<ExportArtifactRow>(
      `INSERT INTO exports (
         id, revision_id, format, status, attempt_count, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 0, $5, $5)
       RETURNING id, revision_id, format, status, content_hash, artifact_uri, error_message,
                 attempt_count, next_attempt_at, failure_kind, created_at, updated_at`,
      [id, input.revisionId, input.format, input.status, now]
    );
    return mapExportArtifact(result.rows[0]);
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
    const result = await this.pool.query<ExportArtifactRow>(
      `UPDATE exports
       SET status = $1,
           content_hash = COALESCE($2, content_hash),
           artifact_uri = COALESCE($3, artifact_uri),
           error_message = CASE
             WHEN $4::boolean THEN $5
             ELSE error_message
           END,
           attempt_count = COALESCE($6, attempt_count),
           next_attempt_at = CASE
             WHEN $7::boolean THEN $8::timestamptz
             ELSE next_attempt_at
           END,
           failure_kind = CASE
             WHEN $9::boolean THEN $10
             ELSE failure_kind
           END,
           updated_at = NOW()
       WHERE id = $11
       RETURNING id, revision_id, format, status, content_hash, artifact_uri, error_message,
                 attempt_count, next_attempt_at, failure_kind, created_at, updated_at`,
      [
        input.status,
        input.contentHash ?? null,
        input.artifactUri ?? null,
        input.errorMessage !== undefined,
        input.errorMessage ?? null,
        input.attemptCount ?? null,
        input.nextAttemptAt !== undefined,
        input.nextAttemptAt ?? null,
        input.failureKind !== undefined,
        input.failureKind ?? null,
        input.exportId
      ]
    );
    return result.rows[0] ? mapExportArtifact(result.rows[0]) : null;
  }

  async getExportArtifact(exportId: string): Promise<ExportArtifact | null> {
    const result = await this.pool.query<ExportArtifactRow>(
      `SELECT id, revision_id, format, status, content_hash, artifact_uri, error_message,
              attempt_count, next_attempt_at, failure_kind, created_at, updated_at
       FROM exports
       WHERE id = $1`,
      [exportId]
    );
    return result.rows[0] ? mapExportArtifact(result.rows[0]) : null;
  }

  async listExportArtifactsByRevision(revisionId: string): Promise<ExportArtifact[]> {
    const result = await this.pool.query<ExportArtifactRow>(
      `SELECT id, revision_id, format, status, content_hash, artifact_uri, error_message,
              attempt_count, next_attempt_at, failure_kind, created_at, updated_at
       FROM exports
       WHERE revision_id = $1
       ORDER BY created_at DESC, id DESC`,
      [revisionId]
    );
    return result.rows.map(mapExportArtifact);
  }

  async listExportArtifactsByStatuses(statuses: Array<ExportArtifact["status"]>): Promise<ExportArtifact[]> {
    if (statuses.length === 0) {
      return [];
    }
    const result = await this.pool.query<ExportArtifactRow>(
      `SELECT id, revision_id, format, status, content_hash, artifact_uri, error_message,
              attempt_count, next_attempt_at, failure_kind, created_at, updated_at
       FROM exports
       WHERE status = ANY($1::text[])
       ORDER BY created_at ASC`,
      [statuses]
    );
    return result.rows.map(mapExportArtifact);
  }

  async listExportArtifactsOlderThan(input: {
    olderThanIso: string;
    statuses: Array<ExportArtifact["status"]>;
  }): Promise<ExportArtifact[]> {
    if (input.statuses.length === 0) {
      return [];
    }
    const result = await this.pool.query<ExportArtifactRow>(
      `SELECT id, revision_id, format, status, content_hash, artifact_uri, error_message,
              attempt_count, next_attempt_at, failure_kind, created_at, updated_at
       FROM exports
       WHERE status = ANY($1::text[])
         AND updated_at < $2::timestamptz
       ORDER BY updated_at ASC`,
      [input.statuses, input.olderThanIso]
    );
    return result.rows.map(mapExportArtifact);
  }

  async deleteExportArtifact(exportId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM exports WHERE id = $1`, [exportId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listRulesets(): Promise<RulesetVersion[]> {
    const result = await this.pool.query<RulesetRow>(
      `SELECT version, is_active, notes, created_at, updated_at
       FROM rulesets
       ORDER BY version ASC`
    );
    return result.rows.map(mapRuleset);
  }

  async getActiveRuleset(): Promise<RulesetVersion | null> {
    const result = await this.pool.query<RulesetRow>(
      `SELECT version, is_active, notes, created_at, updated_at
       FROM rulesets
       WHERE is_active = TRUE
       LIMIT 1`
    );
    return result.rows[0] ? mapRuleset(result.rows[0]) : null;
  }

  async upsertRuleset(input: { version: string; isActive: boolean; notes?: string }): Promise<RulesetVersion> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (input.isActive) {
        await client.query(`UPDATE rulesets SET is_active = FALSE, updated_at = NOW() WHERE is_active = TRUE`);
      }
      const result = await client.query<RulesetRow>(
        `INSERT INTO rulesets (version, is_active, notes, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (version)
         DO UPDATE SET is_active = EXCLUDED.is_active, notes = EXCLUDED.notes, updated_at = NOW()
         RETURNING version, is_active, notes, created_at, updated_at`,
        [input.version, input.isActive, input.notes ?? null]
      );
      await client.query("COMMIT");
      return mapRuleset(result.rows[0]);
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getProjectRulesetPolicy(projectId: string): Promise<ProjectRulesetPolicy | null> {
    const result = await this.pool.query<ProjectRulesetPolicyRow>(
      `SELECT project_id, default_ruleset_version, allowed_ruleset_versions, created_at, updated_at
       FROM project_ruleset_policies
       WHERE project_id = $1`,
      [projectId]
    );
    return result.rows[0] ? mapProjectRulesetPolicy(result.rows[0]) : null;
  }

  async upsertProjectRulesetPolicy(input: {
    projectId: string;
    defaultRulesetVersion?: string;
    allowedRulesetVersions: string[];
  }): Promise<ProjectRulesetPolicy> {
    const projectExists = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1) AS exists`,
      [input.projectId]
    );
    if (!projectExists.rows[0]?.exists) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    const result = await this.pool.query<ProjectRulesetPolicyRow>(
      `INSERT INTO project_ruleset_policies (
         project_id, default_ruleset_version, allowed_ruleset_versions, created_at, updated_at
       ) VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (project_id)
       DO UPDATE SET
         default_ruleset_version = EXCLUDED.default_ruleset_version,
         allowed_ruleset_versions = EXCLUDED.allowed_ruleset_versions,
         updated_at = NOW()
       RETURNING project_id, default_ruleset_version, allowed_ruleset_versions, created_at, updated_at`,
      [input.projectId, input.defaultRulesetVersion ?? null, input.allowedRulesetVersions]
    );
    return mapProjectRulesetPolicy(result.rows[0]);
  }

  async ingestLibraryComponents(input: {
    items: LibraryComponentIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
    idempotencyKey?: string;
  }): Promise<LibraryIngestResult> {
    if (input.idempotencyKey) {
      const existingJob = await this.pool.query<DatastoreIngestJobRow>(
        `SELECT id, dry_run, summary_json
         FROM datastore_ingest_jobs
         WHERE target_store = 'postgres'
           AND target_entity = 'library_components'
           AND idempotency_key = $1
         LIMIT 1`,
        [input.idempotencyKey]
      );
      if (existingJob.rows[0]) {
        const existingRows = await this.pool.query<DatastoreIngestJobResultRow>(
          `SELECT row_number, entity_key, result_status, error_message
           FROM datastore_ingest_job_results
           WHERE job_id = $1
           ORDER BY row_number ASC`,
          [existingJob.rows[0].id]
        );
        return mapStoredIngestResults(existingJob.rows[0], existingRows.rows);
      }
    }

    const client = await this.pool.connect();
    const now = new Date();
    const jobId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO datastore_ingest_jobs (
           id, target_store, target_entity, dry_run, idempotency_key, requested_by_user_id, status, summary_json, created_at, updated_at
         ) VALUES ($1, 'postgres', 'library_components', $2, $3, $4, 'running', '{}'::jsonb, $5, $5)`,
        [jobId, input.dryRun, input.idempotencyKey ?? null, input.requestedByUserId, now]
      );

      const results: LibraryIngestResult["results"] = [];
      const seenKeys = new Set<string>();
      let accepted = 0;
      let rejected = 0;
      let committed = 0;

      for (let index = 0; index < input.items.length; index += 1) {
        const rowNumber = index + 1;
        const item = input.items[index];
        const componentId = item.id?.trim() || `cmp-${item.category}-${crypto.randomUUID().slice(0, 8)}`;
        const candidateKey = `${item.category}:${item.family.trim().toLowerCase()}:${item.partNumber.trim().toLowerCase()}`;
        if (seenKeys.has(candidateKey)) {
          rejected += 1;
          results.push({
            rowNumber,
            status: "rejected",
            componentId,
            message: "Duplicate item in current ingest payload."
          });
          await client.query(
            `INSERT INTO datastore_ingest_job_results (
               id, job_id, row_number, entity_key, result_status, error_code, error_message, payload_json, created_at
             ) VALUES ($1, $2, $3, $4, 'failed', 'DUPLICATE_PAYLOAD_ROW', $5, $6::jsonb, $7)`,
            [crypto.randomUUID(), jobId, rowNumber, componentId, "Duplicate item in current ingest payload.", JSON.stringify(item), now]
          );
          continue;
        }
        const duplicateResult = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM library_components
             WHERE is_archived = FALSE
               AND category = $1
               AND lower(family) = lower($2)
               AND lower(part_number) = lower($3)
               AND id <> $4
           ) AS exists`,
          [item.category, item.family.trim(), item.partNumber.trim(), componentId]
        );
        if (duplicateResult.rows[0]?.exists) {
          rejected += 1;
          results.push({
            rowNumber,
            status: "rejected",
            componentId,
            message: "Duplicate active component for category/family/partNumber."
          });
          await client.query(
            `INSERT INTO datastore_ingest_job_results (
               id, job_id, row_number, entity_key, result_status, error_code, error_message, payload_json, created_at
             ) VALUES ($1, $2, $3, $4, 'failed', 'DUPLICATE_COMPONENT', $5, $6::jsonb, $7)`,
            [
              crypto.randomUUID(),
              jobId,
              rowNumber,
              componentId,
              "Duplicate active component for category/family/partNumber.",
              JSON.stringify(item),
              now
            ]
          );
          continue;
        }
        seenKeys.add(candidateKey);

        accepted += 1;
        const existingResult = await client.query<LibraryComponentRow>(
          `SELECT id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
                  entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at
           FROM library_components
           WHERE id = $1`,
          [componentId]
        );
        const existing = existingResult.rows[0];
        const existingCustomValues = existing
          ? (await this.getCustomFieldValuesByComponentIds([componentId], client)).get(componentId) ?? {}
          : {};
        const editedReviewedEntry =
          Boolean(existing?.is_reviewed) &&
          Boolean(
            existing &&
              (existing.category !== item.category ||
                existing.family !== item.family.trim() ||
                existing.part_number !== item.partNumber.trim() ||
                existing.description !== item.description.trim() ||
                (existing.awg ?? undefined) !== item.awg?.trim() ||
                (existing.color ?? undefined) !== item.color?.trim() ||
                existing.is_active !== item.isActive ||
                existing.stock_status !== item.stockStatus ||
                JSON.stringify(existing.compatibility_hints_json ?? []) !== JSON.stringify(item.compatibilityHints ?? []))
          );
        const effectiveIsReviewed = editedReviewedEntry ? false : item.isReviewed;
        const normalizedReviewedAt = effectiveIsReviewed ? new Date(item.reviewedAt ?? now.toISOString()) : null;
        const normalizedReviewedByUserId = effectiveIsReviewed ? item.reviewedByUserId ?? input.requestedByUserId : null;
        if (!input.dryRun) {
          await client.query(
            `INSERT INTO library_components (
               id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
               entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $16, $12, $13, $14, $15, FALSE, $12)
             ON CONFLICT (id)
             DO UPDATE SET
               category = EXCLUDED.category,
               family = EXCLUDED.family,
               part_number = EXCLUDED.part_number,
               description = EXCLUDED.description,
               awg = EXCLUDED.awg,
               color = EXCLUDED.color,
               is_active = EXCLUDED.is_active,
               stock_status = EXCLUDED.stock_status,
               compatibility_hints_json = EXCLUDED.compatibility_hints_json,
               is_reviewed = EXCLUDED.is_reviewed,
               reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
               reviewed_at = EXCLUDED.reviewed_at,
               last_edited_by_user_id = EXCLUDED.last_edited_by_user_id,
               last_edited_at = EXCLUDED.last_edited_at,
               updated_at = EXCLUDED.updated_at`,
            [
              componentId,
              item.category,
              item.family.trim(),
              item.partNumber.trim(),
              item.description.trim(),
              item.awg?.trim() ?? null,
              item.color?.trim() ?? null,
              item.isActive,
              item.stockStatus,
              JSON.stringify(item.compatibilityHints ?? []),
              input.requestedByUserId,
              now,
              effectiveIsReviewed,
              normalizedReviewedByUserId,
              normalizedReviewedAt,
              input.requestedByUserId
            ]
          );
          await this.upsertCustomFieldValues(
            client,
            componentId,
            item.category,
            item.customFieldValues ?? existingCustomValues
          );
          committed += 1;
        }

        results.push({
          rowNumber,
          status: input.dryRun ? "accepted" : "committed",
          componentId
        });
        await client.query(
          `INSERT INTO datastore_ingest_job_results (
             id, job_id, row_number, entity_key, result_status, payload_json, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
          [
            crypto.randomUUID(),
            jobId,
            rowNumber,
            componentId,
            input.dryRun ? "validated" : "committed",
            JSON.stringify(item),
            now
          ]
        );
      }

      const summary = {
        received: input.items.length,
        accepted,
        rejected,
        committed
      };
      await client.query(
        `UPDATE datastore_ingest_jobs
         SET status = 'completed', summary_json = $1::jsonb, updated_at = $2, completed_at = $2
         WHERE id = $3`,
        [JSON.stringify(summary), now, jobId]
      );

      await client.query("COMMIT");
      return {
        jobId,
        dryRun: input.dryRun,
        summary,
        results
      };
    } catch (error) {
      await this.rollbackSilently(client);
      if (input.idempotencyKey) {
        const existingJob = await this.pool.query<DatastoreIngestJobRow>(
          `SELECT id, dry_run, summary_json
           FROM datastore_ingest_jobs
           WHERE target_store = 'postgres'
             AND target_entity = 'library_components'
             AND idempotency_key = $1
           LIMIT 1`,
          [input.idempotencyKey]
        );
        if (existingJob.rows[0]) {
          const existingRows = await this.pool.query<DatastoreIngestJobResultRow>(
            `SELECT row_number, entity_key, result_status, error_message
             FROM datastore_ingest_job_results
             WHERE job_id = $1
             ORDER BY row_number ASC`,
            [existingJob.rows[0].id]
          );
          return mapStoredIngestResults(existingJob.rows[0], existingRows.rows);
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listLibraryComponents(input: {
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<LibraryComponentRecord[]> {
    const result = await this.pool.query<LibraryComponentRow>(
      `SELECT id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
              entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at
       FROM library_components
       WHERE is_archived = FALSE
         AND (is_active = TRUE OR $3 = TRUE)
         AND (
           is_reviewed = TRUE
           OR entered_by_user_id = $1
           OR $2 = TRUE
         )
       ORDER BY part_number ASC`
      ,
      [input.requestingUserId, input.canViewAllUnreviewed, input.canViewInactive]
    );
    const valueMap = await this.getCustomFieldValuesByComponentIds(result.rows.map((row) => row.id));
    return result.rows.map((row) => mapLibraryComponent(row, valueMap.get(row.id) ?? {}));
  }

  async getLibraryComponent(input: {
    componentId: string;
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<LibraryComponentRecord | null> {
    const result = await this.pool.query<LibraryComponentRow>(
      `SELECT id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
              entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at
       FROM library_components
       WHERE id = $1
         AND is_archived = FALSE
         AND (is_active = TRUE OR $4 = TRUE)
         AND (
           is_reviewed = TRUE
           OR entered_by_user_id = $2
           OR $3 = TRUE
         )`,
      [input.componentId, input.requestingUserId, input.canViewAllUnreviewed, input.canViewInactive]
    );
    if (!result.rows[0]) {
      return null;
    }
    const valueMap = await this.getCustomFieldValuesByComponentIds([result.rows[0].id]);
    return mapLibraryComponent(result.rows[0], valueMap.get(result.rows[0].id) ?? {});
  }

  async setLibraryComponentReview(input: {
    componentId: string;
    isReviewed: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<LibraryComponentRecord | null> {
    const reviewedAt = input.isReviewed ? new Date(input.reviewedAt ?? new Date().toISOString()) : null;
    const reviewedBy = input.isReviewed ? (input.reviewedByUserId ?? "system-user") : null;
    const editedBy = reviewedBy ?? input.reviewedByUserId ?? "system-user";
    const result = await this.pool.query<LibraryComponentRow>(
      `UPDATE library_components
       SET is_reviewed = $1,
           reviewed_by_user_id = $2,
           reviewed_at = $3,
           last_edited_by_user_id = $4,
           last_edited_at = NOW(),
           updated_at = NOW()
       WHERE id = $5 AND is_archived = FALSE
       RETURNING id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
                 entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at`,
      [input.isReviewed, reviewedBy, reviewedAt, editedBy, input.componentId]
    );
    if (!result.rows[0]) {
      return null;
    }
    const valueMap = await this.getCustomFieldValuesByComponentIds([result.rows[0].id]);
    return mapLibraryComponent(result.rows[0], valueMap.get(result.rows[0].id) ?? {});
  }

  async archiveLibraryComponent(input: {
    componentId: string;
    archivedByUserId: string;
  }): Promise<LibraryComponentRecord | null> {
    const result = await this.pool.query<LibraryComponentRow>(
      `UPDATE library_components
       SET is_archived = TRUE,
           archived_at = NOW(),
           archived_by_user_id = $1,
           last_edited_by_user_id = $1,
           last_edited_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND is_archived = FALSE
       RETURNING id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
                 entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at`,
      [input.archivedByUserId, input.componentId]
    );
    if (!result.rows[0]) {
      return null;
    }
    const valueMap = await this.getCustomFieldValuesByComponentIds([result.rows[0].id]);
    return mapLibraryComponent(result.rows[0], valueMap.get(result.rows[0].id) ?? {});
  }

  async deleteLibraryComponent(input: { componentId: string }): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM library_components
       WHERE id = $1
       RETURNING id`,
      [input.componentId]
    );
    return (result.rowCount ?? 0) > 0;
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<LibraryComponentRow>(
      `UPDATE library_components
       SET part_number = COALESCE($1, part_number),
           family = COALESCE($2, family),
           description = COALESCE($3, description),
           awg = COALESCE($4, awg),
           color = COALESCE($5, color),
           is_active = COALESCE($6, is_active),
           stock_status = COALESCE($7, stock_status),
           compatibility_hints_json = COALESCE($8::jsonb, compatibility_hints_json),
           is_reviewed = COALESCE($9, is_reviewed),
           reviewed_by_user_id = CASE
             WHEN COALESCE($9, is_reviewed) = FALSE THEN NULL
             ELSE COALESCE($10, reviewed_by_user_id)
           END,
           reviewed_at = CASE
             WHEN COALESCE($9, is_reviewed) = FALSE THEN NULL
             ELSE COALESCE($11::timestamptz, reviewed_at)
           END,
           entered_by_user_id = COALESCE($12, entered_by_user_id),
           entered_at = COALESCE($13::timestamptz, entered_at),
           last_edited_by_user_id = COALESCE($14, $15, last_edited_by_user_id),
           last_edited_at = COALESCE($16::timestamptz, NOW()),
           updated_at = NOW()
       WHERE id = $17 AND is_archived = FALSE
       RETURNING id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
                 entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at`,
      [
        input.partNumber ?? null,
        input.family ?? null,
        input.description ?? null,
        input.awg ?? null,
        input.color ?? null,
        input.isActive ?? null,
        input.stockStatus ?? null,
        input.compatibilityHints ? JSON.stringify(input.compatibilityHints) : null,
        input.isReviewed ?? null,
        input.reviewedByUserId ?? null,
        input.reviewedAt ?? null,
        input.createdByUserId ?? null,
        input.createdAt ?? null,
        input.lastEditedByUserId ?? null,
        input.editedByUserId ?? null,
        input.lastEditedAt ?? null,
        input.componentId
      ]
    );
      if (result.rows[0]?.category === "wire" && (!result.rows[0].awg || !result.rows[0].color)) {
        throw new Error("WIRE_FIELDS_REQUIRED");
      }
      if (!result.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      if (input.customFieldValues) {
        await this.upsertCustomFieldValues(client, result.rows[0].id, result.rows[0].category, input.customFieldValues);
      }
      await client.query("COMMIT");
      const valueMap = await this.getCustomFieldValuesByComponentIds([result.rows[0].id], client);
      return mapLibraryComponent(result.rows[0], valueMap.get(result.rows[0].id) ?? {});
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureBuiltinFieldDefinitions(category: LibraryCategory): Promise<void> {
    const builtins = BUILTIN_FIELDS_BY_CATEGORY[category];
    for (const field of builtins) {
      await this.pool.query(
        `INSERT INTO library_field_definitions (
           id, category, key, label, value_type, is_system, is_visible_in_viewer, show_on_add_form, show_in_search, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'text', TRUE, $5, $6, $7, 'system-user', NOW(), NOW())
         ON CONFLICT (category, key) DO NOTHING`,
        [
          builtinFieldDefinitionId(category, field.key),
          category,
          field.key,
          field.label,
          field.isVisibleInViewer,
          field.showOnAddForm ?? false,
          field.showInSearch ?? false
        ]
      );
    }
  }

  async listLibraryFieldDefinitions(input: {
    category: LibraryCategory;
  }): Promise<LibraryFieldDefinitionRecord[]> {
    await this.ensureBuiltinFieldDefinitions(input.category);
    const result = await this.pool.query<LibraryFieldDefinitionRow>(
      `SELECT id, category, key, label, value_type, is_system, is_visible_in_viewer, show_on_add_form, show_in_search, created_by_user_id, created_at, updated_at
       FROM library_field_definitions
       WHERE category = $1
       ORDER BY label ASC`,
      [input.category]
    );
    return result.rows.map(mapLibraryFieldDefinition);
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
    const result = await this.pool.query<LibraryFieldDefinitionRow>(
      `INSERT INTO library_field_definitions (
         id, category, key, label, value_type, is_system, is_visible_in_viewer, show_on_add_form, show_in_search, created_by_user_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8, $9, NOW(), NOW())
       RETURNING id, category, key, label, value_type, is_system, is_visible_in_viewer, show_on_add_form, show_in_search, created_by_user_id, created_at, updated_at`,
      [
        crypto.randomUUID(),
        input.category,
        input.key,
        input.label,
        input.valueType,
        input.isVisibleInViewer,
        input.showOnAddForm,
        input.showInSearch,
        input.createdByUserId
      ]
    );
    return mapLibraryFieldDefinition(result.rows[0]);
  }

  async updateLibraryFieldDefinition(input: {
    fieldDefinitionId: string;
    label?: string;
    isVisibleInViewer?: boolean;
    showOnAddForm?: boolean;
    showInSearch?: boolean;
  }): Promise<LibraryFieldDefinitionRecord | null> {
    const result = await this.pool.query<LibraryFieldDefinitionRow>(
      `UPDATE library_field_definitions
       SET label = COALESCE($2, label),
           is_visible_in_viewer = COALESCE($3, is_visible_in_viewer),
           show_on_add_form = COALESCE($4, show_on_add_form),
           show_in_search = COALESCE($5, show_in_search),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, category, key, label, value_type, is_system, is_visible_in_viewer, show_on_add_form, show_in_search, created_by_user_id, created_at, updated_at`,
      [
        input.fieldDefinitionId,
        input.label ?? null,
        input.isVisibleInViewer ?? null,
        input.showOnAddForm ?? null,
        input.showInSearch ?? null
      ]
    );
    return result.rows[0] ? mapLibraryFieldDefinition(result.rows[0]) : null;
  }

  async deleteLibraryFieldDefinition(input: { fieldDefinitionId: string }): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM library_field_definitions
       WHERE id = $1
       RETURNING id`,
      [input.fieldDefinitionId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listLibraryReviewQueue(input?: {
    category?: LibraryCategory;
    family?: string;
    enteredByUserId?: string;
  }): Promise<LibraryReviewQueueRecord[]> {
    const result = await this.pool.query<LibraryComponentRow>(
      `SELECT id, category, family, part_number, description, awg, color, is_active, stock_status, compatibility_hints_json,
              entered_by_user_id, entered_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at
       FROM library_components
       WHERE is_archived = FALSE
         AND is_reviewed = FALSE
         AND ($1::text IS NULL OR category = $1::text)
         AND ($2::text IS NULL OR lower(family) = lower($2::text))
         AND ($3::text IS NULL OR entered_by_user_id = $3::text)
       ORDER BY entered_at ASC`,
      [input?.category ?? null, input?.family ?? null, input?.enteredByUserId ?? null]
    );
    const valueMap = await this.getCustomFieldValuesByComponentIds(result.rows.map((row) => row.id));
    return result.rows.map((row) => mapLibraryReviewQueueRecord(row, valueMap.get(row.id) ?? {}));
  }

  async getUserTablePreferences(input: { userId: string; scope: string }): Promise<TablePreferencesRecord | null> {
    const result = await this.pool.query<UserTablePreferenceRow>(
      `SELECT user_id, scope, column_order, column_widths, updated_at
       FROM user_table_preferences
       WHERE user_id = $1 AND scope = $2`,
      [input.userId, input.scope]
    );
    return result.rows[0] ? mapUserTablePreference(result.rows[0]) : null;
  }

  async upsertUserTablePreferences(input: {
    userId: string;
    scope: string;
    columnOrder: string[];
    columnWidths: Record<string, number>;
  }): Promise<TablePreferencesRecord> {
    const result = await this.pool.query<UserTablePreferenceRow>(
      `INSERT INTO user_table_preferences (user_id, scope, column_order, column_widths, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (user_id, scope)
       DO UPDATE SET
         column_order = EXCLUDED.column_order,
         column_widths = EXCLUDED.column_widths,
         updated_at = NOW()
       RETURNING user_id, scope, column_order, column_widths, updated_at`,
      [input.userId, input.scope, input.columnOrder, JSON.stringify(input.columnWidths)]
    );
    return mapUserTablePreference(result.rows[0]);
  }

  private async rollbackSilently(client: PoolClient): Promise<void> {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures so original error can bubble up
    }
  }
}
