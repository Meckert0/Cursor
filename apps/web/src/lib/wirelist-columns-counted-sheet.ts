import { formatWireCutLabel, type ColumnsCounted, type CountedItem } from "./wirelist-columns-counted";

export const COLUMNS_COUNTED_SHEET_NAME = "Columns Counted";

/** A sparse grid: `null` cells are not written to the worksheet. */
export type SparseSheetCell = string | number | null;
export type SparseSheetRows = SparseSheetCell[][];

const INSTRUCTIONS_ROW = 3;
const HEADER_ROW = 5;
const FIRST_DATA_ROW = HEADER_ROW + 1;

// 1-based column positions, matching the Office Script output layout.
const NON_BOM_COLUMN = 2;
const BOM_CONTACTS_COLUMN = 5;
const PATCHCORDS_COLUMN = 8;
const WIRE_COLUMN = 11;
const LABELS_COLUMN = 15;
const NOTES_ITEMS_COLUMN = 18;
const WARNINGS_COLUMN = 21;

export const COLUMNS_COUNTED_LAST_COLUMN = WARNINGS_COLUMN;

function setCell(rows: SparseSheetRows, rowNumber: number, columnNumber: number, value: SparseSheetCell) {
  while (rows.length < rowNumber) {
    rows.push([]);
  }
  const row = rows[rowNumber - 1];
  while (row.length < columnNumber) {
    row.push(null);
  }
  row[columnNumber - 1] = value;
}

function writeItemSection(
  rows: SparseSheetRows,
  column: number,
  title: string,
  instructions: string,
  items: CountedItem[]
) {
  setCell(rows, INSTRUCTIONS_ROW, column, instructions);
  setCell(rows, HEADER_ROW, column, title);
  setCell(rows, HEADER_ROW, column + 1, "Qty");
  items.forEach((item, index) => {
    setCell(rows, FIRST_DATA_ROW + index, column, item.value);
    setCell(rows, FIRST_DATA_ROW + index, column + 1, item.qty);
  });
}

export function buildColumnsCountedSheetRows(counted: ColumnsCounted): SparseSheetRows {
  const rows: SparseSheetRows = [];
  setCell(rows, 1, 1, `Columns Counted: ${counted.rowCount} wirelist row(s), ${counted.preterminatedEnds} W/CBL end(s).`);

  writeItemSection(
    rows,
    NON_BOM_COLUMN,
    "Non-BOM Items",
    "Non-BOM Items: contacts and wire/patchcords that are surrounded in ().",
    counted.nonBomItems
  );
  writeItemSection(rows, BOM_CONTACTS_COLUMN, "BOM Contacts", "BOM Contacts includes all other contacts.", counted.bomContacts);
  writeItemSection(rows, PATCHCORDS_COLUMN, "Patchcords", "Includes all Patchcords.", counted.patchcords);

  setCell(
    rows,
    INSTRUCTIONS_ROW,
    WIRE_COLUMN,
    "Includes all wire with qty feet. Includes preterminated cables (W/CBL) with qty each."
  );
  setCell(rows, HEADER_ROW, WIRE_COLUMN, "Wire");
  setCell(rows, HEADER_ROW, WIRE_COLUMN + 1, "Qty");
  setCell(rows, HEADER_ROW, WIRE_COLUMN + 2, "Total BOM Qty");
  setCell(rows, HEADER_ROW, WIRE_COLUMN + 3, "Unit");
  counted.wires.forEach((line, index) => {
    const rowNumber = FIRST_DATA_ROW + index;
    setCell(rows, rowNumber, WIRE_COLUMN, formatWireCutLabel(line));
    setCell(rows, rowNumber, WIRE_COLUMN + 1, line.count);
    setCell(rows, rowNumber, WIRE_COLUMN + 2, line.firstInGroup ? line.groupTotal : "↑");
    setCell(rows, rowNumber, WIRE_COLUMN + 3, line.firstInGroup ? line.unit : "↑");
  });

  writeItemSection(rows, LABELS_COLUMN, "Labels", "Includes all labels.", counted.labels);
  writeItemSection(rows, NOTES_ITEMS_COLUMN, "Items", "Includes items from the notes column.", counted.notesItems);

  setCell(rows, HEADER_ROW, WARNINGS_COLUMN, "Warnings");
  counted.warnings.forEach((warning, index) => {
    setCell(rows, FIRST_DATA_ROW + index, WARNINGS_COLUMN, warning);
  });

  return rows;
}
