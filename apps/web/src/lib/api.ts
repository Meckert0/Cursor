export interface HealthResponse {
  ok: boolean;
  service: string;
  now: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  role: "viewer" | "editor" | "owner" | "supplier_reviewer";
  accountRole: "regular" | "admin";
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ListProjectsResponse {
  items: ProjectDto[];
}

export interface AdminProjectOverviewDto extends ProjectDto {
  members: ProjectMemberDto[];
  harnesses: Array<{
    id: string;
    name: string;
  }>;
}

interface ListAdminProjectOverviewResponse {
  items: AdminProjectOverviewDto[];
}

interface ListAdminUsersResponse {
  items: AuthUserDto[];
}

export interface PageDescriptionsDto {
  projectsHeaderDescription: string;
  harnessHeaderDescription: string;
}

export const LIBRARY_ITEM_CATEGORIES = [
  "contact",
  "wire",
  "sleeve-tube-braid",
  "label",
  "backshell",
  "strain-relief",
  "module",
  "splice",
  "frame"
] as const;

export type LibraryItemCategory = (typeof LIBRARY_ITEM_CATEGORIES)[number];

export type CompatStatus = "allowed" | "forbidden" | "review";

export type PartAttributesDto = Record<string, unknown>;

export interface PartDto {
  id: string;
  category: LibraryItemCategory;
  family: string;
  partNumber: string;
  description: string;
  isActive: boolean;
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  isArchived?: boolean;
  archivedAt?: string;
  archivedByUserId?: string;
  createdByUserId: string;
  createdAt: string;
  lastEditedByUserId: string;
  lastEditedAt: string;
  updatedAt: string;
  partType?: string;
  side?: string;
  notes?: string;
  electricalMode?: string;
  extraAttributes?: Record<string, unknown>;
  attributes: PartAttributesDto;
}

/** @deprecated Prefer PartDto. Alias kept for call-site churn. */
export type LibraryComponentDto = PartDto;

interface ListLibraryComponentsResponse {
  items: PartDto[];
}

export interface ContactWireCompatDto {
  contactPartId: string;
  wirePartId: string;
  status: CompatStatus;
  notes?: string;
}

export interface ModuleContactCompatDto {
  modulePartId: string;
  contactPartId: string;
  status: CompatStatus;
}

export interface ModuleBackshellCompatDto {
  modulePartId: string;
  backshellPartId: string;
  status: CompatStatus;
}

export interface ModuleStrainReliefCompatDto {
  modulePartId: string;
  strainReliefPartId: string;
  status: CompatStatus;
}

export interface PartAliasDto {
  partId: string;
  codeSystem: string;
  code: string;
}

export interface PartRelationshipDto {
  id: string;
  parentPartId: string;
  /** Compatible part numbers (Excel-style list). */
  compatibleParts: string[];
  relationshipType: string;
  positionType?: string;
  parentPositions: string[];
  status: CompatStatus;
  sourceStatus?: string;
  notes?: string;
  extra?: Record<string, unknown>;
}

export interface LibraryTablePreferencesDto {
  scope: string;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  updatedAt?: string;
}

export interface LibraryReviewQueueItemDto extends LibraryComponentDto {
  enteredByUserId: string;
  enteredAt: string;
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
}

interface ListLibraryReviewQueueResponse {
  items: LibraryReviewQueueItemDto[];
}

export interface LibraryIngestItemDto {
  id?: string;
  category: LibraryComponentDto["category"];
  family: string;
  partNumber: string;
  description: string;
  isActive: boolean;
  stockStatus: LibraryComponentDto["stockStatus"];
  isReviewed: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  partType?: string;
  side?: string;
  notes?: string;
  electricalMode?: string;
  extraAttributes?: Record<string, unknown>;
  attributes: PartAttributesDto;
}

export interface LibraryIngestResultDto {
  jobId: string;
  dryRun: boolean;
  summary: {
    received: number;
    accepted: number;
    rejected: number;
    committed: number;
  };
  results: Array<{
    rowNumber: number;
    status: "accepted" | "committed" | "rejected";
    componentId?: string;
    message?: string;
  }>;
}

export interface ProjectRulesetPolicyDto {
  projectId: string;
  defaultRulesetVersion?: string;
  allowedRulesetVersions: string[];
  inactivePartSeverity?: "error" | "warning";
  unreviewedPartSeverity?: "error" | "warning" | "info";
  outOfStockSeverity?: "error" | "warning" | "info";
}

export interface ProjectMemberDto {
  projectId: string;
  userId: string;
  role: "viewer" | "editor" | "owner" | "supplier_reviewer";
  createdAt: string;
  updatedAt: string;
}

interface ListProjectMembersResponse {
  items: ProjectMemberDto[];
}

export interface DesignDto {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: "draft" | "locked" | "submitted" | "in_review" | "quoted" | "released";
  currentRevisionId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type HarnessDto = DesignDto;
interface ListProjectHarnessesResponse {
  items: HarnessDto[];
}

export interface RevisionDto {
  id: string;
  designId: string;
  revisionNumber: number;
  baseRevisionId?: string;
  createdBy: string;
  createdAt: string;
  rulesetVersion: string;
  libraryVersion: string;
  snapshotHash?: string;
  snapshot: {
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
      wirelistManaged?: boolean;
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
      fromLocation?: string;
      toLocation?: string;
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
  };
}

interface ListRevisionsResponse {
  items: RevisionDto[];
}

export interface ValidationResponseDto {
  validationRunId: string;
  rulesetVersion: string;
  status: "completed";
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  results: Array<{
    severity: "error" | "warning" | "info";
    code: string;
    entityType?: string;
    entityId?: string;
    message: string;
  }>;
}

export interface ValidationRunDto {
  id: string;
  revisionId: string;
  rulesetVersion: string;
  mode: "quick" | "full";
  status: "completed";
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  results: Array<{
    severity: "error" | "warning" | "info";
    code: string;
    entityType?: string;
    entityId?: string;
    message: string;
  }>;
  createdAt: string;
}

export interface ExportArtifactDto {
  id: string;
  revisionId: string;
  format: "json" | "pdf" | "xlsx";
  status: "queued" | "processing" | "completed" | "failed";
  contentHash?: string;
  artifactUri?: string;
  downloadUrl?: string;
  errorMessage?: string;
  attemptCount?: number;
  nextAttemptAt?: string;
  failureKind?: "transient" | "permanent";
  createdAt: string;
  updatedAt: string;
}

interface ListExportsResponse {
  items: ExportArtifactDto[];
}

export interface QuoteSubmissionDto {
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

interface ListSubmissionsResponse {
  items: QuoteSubmissionDto[];
}

export interface AuditEventDto {
  id: string;
  designId: string;
  eventType: "design.state.changed";
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ListAuditEventsResponse {
  items: AuditEventDto[];
}

export interface TransitionDesignStateResponseDto {
  design: DesignDto;
  stateChanged: boolean;
  auditEventId?: string;
}

export interface TransitionHarnessStateResponseDto {
  design: HarnessDto;
  stateChanged: boolean;
  auditEventId?: string;
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  keepalive?: boolean;
}

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_BASE_URL ?? "http://localhost:3000";
  }
  return "";
}

function getDefaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const allowLegacyHeaders = (process.env.API_LEGACY_AUTH_HEADERS ?? "false").toLowerCase() === "true";
  if (allowLegacyHeaders) {
    headers["x-role"] = process.env.API_ROLE ?? "owner";
    headers["x-user-id"] = process.env.API_USER_ID ?? "system-user";
  }
  return headers;
}

async function getForwardedCookieHeader(): Promise<string | undefined> {
  if (typeof window !== "undefined") {
    return undefined;
  }
  try {
    const headersModule = await import("next/headers");
    const cookieStore = await headersModule.cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((entry) => `${entry.name}=${entry.value}`)
      .join("; ");
    return cookieHeader || undefined;
  } catch {
    return undefined;
  }
}

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = getDefaultHeaders();
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const cookieHeader = await getForwardedCookieHeader();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "include",
    cache: "no-store",
    keepalive: options.keepalive
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || "Unknown error"}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function extractApiErrorMessage(message: string): string {
  const match = /^API\s+\d+:\s*(.*)$/i.exec(message.trim());
  return (match?.[1] ?? message).trim();
}

