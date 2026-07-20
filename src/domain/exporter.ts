import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import type { BomLine, BomResult, LibraryLookup } from "./bom.js";
import { buildBom, createLibraryLookup } from "./bom.js";
import type { LibraryComponentRecord } from "./library.js";
import { buildWirelistXlsxFromTemplateRows } from "./wirelist-xlsx-export.js";
import type { Revision } from "./types.js";

type JsonObject = Record<string, unknown>;

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeRevisionPayload(revision: Revision): JsonObject {
  return {
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    designId: revision.designId,
    rulesetVersion: revision.rulesetVersion,
    libraryVersion: revision.libraryVersion,
    connectors: sortById(revision.snapshot.connectors).map((connector) => ({
      ...connector,
      pins: [...connector.pins].sort((left, right) => left.id.localeCompare(right.id))
    })),
    junctions: sortById(revision.snapshot.junctions ?? []),
    paths: sortById(revision.snapshot.paths),
    pinMappings: sortById(revision.snapshot.pinMappings),
    bundles: sortById(revision.snapshot.bundles).map((bundle) => ({
      ...bundle,
      pathIds: [...bundle.pathIds].sort((left, right) => left.localeCompare(right))
    })),
    annotations: sortById(revision.snapshot.annotations)
  };
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortObject(item));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sortedKeys = Object.keys(input).sort((left, right) => left.localeCompare(right));
    const output: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      output[key] = stableSortObject(input[key]);
    }
    return output;
  }
  return value;
}

function resolveLookup(libraryComponents?: LibraryComponentRecord[] | LibraryLookup): LibraryLookup {
  if (!libraryComponents) {
    return createLibraryLookup([]);
  }
  if (Array.isArray(libraryComponents)) {
    return createLibraryLookup(libraryComponents);
  }
  return libraryComponents;
}

export function buildDeterministicJsonExport(
  revision: Revision,
  libraryComponents?: LibraryComponentRecord[] | LibraryLookup
): { artifact: JsonObject; contentHash: string; bom: BomResult } {
  const lookup = resolveLookup(libraryComponents);
  const bom = buildBom(revision, lookup);
  const normalized = {
    ...normalizeRevisionPayload(revision),
    bom: {
      libraryVersion: bom.libraryVersion,
      summary: bom.summary,
      lines: bom.lines
    }
  };
  const stable = stableSortObject(normalized) as JsonObject;
  const serialized = JSON.stringify(stable);
  const contentHash = createHash("sha256").update(serialized).digest("hex");
  return { artifact: stable, contentHash, bom };
}

function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

const FIXED_DOCUMENT_DATE = new Date("2000-01-01T00:00:00.000Z");

function formatBomTableLines(bom: BomResult): string[] {
  const header = "Item | Category | Part Number | Description | Qty | Unit | Status | Used By";
  const rows = bom.lines.map((line, index) => {
    const usedBy = line.designRefs.join(", ");
    return `${index + 1} | ${line.category} | ${line.partNumber} | ${line.description} | ${line.quantity} | ${line.unit} | ${line.resolution} | ${usedBy}`;
  });
  return [header, ...rows];
}

async function renderPdfContent(artifact: JsonObject, bom: BomResult): Promise<Buffer> {
  const doc = new PDFDocument({
    autoFirstPage: true,
    compress: false,
    info: {
      Title: "Cable Design Revision Export",
      Author: "CDT Backend",
      Subject: "Deterministic cable design export",
      Creator: "CDT Backend Export Worker",
      Producer: "CDT Backend Export Worker",
      CreationDate: FIXED_DOCUMENT_DATE,
      ModDate: FIXED_DOCUMENT_DATE
    }
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Courier").fontSize(10);
  doc.text("Cable Design Revision Export");
  doc.moveDown(1);
  doc.text("Bill of Materials");
  doc.moveDown(0.5);
  for (const line of formatBomTableLines(bom)) {
    doc.text(line, { lineBreak: true });
  }
  doc.moveDown(1);
  doc.text("Revision Snapshot (JSON)");
  doc.moveDown(0.5);
  doc.text(JSON.stringify(artifact, null, 2), { lineBreak: true });
  doc.end();

  return completion;
}

function formatLocation(connectorReference: string, contact: string): string {
  if (!connectorReference && !contact) {
    return "";
  }
  if (!contact) {
    return connectorReference;
  }
  return `${connectorReference} - ${contact}`;
}

function toWirelistRows(artifact: JsonObject): Array<Array<string | number>> {
  const connectors = (artifact.connectors ?? []) as Array<{ id: string; reference: string; pins: Array<{ id: string; number: string }> }>;
  const paths = (artifact.paths ?? []) as Array<{
    id: string;
    runNumber?: number;
    fromConnectorId: string;
    toConnectorId: string;
    length?: number;
    fromContact?: string;
    fromSignalDescription?: string;
    wireAwg?: string;
    wirePartNumber?: string;
    wireColor?: string;
    wireGroup?: string;
    sleeving?: string;
    toContact?: string;
    toSignalDescription?: string;
    labelPartNumber?: string;
    labelText?: string;
    notes?: string;
  }>;
  const connectorById = new Map(connectors.map((connector) => [connector.id, connector.reference]));
  return paths.map((wirePath, index) => {
    const runNumber = Number.isInteger(wirePath.runNumber) && (wirePath.runNumber ?? 0) > 0 ? wirePath.runNumber! : index + 1;
    const fromReference = connectorById.get(wirePath.fromConnectorId) ?? wirePath.fromConnectorId;
    const toReference = connectorById.get(wirePath.toConnectorId) ?? wirePath.toConnectorId;
    return [
      runNumber,
      formatLocation(fromReference, wirePath.fromContact ?? ""),
      wirePath.fromContact ?? "",
      wirePath.fromSignalDescription ?? "",
      wirePath.wireAwg ?? "",
      wirePath.wirePartNumber ?? "",
      wirePath.length !== undefined ? String(wirePath.length) : "",
      wirePath.sleeving ?? "none",
      wirePath.wireColor ?? "",
      wirePath.wireGroup ?? "",
      formatLocation(toReference, wirePath.toContact ?? ""),
      wirePath.toContact ?? "",
      wirePath.toSignalDescription ?? "",
      wirePath.labelPartNumber ?? "",
      wirePath.labelText ?? "",
      wirePath.notes ?? ""
    ];
  });
}

export function toBomRows(lines: BomLine[]): Array<Array<string | number>> {
  return lines.map((line, index) => [
    index + 1,
    line.category,
    line.partNumber,
    line.description,
    line.quantity,
    line.unit,
    line.resolution,
    line.designRefs.join(", ")
  ]);
}

async function renderXlsxContent(artifact: JsonObject, bom: BomResult): Promise<Buffer> {
  return buildWirelistXlsxFromTemplateRows(toWirelistRows(artifact), toBomRows(bom.lines));
}

export async function buildDeterministicDocumentExport(
  revision: Revision,
  format: "pdf" | "xlsx",
  libraryComponents?: LibraryComponentRecord[] | LibraryLookup
): Promise<{ content: Buffer; contentHash: string; bom: BomResult }> {
  const built = buildDeterministicJsonExport(revision, libraryComponents);
  const content =
    format === "pdf" ? await renderPdfContent(built.artifact, built.bom) : await renderXlsxContent(built.artifact, built.bom);
  return { content, contentHash: hashContent(content), bom: built.bom };
}
