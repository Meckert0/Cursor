export type DesignStatus =
  | "draft"
  | "locked"
  | "submitted"
  | "in_review"
  | "quoted"
  | "released";

export type UserId = string;

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
}

export type ProjectMemberRole = "viewer" | "editor" | "owner" | "supplier_reviewer";

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
}

export interface Design {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: DesignStatus;
  currentRevisionId: string;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
  id: string;
  designId: string;
  revisionNumber: number;
  baseRevisionId?: string;
  createdBy: UserId;
  createdAt: string;
  rulesetVersion: string;
  libraryVersion: string;
  snapshot: DesignSnapshot;
}

export interface DesignSnapshot {
  connectors: Array<{
    id: string;
    reference: string;
    partNumber?: string;
    libraryComponentId?: string;
    backshellPartNumber?: string;
    backshellLibraryComponentId?: string;
    strainReliefPartNumber?: string;
    strainReliefLibraryComponentId?: string;
    pins: Array<{ id: string; number: string }>;
    location?: { x: number; y: number };
  }>;
  junctions?: Array<{
    id: string;
    location: { x: number; y: number };
    label?: string;
    junctionType?: string;
  }>;
  paths: Array<{
    id: string;
    runNumber?: number;
    wireName?: string;
    fromConnectorId: string;
    toConnectorId: string;
    pathType: string;
    length?: number;
    sleeving?: "none" | "expandable_sleeving" | "wire_braid_under_expandable_sleeving";
    wireComponentId?: string;
    fromContact?: string;
    fromSignalDescription?: string;
    wireAwg?: string;
    wirePartNumber?: string;
    wireColor?: string;
    wireGroup?: string;
    toContact?: string;
    toSignalDescription?: string;
    labelPartNumber?: string;
    labelText?: string;
    notes?: string;
  }>;
  pinMappings: Array<{
    id: string;
    pathId: string;
    fromConnectorId: string;
    fromPinId: string;
    toConnectorId: string;
    toPinId: string;
    mappingType: "one_to_one" | "one_to_many" | "loopback";
  }>;
  bundles: Array<{ id: string; name: string; pathIds: string[] }>;
  annotations: Array<{ id: string; text: string }>;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  entityType?: string;
  entityId?: string;
  message: string;
}

export interface ValidationReport {
  errors: number;
  warnings: number;
  infos: number;
  results: ValidationIssue[];
}

export interface ValidationRun {
  id: string;
  revisionId: string;
  rulesetVersion: string;
  mode: "quick" | "full";
  status: "completed";
  snapshotHash: string;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  results: ValidationIssue[];
  createdAt: string;
}

export interface QuoteSubmission {
  id: string;
  designId: string;
  revisionId: string;
  validationRunId: string;
  message?: string;
  idempotencyKey?: string;
  status: "received";
  estimatedResponseHours: number;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  designId: string;
  eventType: "design.state.changed";
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ExportArtifact {
  id: string;
  revisionId: string;
  format: "json" | "pdf" | "xlsx";
  status: "queued" | "processing" | "completed" | "failed";
  contentHash?: string;
  artifactUri?: string;
  errorMessage?: string;
  attemptCount: number;
  nextAttemptAt?: string;
  failureKind?: "transient" | "permanent";
  createdAt: string;
  updatedAt: string;
}

export interface RulesetVersion {
  version: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRulesetPolicy {
  projectId: string;
  defaultRulesetVersion?: string;
  allowedRulesetVersions: string[];
  /** When set, overrides ruleset default severity for inactive library parts. */
  inactivePartSeverity?: "error" | "warning";
  /** When set, overrides ruleset default severity for unreviewed library parts. */
  unreviewedPartSeverity?: "error" | "warning" | "info";
  /** When set, overrides ruleset default severity for out-of-stock library parts. */
  outOfStockSeverity?: "error" | "warning" | "info";
  createdAt: string;
  updatedAt: string;
}
