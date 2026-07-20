# Cable Design Tool Domain Model

## Purpose

This document defines the canonical domain model for cable assembly design, including entities, relationships, and a reference JSON structure used by APIs, validation, exports, and manufacturing integration.

## Core Modeling Approach

- Connectors are graph nodes.
- Cable paths are graph edges.
- Pin mappings are edge-level relationships between specific endpoints.
- Physical and semantic properties are attributes attached to entities.
- Canvas coordinates are UI metadata, not the source of engineering truth.

## Aggregate Hierarchy

- `Project`
  - `Harness`
    - `Revision` (immutable snapshot)
      - `Connector[]`
      - `CablePath[]`
      - `PinMapping[]`
      - `Bundle[]`
      - `Annotation[]`
      - `FlyingLead[]`

## Entity Definitions

### Project

- `id: UUID`
- `name: string`
- `description?: string`
- `createdBy: UserId`
- `createdAt: ISODateTime`
- `updatedAt: ISODateTime`

### Harness

- `id: UUID`
- `projectId: UUID`
- `name: string`
- `status: HarnessStatus` (`draft | locked | submitted | in_review | quoted | released`)
- `currentRevisionId: UUID`
- `createdBy: UserId`
- `createdAt: ISODateTime`
- `updatedAt: ISODateTime`

### Revision

- `id: UUID`
- `designId: UUID`
- `revisionNumber: int`
- `baseRevisionId?: UUID`
- `createdBy: UserId`
- `createdAt: ISODateTime`
- `rulesetVersion: string`
- `libraryVersion: string`
- `snapshot: HarnessSnapshot`

### Connector

- `id: UUID`
- `reference: string` (e.g., `J1`, `P2`)
- `family: ConnectorFamily`
- `partNumber: string`
- `libraryComponentId?: string` (optional stable library reference)
- `displayName: string`
- `pins: Pin[]`
- `orientation?: string`
- `backshellPartNumber?: string`
- `backshellLibraryComponentId?: string`
- `strainReliefPartNumber?: string`
- `strainReliefLibraryComponentId?: string`
- `location: CanvasPosition`
- `metadata: Record<string, string>`

### Pin

- `id: string` (connector-scoped unique ID)
- `number: string`
- `name?: string`
- `type?: string`
- `gender?: string`
- `signalDefault?: string`

### CablePath

- `id: UUID`
- `fromConnectorId: UUID`
- `toConnectorId: UUID`
- `pathType: PathType` (`wire | coax | twisted_pair | ribbon | custom`)
- `wireComponentId?: string`
- `wirePartNumber?: string`
- `wireAwg?: string`
- `wireColor?: string`
- `wireGroup?: string`
- `length?: number` (inches in current implementation)
- `sleeving?: SleevingType` (`none | expandable_sleeving | wire_braid_under_expandable_sleeving`)
- `fromContact?: string`
- `toContact?: string`
- `fromSignalDescription?: string`
- `toSignalDescription?: string`
- `labelPartNumber?: string`
- `labelText?: string`
- `notes?: string`
- `bundleId?: UUID`
- `labels: string[]`
- `metadata: Record<string, string>`

> Implementation note: the runtime snapshot uses flat wire fields (`wirePartNumber`, `wireAwg`, `wireColor`, `wireComponentId`) rather than a nested `wireSpec` object. Docs historically described `WireSpec`; treat the flat fields as canonical.

### PinMapping

- `id: UUID`
- `pathId: UUID`
- `fromConnectorId: UUID`
- `fromPinId: string`
- `toConnectorId: UUID`
- `toPinId: string`
- `mappingType: MappingType` (`one_to_one | one_to_many | loopback`)
- `signalName?: string`
- `notes?: string`

### Bundle

- `id: UUID`
- `name: string`
- `pathIds: UUID[]`
- `outerSleeving?: SleevingSpec`
- `labels: string[]`
- `notes?: string`

### Annotation

- `id: UUID`
- `kind: AnnotationKind` (`label | note | callout`)
- `text: string`
- `targetType?: string`
- `targetId?: UUID`
- `location?: CanvasPosition`

### FlyingLead

- `id: UUID`
- `pathId: UUID`
- `end: FlyingLeadEnd` (`source | target`)
- `label?: string`
- `terminationType?: string`
- `notes?: string`

### Common Value Objects

`WireSpec`

- `partNumber: string`
- `awg?: string`
- `conductorCount?: int`
- `insulationType?: string`
- `temperatureRatingC?: int`

`LengthSpec`

