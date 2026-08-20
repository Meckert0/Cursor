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
  AwgCmaReference,
  LibraryCategory,
  PartIngestItem,
  LibraryIngestResult,
  PartWithAttributes,
  LibraryReviewQueueRecord,
  CompatStatus,
  ContactWireCompat,
  ModuleContactCompat,
  ModuleBackshellCompat,
  ModuleStrainReliefCompat,
  PartAlias,
  ModuleAttributes,
  ModuleContactPosition,
  ContactAttributes,
  WireAttributes,
  LabelAttributes,
  SleeveTubeBraidAttributes,
  SleeveSizeRange,
  BackshellAttributes,
  BackshellFitment,
  StrainReliefAttributes,
  SpliceAttributes,
  FrameAttributes,
  CategoryAttributesMap,
  PartRelationship,
  PartRelationshipInput
} from "../../domain/library.js";
import { emptyAttributesForCategory, normalizePartRelationship } from "../../domain/library.js";
import { hashDesignSnapshot } from "../../domain/snapshot-hash.js";
import type { TablePreferencesRecord } from "../../domain/table-preferences.js";
import type { Store } from "./store.js";

const PART_COLUMNS = `id, category, family, part_number, description, is_active, stock_status, import_batch_id,
              created_by_user_id, created_at, last_edited_by_user_id, last_edited_at, is_reviewed, reviewed_by_user_id, reviewed_at,
              is_archived, archived_at, archived_by_user_id, updated_at,
              part_type, side, notes, electrical_mode, extra_attributes`;

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
  snapshot_hash: string;
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
  inactive_part_severity: "error" | "warning" | null;
  out_of_stock_severity: "error" | "warning" | "info" | null;
  unreviewed_part_severity: "error" | "warning" | "info" | null;
  created_at: Date;
  updated_at: Date;
};

type PartRow = {
  id: string;
  category: LibraryCategory;
  family: string;
  part_number: string;
  description: string;
  is_active: boolean;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  import_batch_id: string | null;
  created_by_user_id: string;
  created_at: Date;
  last_edited_by_user_id: string;
  last_edited_at: Date;
  is_reviewed: boolean;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  is_archived: boolean;
  archived_at: Date | null;
  archived_by_user_id: string | null;
  updated_at: Date;
  part_type: string | null;
  side: string | null;
  notes: string | null;
  electrical_mode: string | null;
  extra_attributes: unknown;
};

type ModuleExtRow = {
  part_id: string;
  genre: string | null;
  gender: string | null;
  contact_family_1: string | null;
  pin_count: number | null;
  contact_family_2: string | null;
  pin_count_2: number | null;
  emi: boolean | null;
  crimp_gauge: string | null;
  contact_size: string | null;
  amp_rating: string | null;
  operating_voltage: string | null;
  operating_temp: string | null;
  default_protective_cover_part_id: string | null;
  insert_arrangement: string | null;
  pin_ids_json: unknown;
  position_count: number | null;
  sim_slot_count: number | null;
  sim_slot_sections_json: unknown;
  slot_occupancy: number | null;
};

type ModuleContactPositionRow = {
  module_part_id: string;
  contact_size: string;
  contact_family: string | null;
  pin_count: number;
};

type ContactExtRow = {
  part_id: string;
  genre: string | null;
  gender: string | null;
  awg: string | null;
  plating: string | null;
  term_type: string | null;
  ss_compatible: boolean | null;
  length_added: number | null;
  accepted_awg_min: number | null;
  accepted_awg_max: number | null;
  accepted_families_json: string[] | null;
  contact_size: string | null;
  stud_size: string | null;
  tih: boolean | null;
  accepted_gauges_json: unknown;
  wire_interface: string | null;
};

type WireExtRow = {
  part_id: string;
  mil_spec: string | null;
  awg: string;
  color: string;
  cma: number | null;
  wire_type: string | null;
  insulation_material: string | null;
  overall_dia: number | null;
  conductor_dia: number | null;
  number_of_conductors: number | null;
  temp_max: number | null;
  overall_wire_braid: boolean | null;
  overall_wire_foil: boolean | null;
  internal_pair_foil: boolean | null;
  weight_per_ft: number | null;
  k1: number | null;
  k2: number | null;
  loss_coefficient: number | null;
  max_freq: number | null;
  impedance: number | null;
  max_voltage: number | null;
};

type LabelExtRow = {
  part_id: string;
  series: string | null;
  awg_min: number | null;
  awg_max: number | null;
  length_in: number | null;
  dia_in: number | null;
};

type SleeveTubeBraidExtRow = {
  part_id: string;
};

type SleeveSizeRangeRow = {
  part_id: string;
  min_dia: number;
  max_dia: number;
  related_part_id: string | null;
};

type BackshellExtRow = {
  part_id: string;
  keying_part_id: string | null;
  length_added: number | null;
  bundle_allowance: number | null;
};

type BackshellFitmentRow = {
  part_id: string;
  family_type: string;
  gender: string;
  backshell_size: string;
  emi: boolean;
};

type StrainReliefExtRow = {
  part_id: string;
  gender: string | null;
  requires_backshell: boolean | null;
  related_module_hint_part_id: string | null;
};

type SpliceExtRow = {
  part_id: string;
  conductor_count: number | null;
  awg: string | null;
  manufacturer_pn: string | null;
  variant: string | null;
  cma_min: number | null;
  cma_max: number | null;
};

type FrameExtRow = {
  part_id: string;
  module_capacity: number | null;
  slot_ids_json: unknown;
};

type PartRelationshipRow = {
  id: string;
  parent_part_id: string;
  compatible_parts: string | null;
  relationship_type: string;
  position_type: string | null;
  parent_positions_json: unknown;
  status: CompatStatus;
  source_status: string | null;
  notes: string | null;
  extra_json: unknown;
};

type PartAliasRow = {
  part_id: string;
  code_system: string;
  code: string;
};

type ContactWireCompatRow = {
  contact_part_id: string;
  wire_part_id: string;
  status: CompatStatus;
  notes: string | null;
  crimp_class: string | null;
};

type ModuleContactCompatRow = {
  module_part_id: string;
  contact_part_id: string;
  status: CompatStatus;
  notes: string | null;
  source: string | null;
};

type ModuleBackshellCompatRow = {
  module_part_id: string;
  backshell_part_id: string;
  status: CompatStatus;
  notes: string | null;
  source: string | null;
};

type ModuleStrainReliefCompatRow = {
  module_part_id: string;
  strain_relief_part_id: string;
  status: CompatStatus;
  notes: string | null;
  source: string | null;
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
    snapshotHash: row.snapshot_hash,
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
    inactivePartSeverity: row.inactive_part_severity ?? undefined,
    outOfStockSeverity: row.out_of_stock_severity ?? undefined,
    unreviewedPartSeverity: row.unreviewed_part_severity ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function optionalString(value: string | null | undefined): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return value;
}

function optionalNumber(value: number | null | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  return value;
}

function optionalBoolean(value: boolean | null | undefined): boolean | undefined {
  if (value == null) {
    return undefined;
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry));
}

function asStringMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((row) => (Array.isArray(row) ? row.map((entry) => String(entry)) : []));
}

function extraAttributesOrUndefined(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : undefined;
}

function extraOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return extraAttributesOrUndefined(value);
}

function groupRowsByKey<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const rowKey = key(row);
    const group = grouped.get(rowKey);
    if (group) {
      group.push(row);
    } else {
      grouped.set(rowKey, [row]);
    }
  }
  return grouped;
}

function mapPartRecord(row: PartRow): Omit<PartWithAttributes, "attributes"> {
  return {
    id: row.id,
    category: row.category,
    family: row.family,
    partNumber: row.part_number,
    description: row.description,
    isActive: row.is_active,
    isReviewed: row.is_reviewed,
    reviewedByUserId: row.reviewed_by_user_id ?? undefined,
    reviewedAt: row.reviewed_at?.toISOString(),
    stockStatus: row.stock_status,
    isArchived: row.is_archived,
    archivedAt: row.archived_at?.toISOString(),
    archivedByUserId: row.archived_by_user_id ?? undefined,
    importBatchId: row.import_batch_id ?? undefined,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at.toISOString(),
    lastEditedByUserId: row.last_edited_by_user_id,
    lastEditedAt: row.last_edited_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    partType: optionalString(row.part_type),
    side: optionalString(row.side),
    notes: optionalString(row.notes),
    electricalMode: optionalString(row.electrical_mode),
    extraAttributes: extraAttributesOrUndefined(row.extra_attributes)
  };
}

