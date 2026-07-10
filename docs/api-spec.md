# Cable Design Tool API Specification (Draft)

## Purpose

This draft defines service-facing HTTP APIs for design lifecycle, validation, exports, collaboration, and quote submission.

Conventions:

- JSON request/response bodies
- UTC ISO timestamps
- `X-Request-Id` for traceability
- `Idempotency-Key` required for mutation endpoints with side effects

## Authentication and Authorization

- Auth: Bearer token (OIDC/JWT)
- RBAC roles:
  - `viewer`
  - `editor`
  - `owner`
  - `supplier_reviewer`
- Access scope:
  - organization -> project -> design

## API Surface

### Projects

`POST /v1/projects`

- Create project.

`GET /v1/projects`

- List projects visible to caller.

`GET /v1/projects/{projectId}`

- Fetch project details and summary metrics.

### Harnesses and Revisions

`POST /v1/projects/{projectId}/harnesses`

- Create a new harness.

`GET /v1/projects/{projectId}/harnesses`

- List harnesses under a project visible to caller.

`GET /v1/harnesses/{harnessId}`

- Read harness metadata and active revision pointer.

`PATCH /v1/harnesses/{harnessId}`

- Rename harness or update metadata.

`POST /v1/harnesses/{harnessId}/revisions`

- Create new immutable revision from active/base revision.

`GET /v1/harnesses/{harnessId}/revisions`

- List revisions with validation/export status.

`GET /v1/revisions/{revisionId}`

- Read full canonical snapshot payload.

### Harness State Management

`POST /v1/harnesses/{harnessId}/lock`

- Acquire edit lock.

Request:

```json
{
  "ttlSeconds": 900,
  "reason": "editing"
}
```

Response:

```json
{
  "harnessId": "uuid",
  "lockedBy": "user-123",
  "expiresAt": "2026-03-27T18:00:00Z"
}
```

`POST /v1/harnesses/{harnessId}/unlock`

- Release lock.

`POST /v1/harnesses/{harnessId}/state-transitions`

- Move state (e.g., `draft -> submitted`).

Request:

```json
{
  "targetState": "submitted",
  "comment": "Ready for quote",
  "expectedCurrentState": "locked"
}
```

### Validation

`POST /v1/revisions/{revisionId}/validate`

- Run full validation using explicit or default ruleset.
- Includes library existence / inactive / unreviewed checks for referenced parts.

`GET /v1/revisions/{revisionId}/bom`

- Build a bill of materials by resolving the revision snapshot against the component library.
- Returns aggregated lines with quantity, unit, resolution status, and design references.

Request:

```json
{
  "rulesetVersion": "rules-2026.03",
  "mode": "full"
}
```

Response:

```json
{
  "validationRunId": "uuid",
  "status": "completed",
  "summary": {
    "errors": 2,
    "warnings": 3,
    "infos": 5
  },
  "results": [
    {
      "severity": "error",
      "code": "RULE_PIN_MAPPING_INCOMPLETE",
      "entityType": "pinMapping",
      "entityId": "uuid",
      "message": "Destination pin missing."
    }
  ]
}
```

`GET /v1/validations/{validationRunId}`

- Fetch prior validation report.

### Library and Inventory

`GET /v1/library/components`

Query params:

- `type` (connector, wire, backshell)
- `family`
- `stockOnly=true|false`
- `search`
- `page`, `pageSize`

`GET /v1/library/components/{componentId}`

- Fetch component details and compatibility metadata.

`POST /v1/library/custom-components`

- Add customer custom connector/wire definitions.

`GET /v1/library/field-definitions/{category}`

- List column/field definitions for `connector`, `wire`, or `backshell` (admin only).

`POST /v1/library/field-definitions/{category}`

- Create a text field definition for the category (admin only).
- Request body:

```json
{
  "key": "insulationType",
  "label": "Insulation type",
  "isVisibleInViewer": true
}
```

`PATCH /v1/library/field-definitions/{fieldDefinitionId}`

- Rename a field or toggle viewer visibility (admin only).

`DELETE /v1/library/field-definitions/{fieldDefinitionId}`

- Hard-delete a custom field definition and all stored values (admin only).

`PATCH /v1/library/components/{componentId}`

- Supports `customFieldValues` as a string map for non-system fields, in addition to built-in metadata fields.

### CSV Pin Mapping Import

`POST /v1/revisions/{revisionId}/pin-mappings:import-csv`

- Upload CSV mapping file and apply to revision draft copy.
- Accepts multipart form data.

Response includes parse diagnostics and unresolved references.

### Exports

`POST /v1/revisions/{revisionId}/exports`

- Request export artifact generation.

Request:

```json
{
  "format": "pdf",
  "template": "assembly-default-v2"
}
```

Response:

```json
{
  "exportId": "uuid",
  "status": "queued"
}
```

`GET /v1/exports/{exportId}`

- Retrieve status and signed artifact URL when complete.

`GET /v1/revisions/{revisionId}/exports`

- List generated exports for revision.

### Collaboration

`GET /v1/harnesses/{harnessId}/comments`

- List comments tied to design entities/revision.

`POST /v1/harnesses/{harnessId}/comments`

- Add contextual comment.

`GET /v1/notifications`

- List user notifications.

### Quote Submission

`POST /v1/harnesses/{harnessId}/submit-for-quote`

- Validate submission preconditions and create quote intake entry.

Request:

```json
{
  "revisionId": "uuid",
  "message": "Please quote with standard lead time."
}
```

Response:

```json
{
  "submissionId": "uuid",
  "status": "received",
  "estimatedResponseHours": 24
}
```

## Error Contract

All non-2xx responses:

```json
{
  "error": {
    "code": "LOCK_CONFLICT",
    "message": "Design is locked by another user.",
    "requestId": "req-abc",
    "details": {
      "lockedBy": "user-321",
      "expiresAt": "2026-03-27T18:00:00Z"
    }
  }
}
```

Common error codes:

- `VALIDATION_FAILED`
- `LOCK_CONFLICT`
- `STATE_TRANSITION_INVALID`
- `PERMISSION_DENIED`
- `COMPONENT_INACTIVE`
- `EXPORT_TEMPLATE_NOT_FOUND`
- `RATE_LIMITED`

## Event Hooks (Internal)

Emit internal events for:

- `design.revision.created`
- `design.lock.acquired`
- `design.state.changed`
- `validation.completed`
- `export.completed`
- `quote.submitted`

These events drive notifications, analytics, and integrations.

## Non-Functional API Requirements

- P95 read latency < 250 ms for common metadata endpoints.
- Idempotent behavior for mutation retries.
- Request body size limits for attachments/imports.
- Rate limiting per user and organization.