- `value: number`
- `unit: LengthUnit` (`mm | cm | m | in | ft`)
- `tolerance?: string`

`ShieldingSpec`

- `type: string` (foil, braid, combo, etc.)
- `coveragePercent?: number`
- `drainWire?: boolean`

`SleevingSpec`

- `material: string`
- `diameter?: string`
- `color?: string`

`CanvasPosition`

- `x: number`
- `y: number`

## Relationship Constraints

- Every `PinMapping` must reference valid `Connector` and `Pin` IDs.
- `PinMapping.pathId` must reference an existing `CablePath`.
- `Bundle.pathIds` must reference valid paths in the same revision.
- Loopback mappings must use same connector for source and destination.
- `CablePath.fromConnectorId` and `toConnectorId` may be equal only when rules allow loopback path objects.

## Canonical Snapshot JSON (Reference)

```json
{
  "designId": "2e3c8cd6-c055-4ef8-bbb2-539ef8f2632f",
  "revisionId": "ac855f72-8d1e-4712-aa60-4cc953a3f83f",
  "revisionNumber": 4,
  "rulesetVersion": "rules-2026.03",
  "libraryVersion": "lib-2026.03.1",
  "connectors": [
    {
      "id": "d8fb60d9-ecb0-450f-b07f-a236a1264a27",
      "reference": "J1",
      "family": "standard",
      "partNumber": "PKR-12345",
      "displayName": "37-pin D-sub",
      "pins": [
        { "id": "1", "number": "1" },
        { "id": "2", "number": "2" }
      ],
      "location": { "x": 160, "y": 220 },
      "metadata": {}
    }
  ],
  "paths": [
    {
      "id": "f9f8d723-5cac-4865-a58a-54d3eb6f0ad9",
      "fromConnectorId": "d8fb60d9-ecb0-450f-b07f-a236a1264a27",
      "toConnectorId": "3e123fa4-c69f-43fa-938a-d0178877e16b",
      "pathType": "wire",
      "wireSpec": { "partNumber": "WIRE-22AWG-RED", "awg": "22" },
      "length": { "value": 1.2, "unit": "m", "tolerance": "+/-2%" },
      "labels": ["HARNESS-A"],
      "metadata": {}
    }
  ],
  "pinMappings": [
    {
      "id": "6de88f4e-68d8-4b9a-b76e-3c74de25815a",
      "pathId": "f9f8d723-5cac-4865-a58a-54d3eb6f0ad9",
      "fromConnectorId": "d8fb60d9-ecb0-450f-b07f-a236a1264a27",
      "fromPinId": "1",
      "toConnectorId": "3e123fa4-c69f-43fa-938a-d0178877e16b",
      "toPinId": "A1",
      "mappingType": "one_to_one",
      "signalName": "TRIG_OUT"
    }
  ],
  "bundles": [],
  "annotations": []
}
```

## Validation Invariants (Must-Have)

- No orphan connectors with required connectivity unmet.
- All referenced library parts exist and are active for `libraryVersion`.
- All pin mappings are complete and unambiguous.
- Length/unit values are normalized before export.
- Bundle and shielding rules must satisfy compatibility requirements.
- BOM generation resolves connectors, wires, labels, contacts, sleeving, backshells, and strain reliefs against the library and surfaces unresolved parts.

## Bill Of Materials

A revision BOM is derived by joining the revision snapshot with the component library:

- Connectors: counted by `partNumber` / `libraryComponentId`
- Backshells: counted by `backshellPartNumber` / `backshellLibraryComponentId` (1 ea per connector)
- Strain reliefs: counted by `strainReliefPartNumber` / `strainReliefLibraryComponentId` (1 ea per connector)
- Wires: aggregated length (inches) by wire part; AWG/color surfaced from path or library
- Labels: counted by `labelPartNumber`
- Contacts: best-effort match of `fromContact` / `toContact` against library `contact` parts
- Sleeving: resolved to `sleeve-tube-braid` library parts via compatibility hints (`Maps to {enum}`), falling back to the enum label when unmapped

Exposed via `GET /v1/revisions/{revisionId}/bom` and included in JSON/PDF/XLSX exports.

## Storage Pattern

- Normalize core entities into relational tables for indexing/querying.
- Persist full canonical snapshot JSON per revision for reproducibility.
- Use revision hash for change detection and deterministic export references.

## Naming and Identity Guidance

- Use UUIDv4 for global IDs.
- Keep human-readable connector references (`J1`, `P1`) separate from IDs.
- Preserve original pin numbering semantics from manufacturer definitions.