function mapModuleAttributes(
  row: ModuleExtRow | undefined,
  contactPositions: ModuleContactPositionRow[]
): ModuleAttributes {
  const base = emptyAttributesForCategory("module") as ModuleAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    genre: optionalString(row.genre),
    gender: optionalString(row.gender),
    contactFamily1: optionalString(row.contact_family_1),
    pinCount: optionalNumber(row.pin_count),
    contactFamily2: optionalString(row.contact_family_2),
    pinCount2: optionalNumber(row.pin_count_2),
    emi: optionalBoolean(row.emi),
    crimpGauge: optionalString(row.crimp_gauge),
    contactSize: optionalString(row.contact_size),
    ampRating: optionalString(row.amp_rating),
    operatingVoltage: optionalString(row.operating_voltage),
    operatingTemp: optionalString(row.operating_temp),
    defaultProtectiveCoverPartId: optionalString(row.default_protective_cover_part_id),
    insertArrangement: optionalString(row.insert_arrangement),
    contactPositions: contactPositions.map((position) => ({
      contactSize: position.contact_size,
      contactFamily: optionalString(position.contact_family),
      pinCount: position.pin_count
    })),
    pinIds: asStringArray(row.pin_ids_json),
    positionCount: optionalNumber(row.position_count),
    simSlotCount: optionalNumber(row.sim_slot_count),
    simSlotSections: asStringMatrix(row.sim_slot_sections_json),
    slotOccupancy: optionalNumber(row.slot_occupancy)
  };
}

function mapContactAttributes(row: ContactExtRow | undefined): ContactAttributes {
  const base = emptyAttributesForCategory("contact") as ContactAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    genre: optionalString(row.genre),
    gender: optionalString(row.gender),
    awg: optionalString(row.awg),
    plating: optionalString(row.plating),
    termType: optionalString(row.term_type),
    ssCompatible: optionalBoolean(row.ss_compatible),
    lengthAdded: optionalNumber(row.length_added),
    acceptedAwgMin: optionalNumber(row.accepted_awg_min),
    acceptedAwgMax: optionalNumber(row.accepted_awg_max),
    acceptedFamilies: asStringArray(row.accepted_families_json),
    contactSize: optionalString(row.contact_size),
    studSize: optionalString(row.stud_size),
    tih: optionalBoolean(row.tih),
    acceptedGauges: asStringArray(row.accepted_gauges_json),
    wireInterface: optionalString(row.wire_interface)
  };
}

function mapWireAttributes(row: WireExtRow | undefined): WireAttributes {
  const base = emptyAttributesForCategory("wire") as WireAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    milSpec: optionalString(row.mil_spec),
    awg: row.awg ?? "",
    color: row.color ?? "",
    cma: optionalNumber(row.cma),
    wireType: optionalString(row.wire_type),
    insulationMaterial: optionalString(row.insulation_material),
    overallDia: optionalNumber(row.overall_dia),
    conductorDia: optionalNumber(row.conductor_dia),
    numberOfConductors: optionalNumber(row.number_of_conductors),
    tempMax: optionalNumber(row.temp_max),
    overallWireBraid: optionalBoolean(row.overall_wire_braid),
    overallWireFoil: optionalBoolean(row.overall_wire_foil),
    internalPairFoil: optionalBoolean(row.internal_pair_foil),
    weightPerFt: optionalNumber(row.weight_per_ft),
    k1: optionalNumber(row.k1),
    k2: optionalNumber(row.k2),
    lossCoefficient: optionalNumber(row.loss_coefficient),
    maxFreq: optionalNumber(row.max_freq),
    impedance: optionalNumber(row.impedance),
    maxVoltage: optionalNumber(row.max_voltage)
  };
}

function mapLabelAttributes(row: LabelExtRow | undefined): LabelAttributes {
  const base = emptyAttributesForCategory("label") as LabelAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    series: optionalString(row.series),
    awgMin: optionalNumber(row.awg_min),
    awgMax: optionalNumber(row.awg_max),
    lengthIn: optionalNumber(row.length_in),
    diaIn: optionalNumber(row.dia_in)
  };
}

function mapSleeveTubeBraidAttributes(
  row: SleeveTubeBraidExtRow | undefined,
  sizeRanges: SleeveSizeRangeRow[]
): SleeveTubeBraidAttributes {
  const base = emptyAttributesForCategory("sleeve-tube-braid") as SleeveTubeBraidAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    sizeRanges: sizeRanges.map((sizeRange) => ({
      minDia: sizeRange.min_dia,
      maxDia: sizeRange.max_dia,
      relatedPartId: optionalString(sizeRange.related_part_id)
    }))
  };
}

function mapBackshellAttributes(row: BackshellExtRow | undefined, fitments: BackshellFitmentRow[]): BackshellAttributes {
  const base = emptyAttributesForCategory("backshell") as BackshellAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    keyingPartId: optionalString(row.keying_part_id),
    lengthAdded: optionalNumber(row.length_added),
    bundleAllowance: optionalNumber(row.bundle_allowance),
    fitments: fitments.map((fitment) => ({
      familyType: fitment.family_type,
      gender: optionalString(fitment.gender),
      backshellSize: optionalString(fitment.backshell_size),
      emi: fitment.emi
    }))
  };
}

function mapStrainReliefAttributes(row: StrainReliefExtRow | undefined): StrainReliefAttributes {
  const base = emptyAttributesForCategory("strain-relief") as StrainReliefAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    gender: optionalString(row.gender),
    requiresBackshell: optionalBoolean(row.requires_backshell),
    relatedModuleHintPartId: optionalString(row.related_module_hint_part_id)
  };
}

function mapSpliceAttributes(row: SpliceExtRow | undefined): SpliceAttributes {
  const base = emptyAttributesForCategory("splice") as SpliceAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    conductorCount: optionalNumber(row.conductor_count),
    awg: optionalString(row.awg),
    manufacturerPn: optionalString(row.manufacturer_pn),
    variant: optionalString(row.variant),
    cmaMin: optionalNumber(row.cma_min),
    cmaMax: optionalNumber(row.cma_max)
  };
}

function mapFrameAttributes(row: FrameExtRow | undefined): FrameAttributes {
  const base = emptyAttributesForCategory("frame") as FrameAttributes;
  if (!row) {
    return base;
  }
  return {
    ...base,
    moduleCapacity: optionalNumber(row.module_capacity),
    slotIds: asStringArray(row.slot_ids_json)
  };
}

function attributesForPart(
  row: PartRow,
  extensions: {
    modules: Map<string, ModuleExtRow>;
    moduleContactPositions: Map<string, ModuleContactPositionRow[]>;
    contacts: Map<string, ContactExtRow>;
    wires: Map<string, WireExtRow>;
    labels: Map<string, LabelExtRow>;
    sleeveTubeBraids: Map<string, SleeveTubeBraidExtRow>;
    sleeveSizeRanges: Map<string, SleeveSizeRangeRow[]>;
    backshells: Map<string, BackshellExtRow>;
    backshellFitments: Map<string, BackshellFitmentRow[]>;
    strainReliefs: Map<string, StrainReliefExtRow>;
    splices: Map<string, SpliceExtRow>;
    frames: Map<string, FrameExtRow>;
  }
): CategoryAttributesMap[LibraryCategory] {
  switch (row.category) {
    case "module":
      return mapModuleAttributes(extensions.modules.get(row.id), extensions.moduleContactPositions.get(row.id) ?? []);
    case "contact":
      return mapContactAttributes(extensions.contacts.get(row.id));
    case "wire":
      return mapWireAttributes(extensions.wires.get(row.id));
    case "label":
      return mapLabelAttributes(extensions.labels.get(row.id));
    case "sleeve-tube-braid":
      return mapSleeveTubeBraidAttributes(extensions.sleeveTubeBraids.get(row.id), extensions.sleeveSizeRanges.get(row.id) ?? []);
    case "backshell":
      return mapBackshellAttributes(extensions.backshells.get(row.id), extensions.backshellFitments.get(row.id) ?? []);
    case "strain-relief":
      return mapStrainReliefAttributes(extensions.strainReliefs.get(row.id));
    case "splice":
      return mapSpliceAttributes(extensions.splices.get(row.id));
    case "frame":
      return mapFrameAttributes(extensions.frames.get(row.id));
  }
}

