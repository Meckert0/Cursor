import { buildWirelistXlsxFromTemplateRows } from "../../../../src/domain/wirelist-xlsx-export";
import {
  WIRELIST_TEMPLATE_HEADERS,
  wirelistRowsToTemplateRecords,
  type WirelistRow,
  type WirelistTemplateHeader
} from "./wirelist-utils";

export async function buildWirelistXlsxBuffer(rows: WirelistRow[]): Promise<Buffer> {
  const templateRecords = wirelistRowsToTemplateRecords(rows);
  const columnHeaders = WIRELIST_TEMPLATE_HEADERS as readonly WirelistTemplateHeader[];
  const dataRows = templateRecords.map((record) => columnHeaders.map((header) => record[header]));
  return buildWirelistXlsxFromTemplateRows(dataRows);
}
