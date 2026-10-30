import type { RevisionDto } from "./api";
import { isFrameHousingConnector, isSlotPopulated } from "./connector-frames";
import { filterPopulatedWirelistRows, type WirelistRow } from "./wirelist-utils";

/**
 * Port of the "Columns Counted" Office Script that rolls a wirelist up into
 * purchasable quantities. Section layout and conventions follow the script:
 *
 * - "-" and "↑" are never items (every column, including labels).
 * - Contacts/wires wrapped in parentheses are Non-BOM items.
 * - Wire/Patchcord P/Ns starting with a patchcord prefix count 1 each.
 * - A row whose From or To Contact is W/CBL is a pre-terminated cable: 1 each,
 *   or 0.5 each when the P/N ends in "(HALF)". Everything else is bulk wire
 *   counted in feet (Length (in) / 12).
 * - Notes items are "PART (qty)" tokens; "PART @len (qty)" keeps the length.
 *
 * Connector, frame, backshell, and strain-relief parts are not part of this
 * roll-up; they come from the canvas via `buildConnectorCounts` and are
 * combined with these lines by `buildTotalBom`.
 *
 * Intentional differences from the script are called out inline with
 * "Script difference:" comments.
 */

export const PATCHCORD_PART_NUMBER_PREFIXES = ["7-", "P-", "710", "720"] as const;
export const PRETERMINATED_CONTACT_MARKER = "W/CBL";
export const HALF_SUFFIX = "(HALF)";
const SKIPPED_VALUES = new Set(["", "-", "↑"]);

export type CountedUnit = "ea" | "ft";

export type CountedItem = {
  value: string;
  qty: number;
  unit: CountedUnit;
  /** Run numbers (or connector references) that contributed to the quantity. */
  sources: string[];
};

export type CountedWireLine = {
  partNumber: string;
  length: string;
  /** Rows cut at this part number + length. */
  count: number;
  /** Total purchasable quantity for the part number across all lengths. */
  groupTotal: number;
  unit: CountedUnit;
  firstInGroup: boolean;
  sources: string[];
};

export type ColumnsCounted = {
  rowCount: number;
  preterminatedEnds: number;
  nonBomItems: CountedItem[];
  bomContacts: CountedItem[];
  patchcords: CountedItem[];
  wires: CountedWireLine[];
  labels: CountedItem[];
  notesItems: CountedItem[];
  warnings: string[];
};

export type TotalBomLine = {
  partNumber: string;
  quantity: number;
  unit: CountedUnit;
  /** Sections that contributed, in the order they were added. */
  sections: string[];
};

type SnapshotConnector = RevisionDto["snapshot"]["connectors"][number];

export function isSkippedCountValue(value: string): boolean {
  return SKIPPED_VALUES.has(value.trim());
}

export function isPreterminatedContactMarker(value: string): boolean {
  const normalized = value.replace(/[\s/]+/g, "").toUpperCase();
  return normalized === "WCBL";
}

export function hasHalfSuffix(partNumber: string): boolean {
  return /\(HALF\)\s*$/i.test(partNumber.trim());
}

export function isWrappedInParens(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith("(") && trimmed.endsWith(")");
}

function containsParens(value: string): boolean {
  return value.includes("(") && value.includes(")");
}