export function toActionableApiErrorMessage(message: string, guidance: Record<string, string>): string {
  let normalized = extractApiErrorMessage(message);
  for (const [raw, actionable] of Object.entries(guidance)) {
    normalized = normalized.replace(raw, actionable);
  }
  return normalized;
}

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/v1/health");
}

export function registerUser(input: {
  username: string;
  email: string;
  password: string;
}): Promise<{ user: AuthUserDto; sessionToken: string; expiresAt: string }> {
  return apiRequest<{ user: AuthUserDto; sessionToken: string; expiresAt: string }>("/v1/auth/register", {
    method: "POST",
    body: input
  });
}

export function loginUser(input: { email: string; password: string }): Promise<{ user: AuthUserDto; sessionToken: string; expiresAt: string }> {
  return apiRequest<{ user: AuthUserDto; sessionToken: string; expiresAt: string }>("/v1/auth/login", {
    method: "POST",
    body: input
  });
}

export async function logoutUser(): Promise<void> {
  await apiRequest<undefined>("/v1/auth/logout", {
    method: "POST"
  });
}

export function getCurrentUser(): Promise<{ user: AuthUserDto }> {
  return apiRequest<{ user: AuthUserDto }>("/v1/auth/me");
}

export async function listAdminUsers(): Promise<AuthUserDto[]> {
  const response = await apiRequest<ListAdminUsersResponse>("/v1/admin/users");
  return response.items;
}