async function loadExtensionMaps(
  queryClient: Pool | PoolClient,
  partIds: string[]
): Promise<{
  modules: Map<string, ModuleExtRow>;
  moduleContactPositions: Map<string, ModuleContactPositionRow[]>;
  contacts: Map<string, ContactExtRow>;
  wires: Map<string, WireExtRow>;
  labels: Map<string, LabelExtRow>;
  sleeveTubeBraids: Map<string, SleeveTubeBraidExtRow>;
  sleeveSizeRanges: Map<string, SleeveSizeRangeRow[]>;
  backshells: Map<string, BackshellExtRow>;
  backshellFitments: Map<string, BackshellFitmentRow[]>;
  strainReliefs: Map<string, StrainReliefExtRow>;
  splices: Map<string, SpliceExtRow>;
  frames: Map<string, FrameExtRow>;
}> {
  const empty = {
    modules: new Map<string, ModuleExtRow>(),
    moduleContactPositions: new Map<string, ModuleContactPositionRow[]>(),
    contacts: new Map<string, ContactExtRow>(),
    wires: new Map<string, WireExtRow>(),
    labels: new Map<string, LabelExtRow>(),
    sleeveTubeBraids: new Map<string, SleeveTubeBraidExtRow>(),
    sleeveSizeRanges: new Map<string, SleeveSizeRangeRow[]>(),
    backshells: new Map<string, BackshellExtRow>(),
    backshellFitments: new Map<string, BackshellFitmentRow[]>(),
    strainReliefs: new Map<string, StrainReliefExtRow>(),
    splices: new Map<string, SpliceExtRow>(),
    frames: new Map<string, FrameExtRow>()
  };
  if (partIds.length === 0) {
    return empty;
  }

  const [modules, moduleContactPositions, contacts, wires, labels, sleeveTubeBraids, sleeveSizeRanges, backshells, backshellFitments, strainReliefs, splices, frames] =
    await Promise.all([
      queryClient.query<ModuleExtRow>(`SELECT * FROM modules WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<ModuleContactPositionRow>(
        `SELECT * FROM module_contact_positions WHERE module_part_id = ANY($1::text[])`,
        [partIds]
      ),
      queryClient.query<ContactExtRow>(`SELECT * FROM contacts WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<WireExtRow>(`SELECT * FROM wires WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<LabelExtRow>(`SELECT * FROM labels WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<SleeveTubeBraidExtRow>(
        `SELECT * FROM sleeve_tube_braids WHERE part_id = ANY($1::text[])`,
        [partIds]
      ),
      queryClient.query<SleeveSizeRangeRow>(`SELECT * FROM sleeve_size_ranges WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<BackshellExtRow>(`SELECT * FROM backshells WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<BackshellFitmentRow>(`SELECT * FROM backshell_fitments WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<StrainReliefExtRow>(
        `SELECT * FROM strain_reliefs WHERE part_id = ANY($1::text[])`,
        [partIds]
      ),
      queryClient.query<SpliceExtRow>(`SELECT * FROM splices WHERE part_id = ANY($1::text[])`, [partIds]),
      queryClient.query<FrameExtRow>(`SELECT * FROM frames WHERE part_id = ANY($1::text[])`, [partIds])
    ]);

  return {
    modules: new Map(modules.rows.map((row) => [row.part_id, row])),
    moduleContactPositions: groupRowsByKey(moduleContactPositions.rows, (row) => row.module_part_id),
    contacts: new Map(contacts.rows.map((row) => [row.part_id, row])),
    wires: new Map(wires.rows.map((row) => [row.part_id, row])),
    labels: new Map(labels.rows.map((row) => [row.part_id, row])),
    sleeveTubeBraids: new Map(sleeveTubeBraids.rows.map((row) => [row.part_id, row])),
    sleeveSizeRanges: groupRowsByKey(sleeveSizeRanges.rows, (row) => row.part_id),
    backshells: new Map(backshells.rows.map((row) => [row.part_id, row])),
    backshellFitments: groupRowsByKey(backshellFitments.rows, (row) => row.part_id),
    strainReliefs: new Map(strainReliefs.rows.map((row) => [row.part_id, row])),
    splices: new Map(splices.rows.map((row) => [row.part_id, row])),
    frames: new Map(frames.rows.map((row) => [row.part_id, row]))
  };
}

async function loadPartsWithAttributes(
  queryClient: Pool | PoolClient,
  rows: PartRow[]
): Promise<PartWithAttributes[]> {
  const extensions = await loadExtensionMaps(
    queryClient,
    rows.map((row) => row.id)
  );
  return rows.map((row) => {
    const base = mapPartRecord(row);
    return {
      ...base,
      attributes: attributesForPart(row, extensions)
    } as PartWithAttributes;
  });
}

async function loadPartWithAttributes(
  queryClient: Pool | PoolClient,
  partId: string
): Promise<PartWithAttributes | null> {
  const result = await queryClient.query<PartRow>(
    `SELECT ${PART_COLUMNS}
     FROM parts
     WHERE id = $1`,
    [partId]
  );
  if (!result.rows[0]) {
    return null;
  }
  const parts = await loadPartsWithAttributes(queryClient, result.rows);
  return parts[0] ?? null;
}

function mapLibraryReviewQueueRecord(part: PartWithAttributes): LibraryReviewQueueRecord {
  return {
    ...part,
    enteredByUserId: part.createdByUserId,
    enteredAt: part.createdAt
  };
}

function mapPartAlias(row: PartAliasRow): PartAlias {
  return {
    partId: row.part_id,
    codeSystem: row.code_system,
    code: row.code
  };
}

function mapContactWireCompat(row: ContactWireCompatRow): ContactWireCompat {
  return {
    contactPartId: row.contact_part_id,
    wirePartId: row.wire_part_id,
    status: row.status,
    notes: row.notes ?? undefined,
    crimpClass: row.crimp_class ?? undefined
  };
}

function mapModuleContactCompat(row: ModuleContactCompatRow): ModuleContactCompat {
  return {
    modulePartId: row.module_part_id,
    contactPartId: row.contact_part_id,
    status: row.status,
    notes: row.notes ?? undefined,
    source: row.source ?? undefined
  };
}

function mapModuleBackshellCompat(row: ModuleBackshellCompatRow): ModuleBackshellCompat {
  return {
    modulePartId: row.module_part_id,
    backshellPartId: row.backshell_part_id,
    status: row.status,
    notes: row.notes ?? undefined,
    source: row.source ?? undefined
  };
}

function mapModuleStrainReliefCompat(row: ModuleStrainReliefCompatRow): ModuleStrainReliefCompat {
  return {
    modulePartId: row.module_part_id,
    strainReliefPartId: row.strain_relief_part_id,
    status: row.status,
    notes: row.notes ?? undefined,
    source: row.source ?? undefined
  };
}

function mapPartRelationship(row: PartRelationshipRow): PartRelationship {
  return normalizePartRelationship({
    id: row.id,
    parentPartId: row.parent_part_id,
    compatibleParts: row.compatible_parts ?? undefined,
    relationshipType: row.relationship_type,
    positionType: row.position_type ?? undefined,
    parentPositions: asStringArray(row.parent_positions_json),
    status: row.status,
    sourceStatus: row.source_status ?? undefined,
    notes: row.notes ?? undefined,
    extra: extraOrUndefined(row.extra_json)
  });
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

  private async upsertPartAliases(
    client: PoolClient,
    partId: string,
    aliases: Array<{ codeSystem: string; code: string }> | undefined
  ): Promise<void> {
    if (!aliases || aliases.length === 0) {
      return;
    }
    for (const alias of aliases) {
      const codeSystem = alias.codeSystem.trim();
      const code = alias.code.trim();
      if (!codeSystem || !code) {
        continue;
      }
      await client.query(
        `INSERT INTO part_aliases (part_id, code_system, code)
         VALUES ($1, $2, $3)
         ON CONFLICT (code_system, code)
         DO UPDATE SET part_id = EXCLUDED.part_id`,
        [partId, codeSystem, code]
      );
    }
  }

  private async upsertExtensionRow(
    client: PoolClient,
    partId: string,
    category: LibraryCategory,
    attributes: CategoryAttributesMap[LibraryCategory]
  ): Promise<void> {
    switch (category) {
      case "module": {
        const attrs = attributes as ModuleAttributes;
        await client.query(
          `INSERT INTO modules (
             part_id, genre, gender, contact_family_1, pin_count, contact_family_2, pin_count_2,
             emi, crimp_gauge, contact_size, amp_rating, operating_voltage, operating_temp,
             default_protective_cover_part_id, insert_arrangement, pin_ids_json,
             position_count, sim_slot_count, sim_slot_sections_json, slot_occupancy
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13,
             $14, $15, $16::jsonb,
             $17, $18, $19::jsonb, $20
           )
           ON CONFLICT (part_id) DO UPDATE SET
             genre = EXCLUDED.genre,
             gender = EXCLUDED.gender,
             contact_family_1 = EXCLUDED.contact_family_1,
             pin_count = EXCLUDED.pin_count,
             contact_family_2 = EXCLUDED.contact_family_2,
             pin_count_2 = EXCLUDED.pin_count_2,
             emi = EXCLUDED.emi,
             crimp_gauge = EXCLUDED.crimp_gauge,
             contact_size = EXCLUDED.contact_size,
             amp_rating = EXCLUDED.amp_rating,
             operating_voltage = EXCLUDED.operating_voltage,
             operating_temp = EXCLUDED.operating_temp,
             default_protective_cover_part_id = EXCLUDED.default_protective_cover_part_id,
             insert_arrangement = EXCLUDED.insert_arrangement,
             pin_ids_json = EXCLUDED.pin_ids_json,
             position_count = EXCLUDED.position_count,
             sim_slot_count = EXCLUDED.sim_slot_count,
             sim_slot_sections_json = EXCLUDED.sim_slot_sections_json,
             slot_occupancy = EXCLUDED.slot_occupancy`,
          [
            partId,
            attrs.genre ?? null,
            attrs.gender ?? null,
            attrs.contactFamily1 ?? null,
            attrs.pinCount ?? null,
            attrs.contactFamily2 ?? null,
            attrs.pinCount2 ?? null,
            attrs.emi ?? null,
            attrs.crimpGauge ?? null,
            attrs.contactSize ?? null,
            attrs.ampRating ?? null,
            attrs.operatingVoltage ?? null,
            attrs.operatingTemp ?? null,
            attrs.defaultProtectiveCoverPartId ?? null,
            attrs.insertArrangement ?? null,
            JSON.stringify(attrs.pinIds ?? []),
            attrs.positionCount ?? null,
            attrs.simSlotCount ?? null,
            JSON.stringify(attrs.simSlotSections ?? []),
            attrs.slotOccupancy ?? null
          ]
        );
        await client.query(`DELETE FROM module_contact_positions WHERE module_part_id = $1`, [partId]);
        for (const position of attrs.contactPositions ?? []) {
          await client.query(
            `INSERT INTO module_contact_positions (module_part_id, contact_size, contact_family, pin_count)
             VALUES ($1, $2, $3, $4)`,
            [partId, position.contactSize, position.contactFamily ?? null, position.pinCount]
          );
        }
        return;
      }
      case "contact": {
        const attrs = attributes as ContactAttributes;
        await client.query(
          `INSERT INTO contacts (
             part_id, genre, gender, awg, plating, term_type, ss_compatible, length_added,
             accepted_awg_min, accepted_awg_max, accepted_families_json, contact_size, stud_size, tih,
             accepted_gauges_json, wire_interface
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11::jsonb, $12, $13, $14,
             $15::jsonb, $16
           )
           ON CONFLICT (part_id) DO UPDATE SET
             genre = EXCLUDED.genre,
             gender = EXCLUDED.gender,
             awg = EXCLUDED.awg,
             plating = EXCLUDED.plating,
             term_type = EXCLUDED.term_type,
             ss_compatible = EXCLUDED.ss_compatible,
             length_added = EXCLUDED.length_added,
             accepted_awg_min = EXCLUDED.accepted_awg_min,
             accepted_awg_max = EXCLUDED.accepted_awg_max,
             accepted_families_json = EXCLUDED.accepted_families_json,
             contact_size = EXCLUDED.contact_size,
             stud_size = EXCLUDED.stud_size,
             tih = EXCLUDED.tih,
             accepted_gauges_json = EXCLUDED.accepted_gauges_json,
             wire_interface = EXCLUDED.wire_interface`,
          [
            partId,
            attrs.genre ?? null,
            attrs.gender ?? null,
            attrs.awg ?? null,
            attrs.plating ?? null,
            attrs.termType ?? null,
            attrs.ssCompatible ?? null,
            attrs.lengthAdded ?? null,
            attrs.acceptedAwgMin ?? null,
            attrs.acceptedAwgMax ?? null,
            JSON.stringify(attrs.acceptedFamilies ?? []),
            attrs.contactSize ?? null,
            attrs.studSize ?? null,
            attrs.tih ?? null,
            JSON.stringify(attrs.acceptedGauges ?? []),
            attrs.wireInterface ?? null
          ]
        );
        return;
      }
      case "wire": {
        const attrs = attributes as WireAttributes;
        if (!attrs.awg?.trim() || !attrs.color?.trim()) {
          throw new Error("WIRE_FIELDS_REQUIRED");
        }
        await client.query(
          `INSERT INTO wires (
             part_id, mil_spec, awg, color, cma, wire_type, insulation_material,
             overall_dia, conductor_dia, number_of_conductors, temp_max,
             overall_wire_braid, overall_wire_foil, internal_pair_foil, weight_per_ft,
             k1, k2, loss_coefficient, max_freq, impedance, max_voltage
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21
           )
           ON CONFLICT (part_id) DO UPDATE SET
             mil_spec = EXCLUDED.mil_spec,
             awg = EXCLUDED.awg,
             color = EXCLUDED.color,
             cma = EXCLUDED.cma,
             wire_type = EXCLUDED.wire_type,
             insulation_material = EXCLUDED.insulation_material,
             overall_dia = EXCLUDED.overall_dia,
             conductor_dia = EXCLUDED.conductor_dia,
             number_of_conductors = EXCLUDED.number_of_conductors,
             temp_max = EXCLUDED.temp_max,
             overall_wire_braid = EXCLUDED.overall_wire_braid,
             overall_wire_foil = EXCLUDED.overall_wire_foil,
             internal_pair_foil = EXCLUDED.internal_pair_foil,
             weight_per_ft = EXCLUDED.weight_per_ft,
             k1 = EXCLUDED.k1,
             k2 = EXCLUDED.k2,
             loss_coefficient = EXCLUDED.loss_coefficient,
             max_freq = EXCLUDED.max_freq,
             impedance = EXCLUDED.impedance,
             max_voltage = EXCLUDED.max_voltage`,
          [
            partId,
            attrs.milSpec ?? null,
            attrs.awg.trim(),
            attrs.color.trim(),
            attrs.cma ?? null,
            attrs.wireType ?? null,
            attrs.insulationMaterial ?? null,
            attrs.overallDia ?? null,
            attrs.conductorDia ?? null,
            attrs.numberOfConductors ?? null,
            attrs.tempMax ?? null,
            attrs.overallWireBraid ?? null,
            attrs.overallWireFoil ?? null,
            attrs.internalPairFoil ?? null,
            attrs.weightPerFt ?? null,
            attrs.k1 ?? null,
            attrs.k2 ?? null,
            attrs.lossCoefficient ?? null,
            attrs.maxFreq ?? null,
            attrs.impedance ?? null,
            attrs.maxVoltage ?? null
          ]
        );
        return;
      }
      case "label": {
        const attrs = attributes as LabelAttributes;
        await client.query(
          `INSERT INTO labels (part_id, series, awg_min, awg_max, length_in, dia_in)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (part_id) DO UPDATE SET
             series = EXCLUDED.series,
             awg_min = EXCLUDED.awg_min,
             awg_max = EXCLUDED.awg_max,
             length_in = EXCLUDED.length_in,
             dia_in = EXCLUDED.dia_in`,
          [partId, attrs.series ?? null, attrs.awgMin ?? null, attrs.awgMax ?? null, attrs.lengthIn ?? null, attrs.diaIn ?? null]
        );
        return;
      }
      case "sleeve-tube-braid": {
        const attrs = attributes as SleeveTubeBraidAttributes;
        await client.query(
          `INSERT INTO sleeve_tube_braids (part_id)
           VALUES ($1)
           ON CONFLICT (part_id) DO NOTHING`,
          [partId]
        );
        await client.query(`DELETE FROM sleeve_size_ranges WHERE part_id = $1`, [partId]);
        for (const sizeRange of attrs.sizeRanges ?? []) {
          await client.query(
            `INSERT INTO sleeve_size_ranges (part_id, min_dia, max_dia, related_part_id)
             VALUES ($1, $2, $3, $4)`,
            [partId, sizeRange.minDia, sizeRange.maxDia, sizeRange.relatedPartId ?? null]
          );
        }
        return;
      }
      case "backshell": {
        const attrs = attributes as BackshellAttributes;
        await client.query(
          `INSERT INTO backshells (
             part_id, keying_part_id, length_added, bundle_allowance
           ) VALUES ($1, $2, $3, $4)
           ON CONFLICT (part_id) DO UPDATE SET
             keying_part_id = EXCLUDED.keying_part_id,
             length_added = EXCLUDED.length_added,
             bundle_allowance = EXCLUDED.bundle_allowance`,
          [
            partId,
            attrs.keyingPartId ?? null,
            attrs.lengthAdded ?? null,
            attrs.bundleAllowance ?? null
          ]
        );
        await client.query(`DELETE FROM backshell_fitments WHERE part_id = $1`, [partId]);
        for (const fitment of attrs.fitments ?? []) {
          await client.query(
            `INSERT INTO backshell_fitments (part_id, family_type, gender, backshell_size, emi)
             VALUES ($1, $2, $3, $4, $5)`,
            [partId, fitment.familyType, fitment.gender ?? "", fitment.backshellSize ?? "", fitment.emi ?? false]
          );
        }
        return;
      }
      case "strain-relief": {
        const attrs = attributes as StrainReliefAttributes;
        await client.query(
          `INSERT INTO strain_reliefs (part_id, gender, requires_backshell, related_module_hint_part_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (part_id) DO UPDATE SET
             gender = EXCLUDED.gender,
             requires_backshell = EXCLUDED.requires_backshell,
             related_module_hint_part_id = EXCLUDED.related_module_hint_part_id`,
          [
            partId,
            attrs.gender ?? null,
            attrs.requiresBackshell ?? null,
            attrs.relatedModuleHintPartId ?? null
          ]
        );
        return;
      }
      case "splice": {
        const attrs = attributes as SpliceAttributes;
        await client.query(
          `INSERT INTO splices (part_id, conductor_count, awg, manufacturer_pn, variant, cma_min, cma_max)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (part_id) DO UPDATE SET
             conductor_count = EXCLUDED.conductor_count,
             awg = EXCLUDED.awg,
             manufacturer_pn = EXCLUDED.manufacturer_pn,
             variant = EXCLUDED.variant,
             cma_min = EXCLUDED.cma_min,
             cma_max = EXCLUDED.cma_max`,
          [
            partId,
            attrs.conductorCount ?? null,
            attrs.awg ?? null,
            attrs.manufacturerPn ?? null,
            attrs.variant ?? null,
            attrs.cmaMin ?? null,
            attrs.cmaMax ?? null
          ]
        );
        return;
      }
      case "frame": {
        const attrs = attributes as FrameAttributes;
        await client.query(
          `INSERT INTO frames (part_id, module_capacity, slot_ids_json)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (part_id) DO UPDATE SET
             module_capacity = EXCLUDED.module_capacity,
             slot_ids_json = EXCLUDED.slot_ids_json`,
          [partId, attrs.moduleCapacity ?? null, JSON.stringify(attrs.slotIds ?? [])]
        );
        return;
      }
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
    expectedSnapshotHash?: string;
  }): Promise<Revision | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query<RevisionRow>(
        `SELECT id, design_id, revision_number, base_revision_id, created_by, created_at, ruleset_version, library_version, snapshot
         FROM design_revisions
         WHERE id = $1
         FOR UPDATE`,
        [input.revisionId]
      );
      if (!existingResult.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const existing = mapRevision(existingResult.rows[0]);
      if (input.expectedSnapshotHash !== undefined) {
        const currentHash = hashDesignSnapshot(existing.snapshot);
        if (currentHash !== input.expectedSnapshotHash) {
          await client.query("ROLLBACK");
          throw new Error("SNAPSHOT_MISMATCH");
        }
      }
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
    snapshotHash: string;
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
         id, revision_id, ruleset_version, mode, status, snapshot_hash, errors, warnings, infos, results, created_at
       ) VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING id, revision_id, ruleset_version, mode, status, snapshot_hash, errors, warnings, infos, results, created_at`,
      [
        id,
        input.revisionId,
        input.rulesetVersion,
        input.mode,
        input.snapshotHash,
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
      `SELECT id, revision_id, ruleset_version, mode, status, snapshot_hash, errors, warnings, infos, results, created_at
       FROM validation_runs
       WHERE id = $1`,
      [validationRunId]
    );
    return result.rows[0] ? mapValidationRun(result.rows[0]) : null;
  }

  async getLatestValidationRunForRevision(revisionId: string): Promise<ValidationRun | null> {
    const result = await this.pool.query<ValidationRunRow>(
      `SELECT id, revision_id, ruleset_version, mode, status, snapshot_hash, errors, warnings, infos, results, created_at
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
      `SELECT project_id, default_ruleset_version, allowed_ruleset_versions,
              inactive_part_severity, out_of_stock_severity, unreviewed_part_severity, created_at, updated_at
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
    inactivePartSeverity?: "error" | "warning";
    outOfStockSeverity?: "error" | "warning" | "info";
    unreviewedPartSeverity?: "error" | "warning" | "info";
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
         project_id, default_ruleset_version, allowed_ruleset_versions,
         inactive_part_severity, out_of_stock_severity, unreviewed_part_severity, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (project_id)
       DO UPDATE SET
         default_ruleset_version = EXCLUDED.default_ruleset_version,
         allowed_ruleset_versions = EXCLUDED.allowed_ruleset_versions,
         inactive_part_severity = EXCLUDED.inactive_part_severity,
         out_of_stock_severity = EXCLUDED.out_of_stock_severity,
         unreviewed_part_severity = EXCLUDED.unreviewed_part_severity,
         updated_at = NOW()
       RETURNING project_id, default_ruleset_version, allowed_ruleset_versions,
                 inactive_part_severity, out_of_stock_severity, unreviewed_part_severity, created_at, updated_at`,
      [
        input.projectId,
        input.defaultRulesetVersion ?? null,
        input.allowedRulesetVersions,
        input.inactivePartSeverity ?? null,
        input.outOfStockSeverity ?? null,
        input.unreviewedPartSeverity ?? null
      ]
    );
    return mapProjectRulesetPolicy(result.rows[0]);
  }

  async ingestLibraryComponents(input: {
    items: PartIngestItem[];
    requestedByUserId: string;
    dryRun: boolean;
    idempotencyKey?: string;
  }): Promise<LibraryIngestResult> {
    if (input.idempotencyKey) {
      const existingJob = await this.pool.query<DatastoreIngestJobRow>(
        `SELECT id, dry_run, summary_json
         FROM datastore_ingest_jobs
         WHERE target_store = 'postgres'
           AND target_entity = 'parts'
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
         ) VALUES ($1, 'postgres', 'parts', $2, $3, $4, 'running', '{}'::jsonb, $5, $5)`,
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
        const componentId = item.id?.trim() || `part-${item.category}-${crypto.randomUUID().slice(0, 8)}`;
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
            [
              crypto.randomUUID(),
              jobId,
              rowNumber,
              componentId,
              "Duplicate item in current ingest payload.",
              JSON.stringify(item),
              now
            ]
          );
          continue;
        }
        const duplicateResult = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM parts
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
        const existingResult = await client.query<PartRow>(
          `SELECT ${PART_COLUMNS}
           FROM parts
           WHERE id = $1`,
          [componentId]
        );
        const existing = existingResult.rows[0];
        const existingPart = existing ? (await loadPartsWithAttributes(client, [existing]))[0] : null;
        const nextAttributes = {
          ...emptyAttributesForCategory(item.category),
          ...item.attributes
        } as CategoryAttributesMap[LibraryCategory];
        const editedReviewedEntry =
          Boolean(existing?.is_reviewed) &&
          Boolean(
            existing &&
              existingPart &&
              (existing.category !== item.category ||
                existing.family !== item.family.trim() ||
                existing.part_number !== item.partNumber.trim() ||
                existing.description !== item.description.trim() ||
                existing.is_active !== item.isActive ||
                existing.stock_status !== item.stockStatus ||
                (existing.part_type ?? "") !== (item.partType?.trim() ?? "") ||
                (existing.side ?? "") !== (item.side?.trim() ?? "") ||
                (existing.notes ?? "") !== (item.notes?.trim() ?? "") ||
                (existing.electrical_mode ?? "") !== (item.electricalMode?.trim() ?? "") ||
                JSON.stringify(asRecord(existing.extra_attributes)) !== JSON.stringify(item.extraAttributes ?? {}) ||
                JSON.stringify(existingPart.attributes) !== JSON.stringify(nextAttributes))
          );
        const effectiveIsReviewed = editedReviewedEntry ? false : item.isReviewed;
        const normalizedReviewedAt = effectiveIsReviewed ? new Date(item.reviewedAt ?? now.toISOString()) : null;
        const normalizedReviewedByUserId = effectiveIsReviewed
          ? item.reviewedByUserId ?? input.requestedByUserId
          : null;
        if (!input.dryRun) {
          await client.query(
            `INSERT INTO parts (
               id, category, family, part_number, description, is_active, stock_status,
               created_by_user_id, created_at, last_edited_by_user_id, last_edited_at,
               is_reviewed, reviewed_by_user_id, reviewed_at, is_archived, updated_at,
               part_type, side, notes, electrical_mode, extra_attributes
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7,
               $8, $9, $8, $9,
               $10, $11, $12, FALSE, $9,
               $13, $14, $15, $16, $17::jsonb
             )
             ON CONFLICT (id)
             DO UPDATE SET
               category = EXCLUDED.category,
               family = EXCLUDED.family,
               part_number = EXCLUDED.part_number,
               description = EXCLUDED.description,
               is_active = EXCLUDED.is_active,
               stock_status = EXCLUDED.stock_status,
               is_reviewed = EXCLUDED.is_reviewed,
               reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
               reviewed_at = EXCLUDED.reviewed_at,
               last_edited_by_user_id = EXCLUDED.last_edited_by_user_id,
               last_edited_at = EXCLUDED.last_edited_at,
               updated_at = EXCLUDED.updated_at,
               part_type = EXCLUDED.part_type,
               side = EXCLUDED.side,
               notes = EXCLUDED.notes,
               electrical_mode = EXCLUDED.electrical_mode,
               extra_attributes = EXCLUDED.extra_attributes`,
            [
              componentId,
              item.category,
              item.family.trim(),
              item.partNumber.trim(),
              item.description.trim(),
              item.isActive,
              item.stockStatus,
              input.requestedByUserId,
              now,
              effectiveIsReviewed,
              normalizedReviewedByUserId,
              normalizedReviewedAt,
              item.partType?.trim() || null,
              item.side?.trim() || null,
              item.notes?.trim() || null,
              item.electricalMode?.trim() || null,
              JSON.stringify(item.extraAttributes ?? {})
            ]
          );
          await this.upsertExtensionRow(client, componentId, item.category, nextAttributes);
          await this.upsertPartAliases(client, componentId, item.aliases);
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
             AND target_entity = 'parts'
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
  }): Promise<PartWithAttributes[]> {
    const result = await this.pool.query<PartRow>(
      `SELECT ${PART_COLUMNS}
       FROM parts
       WHERE is_archived = FALSE
         AND (is_active = TRUE OR $3 = TRUE)
         AND (
           is_reviewed = TRUE
           OR created_by_user_id = $1
           OR $2 = TRUE
         )
       ORDER BY part_number ASC`,
      [input.requestingUserId, input.canViewAllUnreviewed, input.canViewInactive]
    );
    return loadPartsWithAttributes(this.pool, result.rows);
  }

  async getLibraryComponent(input: {
    componentId: string;
    requestingUserId: string;
    canViewAllUnreviewed: boolean;
    canViewInactive: boolean;
  }): Promise<PartWithAttributes | null> {
    const result = await this.pool.query<PartRow>(
      `SELECT ${PART_COLUMNS}
       FROM parts
       WHERE id = $1
         AND is_archived = FALSE
         AND (is_active = TRUE OR $4 = TRUE)
         AND (
           is_reviewed = TRUE
           OR created_by_user_id = $2
           OR $3 = TRUE
         )`,
      [input.componentId, input.requestingUserId, input.canViewAllUnreviewed, input.canViewInactive]
    );
    if (!result.rows[0]) {
      return null;
    }
    const parts = await loadPartsWithAttributes(this.pool, result.rows);
    return parts[0] ?? null;
  }

  async setLibraryComponentReview(input: {
    componentId: string;
    isReviewed: boolean;
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<PartWithAttributes | null> {
    const reviewedAt = input.isReviewed ? new Date(input.reviewedAt ?? new Date().toISOString()) : null;
    const reviewedBy = input.isReviewed ? (input.reviewedByUserId ?? "system-user") : null;
    const editedBy = reviewedBy ?? input.reviewedByUserId ?? "system-user";
    const result = await this.pool.query<PartRow>(
      `UPDATE parts
       SET is_reviewed = $1,
           reviewed_by_user_id = $2,
           reviewed_at = $3,
           last_edited_by_user_id = $4,
           last_edited_at = NOW(),
           updated_at = NOW()
       WHERE id = $5 AND is_archived = FALSE
       RETURNING ${PART_COLUMNS}`,
      [input.isReviewed, reviewedBy, reviewedAt, editedBy, input.componentId]
    );
    if (!result.rows[0]) {
      return null;
    }
    return (await loadPartsWithAttributes(this.pool, result.rows))[0] ?? null;
  }

  async bulkSetLibraryComponentReview(input: {
    componentIds: string[];
    reviewedByUserId?: string;
    reviewedAt?: string;
  }): Promise<{ reviewed: number; missing: string[] }> {
    if (input.componentIds.length === 0) {
      return { reviewed: 0, missing: [] };
    }
    const reviewedBy = input.reviewedByUserId ?? "system-user";
    const reviewedAt = new Date(input.reviewedAt ?? new Date().toISOString());
    const result = await this.pool.query<{ id: string }>(
      `UPDATE parts
       SET is_reviewed = TRUE,
           reviewed_by_user_id = $1,
           reviewed_at = $2,
           last_edited_by_user_id = $1,
           last_edited_at = NOW(),
           updated_at = NOW()
       WHERE id = ANY($3) AND is_archived = FALSE
       RETURNING id`,
      [reviewedBy, reviewedAt, input.componentIds]
    );
    const updatedIds = new Set(result.rows.map((row) => row.id));
    const missing = input.componentIds.filter((id) => !updatedIds.has(id));
    return { reviewed: updatedIds.size, missing };
  }

  async archiveLibraryComponent(input: {
    componentId: string;
    archivedByUserId: string;
  }): Promise<PartWithAttributes | null> {
    const result = await this.pool.query<PartRow>(
      `UPDATE parts
       SET is_archived = TRUE,
           is_active = FALSE,
           archived_at = NOW(),
           archived_by_user_id = $1,
           last_edited_by_user_id = $1,
           last_edited_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND is_archived = FALSE
       RETURNING ${PART_COLUMNS}`,
      [input.archivedByUserId, input.componentId]
    );
    if (!result.rows[0]) {
      return null;
    }
    return (await loadPartsWithAttributes(this.pool, result.rows))[0] ?? null;
  }

  async listArchivedLibraryComponents(): Promise<PartWithAttributes[]> {
    const result = await this.pool.query<PartRow>(
      `SELECT ${PART_COLUMNS}
       FROM parts
       WHERE is_archived = TRUE
       ORDER BY part_number ASC`
    );
    return loadPartsWithAttributes(this.pool, result.rows);
  }

  async restoreLibraryComponent(input: {
    componentId: string;
    restoredByUserId: string;
    reactivate?: boolean;
  }): Promise<PartWithAttributes | null> {
    const reactivate = input.reactivate !== false;
    const result = await this.pool.query<PartRow>(
      `UPDATE parts
       SET is_archived = FALSE,
           archived_at = NULL,
           archived_by_user_id = NULL,
           is_active = CASE WHEN $1 THEN TRUE ELSE is_active END,
           last_edited_by_user_id = $2,
           last_edited_at = NOW(),
           updated_at = NOW()
       WHERE id = $3 AND is_archived = TRUE
       RETURNING ${PART_COLUMNS}`,
      [reactivate, input.restoredByUserId, input.componentId]
    );
    if (!result.rows[0]) {
      return null;
    }
    return (await loadPartsWithAttributes(this.pool, result.rows))[0] ?? null;
  }

  async deleteLibraryComponent(input: { componentId: string }): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM parts
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query<PartRow>(
        `SELECT ${PART_COLUMNS}
         FROM parts
         WHERE id = $1 AND is_archived = FALSE`,
        [input.componentId]
      );
      if (!existingResult.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const existing = existingResult.rows[0];
      const existingPart = (await loadPartsWithAttributes(client, [existing]))[0];
      if (!existingPart) {
        await client.query("COMMIT");
        return null;
      }

      const result = await client.query<PartRow>(
        `UPDATE parts
         SET part_number = COALESCE($1, part_number),
             family = COALESCE($2, family),
             description = COALESCE($3, description),
             is_active = COALESCE($4, is_active),
             stock_status = COALESCE($5, stock_status),
             is_reviewed = COALESCE($6, is_reviewed),
             reviewed_by_user_id = CASE
               WHEN COALESCE($6, is_reviewed) = FALSE THEN NULL
               ELSE COALESCE($7, reviewed_by_user_id)
             END,
             reviewed_at = CASE
               WHEN COALESCE($6, is_reviewed) = FALSE THEN NULL
               ELSE COALESCE($8::timestamptz, reviewed_at)
             END,
             created_by_user_id = COALESCE($9, created_by_user_id),
             created_at = COALESCE($10::timestamptz, created_at),
             last_edited_by_user_id = COALESCE($11, $12, last_edited_by_user_id),
             last_edited_at = COALESCE($13::timestamptz, NOW()),
             part_type = CASE WHEN $15::text IS NULL THEN part_type ELSE NULLIF(BTRIM($15), '') END,
             side = CASE WHEN $16::text IS NULL THEN side ELSE NULLIF(BTRIM($16), '') END,
             notes = CASE WHEN $17::text IS NULL THEN notes ELSE NULLIF(BTRIM($17), '') END,
             electrical_mode = CASE WHEN $18::text IS NULL THEN electrical_mode ELSE NULLIF(BTRIM($18), '') END,
             extra_attributes = CASE WHEN $19::jsonb IS NULL THEN extra_attributes ELSE $19::jsonb END,
             updated_at = NOW()
         WHERE id = $14 AND is_archived = FALSE
         RETURNING ${PART_COLUMNS}`,
        [
          input.partNumber ?? null,
          input.family ?? null,
          input.description ?? null,
          input.isActive ?? null,
          input.stockStatus ?? null,
          input.isReviewed ?? null,
          input.reviewedByUserId ?? null,
          input.reviewedAt ?? null,
          input.createdByUserId ?? null,
          input.createdAt ?? null,
          input.lastEditedByUserId ?? null,
          input.editedByUserId ?? null,
          input.lastEditedAt ?? null,
          input.componentId,
          input.partType ?? null,
          input.side ?? null,
          input.notes ?? null,
          input.electricalMode ?? null,
          input.extraAttributes === undefined ? null : JSON.stringify(input.extraAttributes)
        ]
      );
      if (!result.rows[0]) {
        await client.query("COMMIT");
        return null;
      }

      if (input.attributes) {
        const mergedAttributes = {
          ...existingPart.attributes,
          ...input.attributes
        } as CategoryAttributesMap[LibraryCategory];
        await this.upsertExtensionRow(client, result.rows[0].id, result.rows[0].category, mergedAttributes);
      } else if (result.rows[0].category === "wire") {
        const wireAttrs = existingPart.attributes as WireAttributes;
        if (!wireAttrs.awg?.trim() || !wireAttrs.color?.trim()) {
          throw new Error("WIRE_FIELDS_REQUIRED");
        }
      }

      await client.query("COMMIT");
      return (await loadPartsWithAttributes(client, result.rows))[0] ?? null;
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listLibraryReviewQueue(input?: {
    category?: LibraryCategory;
    family?: string;
    enteredByUserId?: string;
  }): Promise<LibraryReviewQueueRecord[]> {
    const result = await this.pool.query<PartRow>(
      `SELECT ${PART_COLUMNS}
       FROM parts
       WHERE is_archived = FALSE
         AND is_reviewed = FALSE
         AND ($1::text IS NULL OR category = $1::text)
         AND ($2::text IS NULL OR lower(family) = lower($2::text))
         AND ($3::text IS NULL OR created_by_user_id = $3::text)
       ORDER BY created_at ASC`,
      [input?.category ?? null, input?.family ?? null, input?.enteredByUserId ?? null]
    );
    const parts = await loadPartsWithAttributes(this.pool, result.rows);
    return parts.map(mapLibraryReviewQueueRecord);
  }

  async listContactWireCompat(): Promise<ContactWireCompat[]> {
    const result = await this.pool.query<ContactWireCompatRow>(
      `SELECT contact_part_id, wire_part_id, status, notes, crimp_class
       FROM contact_wire_compat
       ORDER BY contact_part_id ASC, wire_part_id ASC`
    );
    return result.rows.map(mapContactWireCompat);
  }

  async upsertContactWireCompat(input: ContactWireCompat): Promise<ContactWireCompat> {
    const result = await this.pool.query<ContactWireCompatRow>(
      `INSERT INTO contact_wire_compat (contact_part_id, wire_part_id, status, notes, crimp_class)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contact_part_id, wire_part_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, crimp_class = EXCLUDED.crimp_class
       RETURNING contact_part_id, wire_part_id, status, notes, crimp_class`,
      [input.contactPartId, input.wirePartId, input.status, input.notes ?? null, input.crimpClass ?? null]
    );
    return mapContactWireCompat(result.rows[0]);
  }

  async bulkUpsertContactWireCompat(input: { rows: ContactWireCompat[] }): Promise<{ upserted: number }> {
    if (input.rows.length === 0) {
      return { upserted: 0 };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO contact_wire_compat (contact_part_id, wire_part_id, status, notes, crimp_class)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (contact_part_id, wire_part_id)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, crimp_class = EXCLUDED.crimp_class`,
          [row.contactPartId, row.wirePartId, row.status, row.notes ?? null, row.crimpClass ?? null]
        );
      }
      await client.query("COMMIT");
      return { upserted: input.rows.length };
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteContactWireCompat(input: { contactPartId: string; wirePartId: string }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM contact_wire_compat
       WHERE contact_part_id = $1 AND wire_part_id = $2`,
      [input.contactPartId, input.wirePartId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listModuleContactCompat(): Promise<ModuleContactCompat[]> {
    const result = await this.pool.query<ModuleContactCompatRow>(
      `SELECT module_part_id, contact_part_id, status, notes, source
       FROM module_contact_compat
       ORDER BY module_part_id ASC, contact_part_id ASC`
    );
    return result.rows.map(mapModuleContactCompat);
  }

  async upsertModuleContactCompat(input: ModuleContactCompat): Promise<ModuleContactCompat> {
    const result = await this.pool.query<ModuleContactCompatRow>(
      `INSERT INTO module_contact_compat (module_part_id, contact_part_id, status, notes, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (module_part_id, contact_part_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, source = EXCLUDED.source
       RETURNING module_part_id, contact_part_id, status, notes, source`,
      [input.modulePartId, input.contactPartId, input.status, input.notes ?? null, input.source ?? null]
    );
    return mapModuleContactCompat(result.rows[0]);
  }

  async bulkUpsertModuleContactCompat(input: { rows: ModuleContactCompat[] }): Promise<{ upserted: number }> {
    if (input.rows.length === 0) {
      return { upserted: 0 };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO module_contact_compat (module_part_id, contact_part_id, status, notes, source)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (module_part_id, contact_part_id)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, source = EXCLUDED.source`,
          [row.modulePartId, row.contactPartId, row.status, row.notes ?? null, row.source ?? null]
        );
      }
      await client.query("COMMIT");
      return { upserted: input.rows.length };
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteModuleContactCompat(input: {
    modulePartId: string;
    contactPartId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM module_contact_compat
       WHERE module_part_id = $1 AND contact_part_id = $2`,
      [input.modulePartId, input.contactPartId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listModuleBackshellCompat(): Promise<ModuleBackshellCompat[]> {
    const result = await this.pool.query<ModuleBackshellCompatRow>(
      `SELECT module_part_id, backshell_part_id, status, notes, source
       FROM module_backshell_compat
       ORDER BY module_part_id ASC, backshell_part_id ASC`
    );
    return result.rows.map(mapModuleBackshellCompat);
  }

  async upsertModuleBackshellCompat(input: ModuleBackshellCompat): Promise<ModuleBackshellCompat> {
    const result = await this.pool.query<ModuleBackshellCompatRow>(
      `INSERT INTO module_backshell_compat (module_part_id, backshell_part_id, status, notes, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (module_part_id, backshell_part_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, source = EXCLUDED.source
       RETURNING module_part_id, backshell_part_id, status, notes, source`,
      [input.modulePartId, input.backshellPartId, input.status, input.notes ?? null, input.source ?? null]
    );
    return mapModuleBackshellCompat(result.rows[0]);
  }

  async bulkUpsertModuleBackshellCompat(input: { rows: ModuleBackshellCompat[] }): Promise<{ upserted: number }> {
    if (input.rows.length === 0) {
      return { upserted: 0 };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO module_backshell_compat (module_part_id, backshell_part_id, status, notes, source)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (module_part_id, backshell_part_id)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, source = EXCLUDED.source`,
          [row.modulePartId, row.backshellPartId, row.status, row.notes ?? null, row.source ?? null]
        );
      }
      await client.query("COMMIT");
      return { upserted: input.rows.length };
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteModuleBackshellCompat(input: {
    modulePartId: string;
    backshellPartId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM module_backshell_compat
       WHERE module_part_id = $1 AND backshell_part_id = $2`,
      [input.modulePartId, input.backshellPartId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listModuleStrainReliefCompat(): Promise<ModuleStrainReliefCompat[]> {
    const result = await this.pool.query<ModuleStrainReliefCompatRow>(
      `SELECT module_part_id, strain_relief_part_id, status, notes, source
       FROM module_strain_relief_compat
       ORDER BY module_part_id ASC, strain_relief_part_id ASC`
    );
    return result.rows.map(mapModuleStrainReliefCompat);
  }

  async upsertModuleStrainReliefCompat(
    input: ModuleStrainReliefCompat
  ): Promise<ModuleStrainReliefCompat> {
    const result = await this.pool.query<ModuleStrainReliefCompatRow>(
      `INSERT INTO module_strain_relief_compat (module_part_id, strain_relief_part_id, status, notes, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (module_part_id, strain_relief_part_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, source = EXCLUDED.source
       RETURNING module_part_id, strain_relief_part_id, status, notes, source`,
      [input.modulePartId, input.strainReliefPartId, input.status, input.notes ?? null, input.source ?? null]
    );
    return mapModuleStrainReliefCompat(result.rows[0]);
  }

  async bulkUpsertModuleStrainReliefCompat(input: { rows: ModuleStrainReliefCompat[] }): Promise<{ upserted: number }> {
    if (input.rows.length === 0) {
      return { upserted: 0 };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO module_strain_relief_compat (module_part_id, strain_relief_part_id, status, notes, source)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (module_part_id, strain_relief_part_id)
           DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, source = EXCLUDED.source`,
          [row.modulePartId, row.strainReliefPartId, row.status, row.notes ?? null, row.source ?? null]
        );
      }
      await client.query("COMMIT");
      return { upserted: input.rows.length };
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteModuleStrainReliefCompat(input: {
    modulePartId: string;
    strainReliefPartId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM module_strain_relief_compat
       WHERE module_part_id = $1 AND strain_relief_part_id = $2`,
      [input.modulePartId, input.strainReliefPartId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listAwgCmaReference(): Promise<AwgCmaReference[]> {
    const result = await this.pool.query<{ awg: string; cma: number }>(
      `SELECT awg, cma FROM awg_cma_reference ORDER BY awg ASC`
    );
    return result.rows.map((row) => ({ awg: row.awg, cma: Number(row.cma) }));
  }

  async bulkUpsertAwgCmaReference(input: { rows: AwgCmaReference[] }): Promise<{ upserted: number }> {
    if (input.rows.length === 0) {
      return { upserted: 0 };
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO awg_cma_reference (awg, cma)
           VALUES ($1, $2)
           ON CONFLICT (awg)
           DO UPDATE SET cma = EXCLUDED.cma`,
          [row.awg, row.cma]
        );
      }
      await client.query("COMMIT");
      return { upserted: input.rows.length };
    } catch (error) {
      await this.rollbackSilently(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPartAliases(input?: { partId?: string }): Promise<PartAlias[]> {
    const result = await this.pool.query<PartAliasRow>(
      `SELECT part_id, code_system, code
       FROM part_aliases
       WHERE ($1::text IS NULL OR part_id = $1::text)
       ORDER BY code_system ASC, code ASC`,
      [input?.partId ?? null]
    );
    return result.rows.map(mapPartAlias);
  }

  async upsertPartAlias(input: PartAlias): Promise<PartAlias> {
    const result = await this.pool.query<PartAliasRow>(
      `INSERT INTO part_aliases (part_id, code_system, code)
       VALUES ($1, $2, $3)
       ON CONFLICT (code_system, code)
       DO UPDATE SET part_id = EXCLUDED.part_id
       RETURNING part_id, code_system, code`,
      [input.partId, input.codeSystem, input.code]
    );
    return mapPartAlias(result.rows[0]);
  }

  async deletePartAlias(input: { codeSystem: string; code: string }): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM part_aliases
       WHERE code_system = $1 AND code = $2`,
      [input.codeSystem, input.code]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listPartRelationships(input?: {
    parentPartId?: string;
    compatiblePart?: string;
    relationshipType?: string;
  }): Promise<PartRelationship[]> {
    const result = await this.pool.query<PartRelationshipRow>(
      `SELECT id, parent_part_id, compatible_parts, relationship_type, position_type,
              parent_positions_json, status, source_status, notes, extra_json
       FROM part_relationships
       WHERE ($1::text IS NULL OR parent_part_id = $1::text)
         AND ($2::text IS NULL OR ',' || COALESCE(compatible_parts, '') || ',' LIKE '%,' || $2::text || ',%')
         AND ($3::text IS NULL OR relationship_type = $3::text)
       ORDER BY relationship_type ASC, parent_part_id ASC, position_type ASC NULLS LAST`,
      [input?.parentPartId ?? null, input?.compatiblePart ?? null, input?.relationshipType ?? null]
    );
    return result.rows.map(mapPartRelationship);
  }

  async upsertPartRelationship(input: PartRelationshipInput): Promise<PartRelationship> {
    const normalized = normalizePartRelationship(input);
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM part_relationships
       WHERE parent_part_id = $1
         AND relationship_type = $2
         AND COALESCE(position_type, '') = COALESCE($3, '')
         AND parent_positions_json = $4::jsonb
         AND status = $5`,
      [
        normalized.parentPartId,
        normalized.relationshipType,
        normalized.positionType ?? null,
        JSON.stringify(normalized.parentPositions),
        normalized.status
      ]
    );
    const id = existing.rows[0]?.id ?? normalized.id;
    const result = await this.pool.query<PartRelationshipRow>(
      `INSERT INTO part_relationships (
         id, parent_part_id, compatible_parts, relationship_type, position_type,
         parent_positions_json, status, source_status, notes, extra_json
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::jsonb, $7, $8, $9, $10::jsonb
       )
       ON CONFLICT (id)
       DO UPDATE SET
         parent_part_id = EXCLUDED.parent_part_id,
         compatible_parts = EXCLUDED.compatible_parts,
         relationship_type = EXCLUDED.relationship_type,
         position_type = EXCLUDED.position_type,
         parent_positions_json = EXCLUDED.parent_positions_json,
         status = EXCLUDED.status,
         source_status = EXCLUDED.source_status,
         notes = EXCLUDED.notes,
         extra_json = EXCLUDED.extra_json
       RETURNING id, parent_part_id, compatible_parts, relationship_type, position_type,
                 parent_positions_json, status, source_status, notes, extra_json`,
      [
        id,
        normalized.parentPartId,
        normalized.compatibleParts.length > 0 ? normalized.compatibleParts.join(",") : null,
        normalized.relationshipType,
        normalized.positionType ?? null,
        JSON.stringify(normalized.parentPositions),
        normalized.status,
        normalized.sourceStatus ?? null,
        normalized.notes ?? null,
        JSON.stringify(normalized.extra ?? {})
      ]
    );
    return mapPartRelationship(result.rows[0]);
  }

  async bulkUpsertPartRelationships(input: { rows: PartRelationshipInput[] }): Promise<{ upserted: number }> {
    for (const row of input.rows) {
      await this.upsertPartRelationship(row);
    }
    return { upserted: input.rows.length };
  }

  async deletePartRelationship(input: { id: string }): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM part_relationships WHERE id = $1`, [input.id]);
    return (result.rowCount ?? 0) > 0;
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