export function isPatchcordPartNumber(partNumber: string): boolean {
  const bare = partNumber.trim().replace(/^\(/, "").toUpperCase();
  return PATCHCORD_PART_NUMBER_PREFIXES.some((prefix) => bare.startsWith(prefix));
}

function roundQty(value: number): number {
  return Number(value.toFixed(4));
}

function compareValues(left: string, right: string): number {
  return left.toLowerCase().localeCompare(right.toLowerCase());
}

class ItemCounter {
  private readonly entries = new Map<string, CountedItem>();

  add(value: string, qty: number, unit: CountedUnit, source: string) {
    const display = value.trim();
    // Script difference: the script keys on the raw cell text, so "123456" and
    // "123456 " become separate lines. Keys are trimmed and case-folded here.
    const key = display.toLowerCase();
    const existing = this.entries.get(key);
    if (existing) {
      existing.qty += qty;
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
      return;
    }
    this.entries.set(key, { value: display, qty, unit, sources: [source] });
  }

  list(): CountedItem[] {
    return Array.from(this.entries.values())
      .map((entry) => ({ ...entry, qty: roundQty(entry.qty) }))
      .sort((left, right) => compareValues(left.value, right.value));
  }
}

function rowSource(row: WirelistRow, index: number): string {
  return row.runNumber.trim() || String(index + 1);
}

function parseLengthInches(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

type WireGroup = {
  partNumber: string;
  total: number;
  unit: CountedUnit;
  cuts: Map<string, { length: string; count: number; sources: string[] }>;
};

export type NotesItem = { partNumber: string; qty: number };

export type ParsedNotes = {
  items: NotesItem[];
  problems: string[];
};

const NOTES_QTY_WORD = /^(.*?)\(([^()]*)\)[,;.]?$/;

/**
 * Extracts "PART (n)" tokens from a Notes cell. Mirrors the script: the cell is
 * split on whitespace, a word ending in "(...)" is a quantity, and the part
 * number is the preceding word, or the two preceding words when the previous
 * word is an "@length" marker (e.g. `123456 @36" (2)`).
 */
export function parseNotesItems(notes: string): ParsedNotes {
  const items: NotesItem[] = [];
  const problems: string[] = [];
  const trimmed = notes.trim();
  if (isSkippedCountValue(trimmed)) {
    return { items, problems };
  }
  const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
  for (let index = 0; index < words.length; index += 1) {
    const match = NOTES_QTY_WORD.exec(words[index]);
    if (!match) {
      continue;
    }
    const prefix = match[1].trim();
    const qtyRaw = match[2].trim();
    let partNumber = prefix;
    if (!partNumber) {
      // Script difference: "PART(2)" with no space resolved to the word before
      // PART in the script; here the text glued to the parentheses is the part.
      const previous = words[index - 1];
      if (previous === undefined) {
        problems.push(`"(${qtyRaw})" has no part number in front of it.`);
        continue;
      }
      partNumber =
        previous.startsWith("@") && index > 1 ? `${words[index - 2]} ${previous}` : previous;
    }
    partNumber = partNumber.replace(/[,;:]+$/, "");
    if (!/^\d+$/.test(qtyRaw)) {
      problems.push(`"${partNumber} (${qtyRaw})" does not have a whole-number quantity.`);
      continue;
    }
    const qty = Number.parseInt(qtyRaw, 10);
    if (qty <= 0) {
      problems.push(`"${partNumber} (${qtyRaw})" has a zero quantity.`);
      continue;
    }
    items.push({ partNumber, qty });
  }
  return { items, problems };
}

export function buildConnectorCounts(connectors: SnapshotConnector[]): CountedItem[] {
  const counter = new ItemCounter();
  const push = (value: string | undefined, source: string) => {
    if (value === undefined || isSkippedCountValue(value)) {
      return;
    }
    counter.add(value, 1, "ea", source);
  };
  for (const connector of connectors) {
    if (isFrameHousingConnector(connector)) {
      push(connector.partNumber, connector.reference);
      for (const slot of connector.slots ?? []) {
        if (!isSlotPopulated(slot)) {
          continue;
        }
        push(slot.partNumber, slot.reference);
        push(slot.backshellPartNumber, slot.reference);
        push(slot.strainReliefPartNumber, slot.reference);
      }
      continue;
    }
    push(connector.partNumber, connector.reference);
    push(connector.backshellPartNumber, connector.reference);
    push(connector.strainReliefPartNumber, connector.reference);
  }
  return counter.list();
}

export function buildColumnsCounted(inputRows: WirelistRow[]): ColumnsCounted {
  const rows = filterPopulatedWirelistRows(inputRows);
  const warnings: string[] = [];
  const nonBom = new ItemCounter();
  const bomContacts = new ItemCounter();
  const patchcords = new ItemCounter();
  const labels = new ItemCounter();
  const notesItems = new ItemCounter();
  const wireGroups = new Map<string, WireGroup>();
  const wireUnitsSeen = new Map<string, CountedUnit>();
  const mixedWireParts = new Set<string>();
  let preterminatedEnds = 0;

  rows.forEach((row, index) => {
    const source = rowSource(row, index);
    const rowLabel = `Row ${source}`;

    let rowIsPreterminated = false;
    for (const contactValue of [row.fromContact, row.toContact]) {
      const contact = contactValue.trim();
      if (isSkippedCountValue(contact)) {
        continue;
      }
      if (isPreterminatedContactMarker(contact)) {
        // Script difference: the script lists W/CBL itself under BOM Contacts.
        // It is a marker, not a part, so it is counted separately.
        rowIsPreterminated = true;
        preterminatedEnds += 1;
        continue;
      }
      if (containsParens(contact)) {
        nonBom.add(contact, 1, "ea", source);
      } else {
        bomContacts.add(contact, 1, "ea", source);
      }
    }

    const partNumber = row.wirePartNumber.trim();
    if (!isSkippedCountValue(partNumber)) {
      const half = hasHalfSuffix(partNumber);
      const patchcord = isPatchcordPartNumber(partNumber);
      const countedEach = patchcord || rowIsPreterminated;
      let qty: number;
      let unit: CountedUnit;
      if (countedEach) {
        qty = half ? 0.5 : 1;
        unit = "ea";
      } else {
        const inches = parseLengthInches(row.length);
        if (inches === null) {
          warnings.push(`${rowLabel}: "${partNumber}" is bulk wire but Length (in) is missing or not a number; counted as 0 ft.`);
        }
        qty = (inches ?? 0) / 12;
        unit = "ft";
        if (half) {
          warnings.push(`${rowLabel}: "${partNumber}" has (HALF) but no W/CBL contact, so it was counted as bulk wire by length.`);
        }
      }

      if (isWrappedInParens(partNumber)) {
        nonBom.add(partNumber, qty, unit, source);
      } else if (patchcord) {
        // Script difference: the script keeps one patchcord line per distinct
        // length and ignores (HALF) on patchcords; both are merged here.
        patchcords.add(partNumber, qty, unit, source);
      } else {
        const partKey = partNumber.toLowerCase();
        const previousUnit = wireUnitsSeen.get(partKey);
        if (!previousUnit) {
          wireUnitsSeen.set(partKey, unit);
        } else if (previousUnit !== unit && !mixedWireParts.has(partKey)) {
          mixedWireParts.add(partKey);
          warnings.push(
            `"${partNumber}" is marked W/CBL on some rows but not others; each and feet are listed separately. Check the contact columns.`
          );
        }
        const key = `${partKey}|${unit}`;
        let group = wireGroups.get(key);
        if (!group) {
          group = { partNumber, total: 0, unit, cuts: new Map() };
          wireGroups.set(key, group);
        }
        // Script difference: the script's running total dropped earlier cut
        // lengths when a part number had three or more distinct lengths.
        group.total += qty;
        const lengthKey = row.length.trim();
        const cut = group.cuts.get(lengthKey);
        if (cut) {
          cut.count += 1;
          cut.sources.push(source);
        } else {
          group.cuts.set(lengthKey, { length: lengthKey, count: 1, sources: [source] });
        }
      }
    }

    const label = row.labelPartNumber.trim();
    if (!isSkippedCountValue(label)) {
      labels.add(label, 1, "ea", source);
    }

    const parsedNotes = parseNotesItems(row.notes);
    for (const item of parsedNotes.items) {
      notesItems.add(item.partNumber, item.qty, "ea", source);
    }
    for (const problem of parsedNotes.problems) {
      warnings.push(`${rowLabel} Notes: ${problem}`);
    }
  });

  const wires: CountedWireLine[] = [];
  const sortedGroups = Array.from(wireGroups.values()).sort((left, right) =>
    compareValues(left.partNumber, right.partNumber)
  );
  for (const group of sortedGroups) {
    const cuts = Array.from(group.cuts.values()).sort((left, right) => {
      const leftLength = parseLengthInches(left.length);
      const rightLength = parseLengthInches(right.length);
      if (leftLength !== null && rightLength !== null && leftLength !== rightLength) {
        return leftLength - rightLength;
      }
      return compareValues(left.length, right.length);
    });
    cuts.forEach((cut, cutIndex) => {
      wires.push({
        partNumber: group.partNumber,
        length: cut.length,
        count: cut.count,
        groupTotal: roundQty(group.total),
        unit: group.unit,
        firstInGroup: cutIndex === 0,
        sources: cut.sources
      });
    });
  }

  return {
    rowCount: rows.length,
    preterminatedEnds,
    nonBomItems: nonBom.list(),
    bomContacts: bomContacts.list(),
    patchcords: patchcords.list(),
    wires,
    labels: labels.list(),
    notesItems: notesItems.list(),
    warnings
  };
}

const TOTAL_BOM_SECTIONS: Array<{
  name: string;
  items: (counted: ColumnsCounted) => CountedItem[];
}> = [
  { name: "BOM Contacts", items: (counted) => counted.bomContacts },
  { name: "Patchcords", items: (counted) => counted.patchcords },
  { name: "Wire", items: wireGroupTotals },
  { name: "Labels", items: (counted) => counted.labels },
  { name: "Items", items: (counted) => counted.notesItems }
];

function wireGroupTotals(counted: ColumnsCounted): CountedItem[] {
  return counted.wires
    .filter((line) => line.firstInGroup)
    .map((line) => ({
      value: line.partNumber,
      qty: line.groupTotal,
      unit: line.unit,
      sources: line.sources
    }));
}

/**
 * Purchasable lines from the wirelist roll-up plus connector parts, one line
 * per part number and unit, sorted alphabetically. Non-BOM items are excluded.
 * The same part number in feet and each stays on two lines.
 */
export function buildTotalBom(counted: ColumnsCounted, connectors: CountedItem[]): TotalBomLine[] {
  const lines = new Map<string, TotalBomLine>();
  const add = (section: string, items: CountedItem[]) => {
    for (const item of items) {
      const partNumber = item.value.trim();
      const key = `${partNumber.toLowerCase()}|${item.unit}`;
      const existing = lines.get(key);
      if (existing) {
        existing.quantity += item.qty;
        if (!existing.sections.includes(section)) {
          existing.sections.push(section);
        }
        continue;
      }
      lines.set(key, { partNumber, quantity: item.qty, unit: item.unit, sections: [section] });
    }
  };

  for (const section of TOTAL_BOM_SECTIONS) {
    add(section.name, section.items(counted));
  }
  add("Connectors", connectors);

  return Array.from(lines.values())
    .map((line) => ({ ...line, quantity: roundQty(line.quantity) }))
    .sort(
      (left, right) =>
        compareValues(left.partNumber, right.partNumber) || left.unit.localeCompare(right.unit)
    );
}

export function formatWireCutLabel(line: Pick<CountedWireLine, "partNumber" | "length">): string {
  const length = line.length.trim();
  return length ? `${line.partNumber} @${length}"` : line.partNumber;
}