export function getPageDescriptions(): Promise<PageDescriptionsDto> {
  return apiRequest<PageDescriptionsDto>("/v1/ui/page-descriptions");
}

export function updateAdminPageDescriptions(input: {
  projectsHeaderDescription?: string;
  harnessHeaderDescription?: string;
}): Promise<PageDescriptionsDto> {
  return apiRequest<PageDescriptionsDto>("/v1/admin/ui/page-descriptions", {
    method: "PUT",
    body: {
      projectsHeaderDescription: input.projectsHeaderDescription,
      harnessHeaderDescription: input.harnessHeaderDescription
    }
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await apiRequest<undefined>(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
}

export async function listAdminProjectOverview(): Promise<AdminProjectOverviewDto[]> {
  const response = await apiRequest<ListAdminProjectOverviewResponse>("/v1/admin/projects-overview");
  return response.items;
}

export async function listProjects(): Promise<ProjectDto[]> {
  const response = await apiRequest<ListProjectsResponse>("/v1/projects");
  return response.items;
}

export async function listLibraryComponents(input?: {
  q?: string;
  category?: LibraryComponentDto["category"];
  family?: string;
  awg?: string;
  color?: string;
  isActive?: boolean;
  stockStatus?: LibraryComponentDto["stockStatus"];
  partType?: string;
  side?: string;
}): Promise<LibraryComponentDto[]> {
  const search = new URLSearchParams();
  if (input?.q) {
    search.set("q", input.q);
  }
  if (input?.category) {
    search.set("category", input.category);
  }
  if (input?.family) {
    search.set("family", input.family);
  }
  if (input?.awg) {
    search.set("awg", input.awg);
  }
  if (input?.color) {
    search.set("color", input.color);
  }
  if (typeof input?.isActive === "boolean") {
    search.set("isActive", String(input.isActive));
  }
  if (input?.stockStatus) {
    search.set("stockStatus", input.stockStatus);
  }
  if (input?.partType) {
    search.set("partType", input.partType);
  }
  if (input?.side) {
    search.set("side", input.side);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await apiRequest<ListLibraryComponentsResponse>(`/v1/library/components${suffix}`);
  return response.items;
}

export function getLibraryComponent(componentId: string): Promise<LibraryComponentDto> {
  return apiRequest<LibraryComponentDto>(`/v1/library/components/${componentId}`);
}

export function getLibraryTablePreferences(scope: string): Promise<LibraryTablePreferencesDto | null> {
  return apiRequest<LibraryTablePreferencesDto | null>(`/v1/library/table-preferences/${encodeURIComponent(scope)}`);
}

export function updateLibraryTablePreferences(input: {
  scope: string;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  keepalive?: boolean;
}): Promise<LibraryTablePreferencesDto> {
  return apiRequest<LibraryTablePreferencesDto>(`/v1/library/table-preferences/${encodeURIComponent(input.scope)}`, {
    method: "PUT",
    keepalive: input.keepalive,
    body: {
      columnOrder: input.columnOrder,
      columnWidths: input.columnWidths
    }
  });
}

export async function listLibraryReviewQueue(input?: {
  category?: LibraryComponentDto["category"];
  family?: string;
  enteredByUserId?: string;
}): Promise<LibraryReviewQueueItemDto[]> {
  const search = new URLSearchParams();
  if (input?.category) {
    search.set("category", input.category);
  }
  if (input?.family) {
    search.set("family", input.family);
  }
  if (input?.enteredByUserId) {
    search.set("enteredByUserId", input.enteredByUserId);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await apiRequest<ListLibraryReviewQueueResponse>(`/v1/library/components/review-queue${suffix}`);
  return response.items;
}

export function reviewLibraryComponent(input: {
  componentId: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
}): Promise<LibraryComponentDto> {
  return apiRequest<LibraryComponentDto>(`/v1/library/components/${input.componentId}/review`, {
    method: "POST",
    body: {
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: input.reviewedAt
    }
  });
}

export function unreviewLibraryComponent(componentId: string): Promise<LibraryComponentDto> {
  return apiRequest<LibraryComponentDto>(`/v1/library/components/${componentId}/unreview`, {
    method: "POST",
    body: {}
  });
}

export function archiveLibraryComponent(componentId: string): Promise<LibraryComponentDto> {
  return apiRequest<LibraryComponentDto>(`/v1/library/components/${componentId}/archive`, {
    method: "POST",
    body: {}
  });
}

export async function listArchivedLibraryComponents(): Promise<LibraryComponentDto[]> {
  const response = await apiRequest<ListLibraryComponentsResponse>("/v1/library/components/archived");
  return response.items;
}

export function restoreLibraryComponent(input: {
  componentId: string;
  reactivate?: boolean;
}): Promise<LibraryComponentDto> {
  return apiRequest<LibraryComponentDto>(`/v1/library/components/${input.componentId}/restore`, {
    method: "POST",
    body: { reactivate: input.reactivate }
  });
}

export async function deleteLibraryComponent(componentId: string): Promise<void> {
  await apiRequest<undefined>(`/v1/library/components/${componentId}`, {
    method: "DELETE"
  });
}

export function updateLibraryComponent(input: {
  componentId: string;
  partNumber?: string;
  family?: string;
  description?: string;
  isActive?: boolean;
  stockStatus?: LibraryComponentDto["stockStatus"];
  isReviewed?: boolean;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdByUserId?: string;
  createdAt?: string;
  lastEditedByUserId?: string;
  lastEditedAt?: string;
  partType?: string;
  side?: string;
  notes?: string;
  electricalMode?: string;
  extraAttributes?: Record<string, unknown>;
  attributes?: PartAttributesDto;
}): Promise<LibraryComponentDto> {
  return apiRequest<LibraryComponentDto>(`/v1/library/components/${input.componentId}`, {
    method: "PATCH",
    body: {
      partNumber: input.partNumber,
      family: input.family,
      description: input.description,
      isActive: input.isActive,
      stockStatus: input.stockStatus,
      isReviewed: input.isReviewed,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: input.reviewedAt,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
      lastEditedByUserId: input.lastEditedByUserId,
      lastEditedAt: input.lastEditedAt,
      partType: input.partType,
      side: input.side,
      notes: input.notes,
      electricalMode: input.electricalMode,
      extraAttributes: input.extraAttributes,
      attributes: input.attributes
    }
  });
}

export async function listContactWireCompat(): Promise<ContactWireCompatDto[]> {
  const response = await apiRequest<{ items: ContactWireCompatDto[] }>("/v1/library/compat/contact-wire");
  return response.items;
}

export function upsertContactWireCompat(input: ContactWireCompatDto): Promise<ContactWireCompatDto> {
  return apiRequest<ContactWireCompatDto>("/v1/library/compat/contact-wire", {
    method: "PUT",
    body: input
  });
}

export async function deleteContactWireCompat(input: {
  contactPartId: string;
  wirePartId: string;
}): Promise<void> {
  const search = new URLSearchParams({
    contactPartId: input.contactPartId,
    wirePartId: input.wirePartId
  });
  await apiRequest<undefined>(`/v1/library/compat/contact-wire?${search.toString()}`, {
    method: "DELETE"
  });
}

export async function listModuleContactCompat(): Promise<ModuleContactCompatDto[]> {
  const response = await apiRequest<{ items: ModuleContactCompatDto[] }>("/v1/library/compat/module-contact");
  return response.items;
}

export function upsertModuleContactCompat(input: ModuleContactCompatDto): Promise<ModuleContactCompatDto> {
  return apiRequest<ModuleContactCompatDto>("/v1/library/compat/module-contact", {
    method: "PUT",
    body: input
  });
}

export async function deleteModuleContactCompat(input: {
  modulePartId: string;
  contactPartId: string;
}): Promise<void> {
  const search = new URLSearchParams({
    modulePartId: input.modulePartId,
    contactPartId: input.contactPartId
  });
  await apiRequest<undefined>(`/v1/library/compat/module-contact?${search.toString()}`, {
    method: "DELETE"
  });
}

export async function listModuleBackshellCompat(): Promise<ModuleBackshellCompatDto[]> {
  const response = await apiRequest<{ items: ModuleBackshellCompatDto[] }>("/v1/library/compat/module-backshell");
  return response.items;
}

export function upsertModuleBackshellCompat(input: ModuleBackshellCompatDto): Promise<ModuleBackshellCompatDto> {
  return apiRequest<ModuleBackshellCompatDto>("/v1/library/compat/module-backshell", {
    method: "PUT",
    body: input
  });
}

export async function deleteModuleBackshellCompat(input: {
  modulePartId: string;
  backshellPartId: string;
}): Promise<void> {
  const search = new URLSearchParams({
    modulePartId: input.modulePartId,
    backshellPartId: input.backshellPartId
  });
  await apiRequest<undefined>(`/v1/library/compat/module-backshell?${search.toString()}`, {
    method: "DELETE"
  });
}

export async function listModuleStrainReliefCompat(): Promise<ModuleStrainReliefCompatDto[]> {
  const response = await apiRequest<{ items: ModuleStrainReliefCompatDto[] }>(
    "/v1/library/compat/module-strain-relief"
  );
  return response.items;
}

export function upsertModuleStrainReliefCompat(
  input: ModuleStrainReliefCompatDto
): Promise<ModuleStrainReliefCompatDto> {
  return apiRequest<ModuleStrainReliefCompatDto>("/v1/library/compat/module-strain-relief", {
    method: "PUT",
    body: input
  });
}

export async function deleteModuleStrainReliefCompat(input: {
  modulePartId: string;
  strainReliefPartId: string;
}): Promise<void> {
  const search = new URLSearchParams({
    modulePartId: input.modulePartId,
    strainReliefPartId: input.strainReliefPartId
  });
  await apiRequest<undefined>(`/v1/library/compat/module-strain-relief?${search.toString()}`, {
    method: "DELETE"
  });
}

export async function listPartAliases(input?: { partId?: string }): Promise<PartAliasDto[]> {
  const search = new URLSearchParams();
  if (input?.partId) {
    search.set("partId", input.partId);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await apiRequest<{ items: PartAliasDto[] }>(`/v1/library/aliases${suffix}`);
  return response.items;
}

export function upsertPartAlias(input: PartAliasDto): Promise<PartAliasDto> {
  return apiRequest<PartAliasDto>("/v1/library/aliases", {
    method: "PUT",
    body: input
  });
}

export async function deletePartAlias(input: { codeSystem: string; code: string }): Promise<void> {
  const search = new URLSearchParams({
    codeSystem: input.codeSystem,
    code: input.code
  });
  await apiRequest<undefined>(`/v1/library/aliases?${search.toString()}`, {
    method: "DELETE"
  });
}

export async function listPartRelationships(input?: {
  parentPartId?: string;
  /** Part number contained in the row's compatible parts list. */
  compatiblePart?: string;
  relationshipType?: string;
}): Promise<PartRelationshipDto[]> {
  const search = new URLSearchParams();
  if (input?.parentPartId) {
    search.set("parentPartId", input.parentPartId);
  }
  if (input?.compatiblePart) {
    search.set("compatiblePart", input.compatiblePart);
  }
  if (input?.relationshipType) {
    search.set("relationshipType", input.relationshipType);
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await apiRequest<{ items: PartRelationshipDto[] }>(`/v1/library/relationships${suffix}`);
  return response.items;
}

export function upsertPartRelationship(
  input: Omit<PartRelationshipDto, "id" | "compatibleParts"> & {
    id?: string;
    compatibleParts?: string[] | string;
  }
): Promise<PartRelationshipDto> {
  return apiRequest<PartRelationshipDto>("/v1/library/relationships", {
    method: "PUT",
    body: input
  });
}

export async function deletePartRelationship(input: { id: string }): Promise<void> {
  const search = new URLSearchParams({ id: input.id });
  await apiRequest<undefined>(`/v1/library/relationships?${search.toString()}`, {
    method: "DELETE"
  });
}

export function ingestLibraryComponents(input: {
  items: LibraryIngestItemDto[];
  idempotencyKey?: string;
  dryRun?: boolean;
}): Promise<LibraryIngestResultDto> {
  return apiRequest<LibraryIngestResultDto>(`/v1/library/components/ingest${input.dryRun ? "/dry-run" : ""}`, {
    method: "POST",
    body: {
      idempotencyKey: input.idempotencyKey,
      items: input.items
    }
  });
}

export function createProject(input: { name: string; description?: string }): Promise<ProjectDto> {
  return apiRequest<ProjectDto>("/v1/projects", {
    method: "POST",
    body: {
      name: input.name,
      description: input.description,
      createdBy: process.env.API_USER_ID ?? "system-user"
    }
  });
}

export function updateProject(input: { projectId: string; name?: string; description?: string }): Promise<ProjectDto> {
  return apiRequest<ProjectDto>(`/v1/projects/${input.projectId}`, {
    method: "PATCH",
    body: {
      name: input.name,
      description: input.description
    }
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiRequest<undefined>(`/v1/projects/${projectId}`, {
    method: "DELETE"
  });
}

export async function deleteHarness(harnessId: string): Promise<void> {
  await apiRequest<undefined>(`/v1/harnesses/${harnessId}`, {
    method: "DELETE"
  });
}

export function getProjectRulesetPolicy(projectId: string): Promise<ProjectRulesetPolicyDto> {
  return apiRequest<ProjectRulesetPolicyDto>(`/v1/projects/${projectId}/ruleset-policy`);
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberDto[]> {
  const response = await apiRequest<ListProjectMembersResponse>(`/v1/projects/${projectId}/members`);
  return response.items;
}

export function upsertProjectMember(input: {
  projectId: string;
  userId: string;
  role: ProjectMemberDto["role"];
}): Promise<ProjectMemberDto> {
  return apiRequest<ProjectMemberDto>(`/v1/projects/${input.projectId}/members/${encodeURIComponent(input.userId)}`, {
    method: "PUT",
    body: { role: input.role }
  });
}

export interface DesignLockDto {
  designId: string;
  lockedBy: string;
  expiresAt: string;
}

export function lockHarness(input: { harnessId: string; ttlSeconds?: number }): Promise<DesignLockDto> {
  return apiRequest<DesignLockDto>(`/v1/harnesses/${input.harnessId}/lock`, {
    method: "POST",
    body: { ttlSeconds: input.ttlSeconds ?? 300 }
  });
}

export function unlockHarness(input: { harnessId: string }): Promise<void> {
  return apiRequest<void>(`/v1/harnesses/${input.harnessId}/unlock`, {
    method: "POST",
    body: {}
  });
}

export function createDesign(input: { projectId: string; name: string }): Promise<DesignDto> {
  return createHarness(input);
}

export function createHarness(input: { projectId: string; name: string }): Promise<HarnessDto> {
  return apiRequest<HarnessDto>(`/v1/projects/${input.projectId}/harnesses`, {
    method: "POST",
    body: {
      name: input.name,
      createdBy: process.env.API_USER_ID ?? "system-user"
    }
  });
}

export async function listProjectDesigns(projectId: string): Promise<DesignDto[]> {
  return listProjectHarnesses(projectId);
}

export async function listProjectHarnesses(projectId: string): Promise<HarnessDto[]> {
  const response = await apiRequest<ListProjectHarnessesResponse>(`/v1/projects/${projectId}/harnesses`);
  return response.items;
}

export function getDesign(designId: string): Promise<DesignDto> {
  return getHarness(designId);
}

export function getHarness(harnessId: string): Promise<HarnessDto> {
  return apiRequest<HarnessDto>(`/v1/harnesses/${harnessId}`);
}

export function updateHarness(input: { harnessId: string; name?: string; description?: string }): Promise<HarnessDto> {
  return apiRequest<HarnessDto>(`/v1/harnesses/${input.harnessId}`, {
    method: "PATCH",
    body: {
      name: input.name,
      description: input.description
    }
  });
}

export function getRevision(revisionId: string): Promise<RevisionDto> {
  return apiRequest<RevisionDto>(`/v1/revisions/${revisionId}`);
}

export class SnapshotConflictError extends Error {
  readonly status = 409;
  constructor(message = "Snapshot was modified elsewhere. Reload and retry.") {
    super(message);
    this.name = "SnapshotConflictError";
  }
}

export function isSnapshotConflictError(error: unknown): error is SnapshotConflictError {
  return error instanceof SnapshotConflictError || (error instanceof Error && /^API\s+409:/i.test(error.message));
}

export function updateRevisionSnapshot(input: {
  revisionId: string;
  snapshot: RevisionDto["snapshot"];
  expectedSnapshotHash: string;
}): Promise<RevisionDto> {
  return apiRequest<RevisionDto>(`/v1/revisions/${input.revisionId}/snapshot`, {
    method: "PATCH",
    body: {
      snapshot: input.snapshot,
      expectedSnapshotHash: input.expectedSnapshotHash
    }
  }).catch((error: unknown) => {
    if (error instanceof Error && /^API\s+409:/i.test(error.message)) {
      throw new SnapshotConflictError(extractApiErrorMessage(error.message));
    }
    throw error;
  });
}

export async function listDesignRevisions(designId: string): Promise<RevisionDto[]> {
  return listHarnessRevisions(designId);
}

export async function listHarnessRevisions(harnessId: string): Promise<RevisionDto[]> {
  const response = await apiRequest<ListRevisionsResponse>(`/v1/harnesses/${harnessId}/revisions`);
  return response.items;
}

export function createRevision(input: { designId: string }): Promise<RevisionDto> {
  return createRevisionWithSnapshot({
    designId: input.designId,
    snapshot: {
      connectors: [],
      junctions: [],
      paths: [],
      pinMappings: [],
      bundles: [],
      annotations: []
    }
  });
}

export function createRevisionWithSnapshot(input: {
  designId: string;
  snapshot: RevisionDto["snapshot"];
  rulesetVersion?: string;
  libraryVersion?: string;
}): Promise<RevisionDto> {
  return apiRequest<RevisionDto>(`/v1/harnesses/${input.designId}/revisions`, {
    method: "POST",
    body: {
      createdBy: process.env.API_USER_ID ?? "system-user",
      rulesetVersion: input.rulesetVersion,
      libraryVersion: input.libraryVersion,
      snapshot: input.snapshot
    }
  });
}

export function validateRevision(input: { revisionId: string; mode?: "quick" | "full" }): Promise<ValidationResponseDto> {
  return apiRequest<ValidationResponseDto>(`/v1/revisions/${input.revisionId}/validate`, {
    method: "POST",
    body: {
      mode: input.mode ?? "full"
    }
  });
}

export function createRevisionExport(input: {
  revisionId: string;
  format: "json" | "pdf" | "xlsx";
}): Promise<ExportArtifactDto> {
  return apiRequest<ExportArtifactDto>(`/v1/revisions/${input.revisionId}/exports`, {
    method: "POST",
    body: {
      format: input.format
    }
  });
}

export async function listRevisionExports(revisionId: string): Promise<ExportArtifactDto[]> {
  const response = await apiRequest<ListExportsResponse>(`/v1/revisions/${revisionId}/exports`);
  return response.items;
}

export function getExport(exportId: string): Promise<ExportArtifactDto> {
  return apiRequest<ExportArtifactDto>(`/v1/exports/${exportId}`);
}

export function getValidationRun(validationRunId: string): Promise<ValidationRunDto> {
  return apiRequest<ValidationRunDto>(`/v1/validations/${validationRunId}`);
}

export interface BomLineDto {
  category: string;
  partNumber: string;
  description: string;
  family?: string;
  quantity: number;
  unit: "ea" | "in";
  resolution: "resolved" | "not_found" | "inactive" | "unreviewed";
  libraryComponentId?: string;
  designRefs: string[];
  notes?: string;
  awg?: string;
  color?: string;
}

export interface BomResponseDto {
  revisionId: string;
  libraryVersion: string;
  lines: BomLineDto[];
  summary: {
    totalLines: number;
    resolved: number;
    unresolved: number;
  };
}

export function getRevisionBom(revisionId: string): Promise<BomResponseDto> {
  return apiRequest<BomResponseDto>(`/v1/revisions/${revisionId}/bom`);
}

export function submitDesignForQuote(input: {
  designId: string;
  revisionId: string;
  message?: string;
  idempotencyKey?: string;
}): Promise<QuoteSubmissionDto> {
  return submitHarnessForQuote({
    harnessId: input.designId,
    revisionId: input.revisionId,
    message: input.message,
    idempotencyKey: input.idempotencyKey
  });
}

export function submitHarnessForQuote(input: {
  harnessId: string;
  revisionId: string;
  message?: string;
  idempotencyKey?: string;
}): Promise<QuoteSubmissionDto> {
  return apiRequest<QuoteSubmissionDto>(`/v1/harnesses/${input.harnessId}/submit-for-quote`, {
    method: "POST",
    body: {
      revisionId: input.revisionId,
      message: input.message,
      idempotencyKey: input.idempotencyKey
    }
  });
}

export function transitionDesignState(input: {
  designId: string;
  targetState: DesignDto["status"];
  expectedCurrentState?: DesignDto["status"];
  comment?: string;
}): Promise<TransitionDesignStateResponseDto> {
  return transitionHarnessState({
    harnessId: input.designId,
    targetState: input.targetState,
    expectedCurrentState: input.expectedCurrentState,
    comment: input.comment
  });
}

export function transitionHarnessState(input: {
  harnessId: string;
  targetState: HarnessDto["status"];
  expectedCurrentState?: HarnessDto["status"];
  comment?: string;
}): Promise<TransitionHarnessStateResponseDto> {
  return apiRequest<TransitionHarnessStateResponseDto>(`/v1/harnesses/${input.harnessId}/state-transitions`, {
    method: "POST",
    body: {
      targetState: input.targetState,
      expectedCurrentState: input.expectedCurrentState,
      changedBy: process.env.API_USER_ID ?? "system-user",
      comment: input.comment
    }
  });
}

export async function listDesignSubmissions(designId: string): Promise<QuoteSubmissionDto[]> {
  return listHarnessSubmissions(designId);
}

export async function listHarnessSubmissions(harnessId: string): Promise<QuoteSubmissionDto[]> {
  const response = await apiRequest<ListSubmissionsResponse>(`/v1/harnesses/${harnessId}/submissions`);
  return response.items;
}

export async function listDesignAuditEvents(designId: string): Promise<AuditEventDto[]> {
  return listHarnessAuditEvents(designId);
}

export async function listHarnessAuditEvents(harnessId: string): Promise<AuditEventDto[]> {
  const response = await apiRequest<ListAuditEventsResponse>(`/v1/harnesses/${harnessId}/audit-events`);
  return response.items;
}
