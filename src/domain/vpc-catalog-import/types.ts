import type {
  ModuleContactCompat,
  PartImportProvenance,
  PartIngestItem,
  PartRelationshipInput
} from "../library.js";

export type VpcCell = string | number | boolean | null;

export type VpcSheetRow = {
  row: number;
  cells: Record<string, VpcCell>;
};

export type VpcCatalogPart = PartIngestItem & {
  sourceRow: number;
};

export type VpcCatalogIssue = {
  sheet: string;
  row?: number;
  kind: string;
  detail: string;
};

export type VpcCatalogBuild = {
  parts: VpcCatalogPart[];
  relationships: PartRelationshipInput[];
  moduleContactCompat: ModuleContactCompat[];
  provenance: PartImportProvenance[];
  issues: VpcCatalogIssue[];
  unmappedColumns: {
    PARTS: string[];
    COMPATIBILITY: string[];
  };
  stats: {
    partsByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
    statusMapped: Record<string, number>;
    explodedCompatRows: number;
    sourceCompatRows: number;
    sourcePartRows: number;
  };
};
