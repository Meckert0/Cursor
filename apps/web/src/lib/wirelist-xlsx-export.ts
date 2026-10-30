import { buildColumnsCounted } from "./wirelist-columns-counted";
import { buildColumnsCountedSheetRows } from "./wirelist-columns-counted-sheet";
import { buildWirelistXlsxFromTemplateRows } from "./wirelist-xlsx-from-template";
import {
  WIRELIST_TEMPLATE_HEADERS,
  wirelistRowsToTemplateRecords,
  type WirelistRow,
  type WirelistTemplateHeader
} from "./wirelist-utils";

export type WirelistXlsxOptions = {
  /** Set to false to omit the Columns Counted sheet. */
  includeColumnsCounted?: boolean;
};

export async function buildWirelistXlsxBuffer(
  rows: WirelistRow[],
  options: WirelistXlsxOptions = {}
): Promise<Buffer> {
  const templateRecords = wirelistRowsToTemplateRecords(rows);
  const columnHeaders = WIRELIST_TEMPLATE_HEADERS as readonly WirelistTemplateHeader[];
  const dataRows = templateRecords.map((record) => columnHeaders.map((header) => record[header]));
  const includeColumnsCounted = options.includeColumnsCounted ?? true;
  const columnsCountedRows = includeColumnsCounted
    ? buildColumnsCountedSheetRows(buildColumnsCounted(rows))
    : null;
  return buildWirelistXlsxFromTemplateRows(dataRows, [], columnsCountedRows);
}
