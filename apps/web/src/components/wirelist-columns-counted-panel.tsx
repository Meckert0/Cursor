"use client";

import {
  formatWireCutLabel,
  type ColumnsCounted,
  type CountedItem
} from "@/lib/wirelist-columns-counted";
import styles from "./wirelist-columns-counted-panel.module.css";

type ItemSectionProps = {
  id: string;
  title: string;
  description: string;
  items: CountedItem[];
  sourceLabel: string;
};

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(4)));
}

function sourcesTitle(label: string, sources: string[]): string {
  return `${label}: ${sources.join(", ")}`;
}

function ItemSection({ id, title, description, items, sourceLabel }: ItemSectionProps) {
  return (
    <section className={styles.section} data-testid={`columns-counted-${id}`}>
      <h3>{title}</h3>
      <p className={styles.description}>{description}</p>
      {items.length === 0 ? (
        <p className={styles.empty}>None</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{title}</th>
              <th className={styles.qty}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.value} title={sourcesTitle(sourceLabel, item.sources)}>
                <td>{item.value}</td>
                <td className={styles.qty}>
                  {formatQty(item.qty)} {item.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function WirelistColumnsCountedPanel({
  counted,
  description
}: {
  counted: ColumnsCounted;
  description?: string;
}) {
  return (
    <section className={styles.panel} data-testid="wirelist-columns-counted" aria-label="Columns counted">
      <header className={styles.header}>
        <h2>Columns counted</h2>
        <p>
          {description ??
            `${counted.rowCount} wirelist row(s) counted, ${counted.preterminatedEnds} W/CBL end(s). Quantities are rolled up the same way as the Excel "Columns Counted" button. Connector parts are listed on the Details page. The downloaded file includes this roll-up as a sheet.`}
        </p>
      </header>
      {counted.warnings.length > 0 ? (
        <ul className={styles.warnings} data-testid="columns-counted-warnings">
          {counted.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.sections}>
        <ItemSection
          id="non-bom"
          title="Non-BOM Items"
          description="Contacts and wire/patchcords that are surrounded in ()."
          items={counted.nonBomItems}
          sourceLabel="Runs"
        />
        <ItemSection
          id="contacts"
          title="BOM Contacts"
          description="All other contacts from the From Contact and To Contact columns. W/CBL is not a part."
          items={counted.bomContacts}
          sourceLabel="Runs"
        />
        <ItemSection
          id="patchcords"
          title="Patchcords"
          description="Wire/Patchcord P/Ns starting with 7-, P-, 710 or 720; one each, (HALF) counts 0.5."
          items={counted.patchcords}
          sourceLabel="Runs"
        />
        <section className={styles.section} data-testid="columns-counted-wire">
          <h3>Wire</h3>
          <p className={styles.description}>
            Cut list per part number and length. Total BOM Qty is feet for bulk wire and each for pre-terminated cables
            (W/CBL).
          </p>
          {counted.wires.length === 0 ? (
            <p className={styles.empty}>None</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Wire</th>
                  <th className={styles.qty}>Qty</th>
                  <th className={styles.qty}>Total BOM Qty</th>
                </tr>
              </thead>
              <tbody>
                {counted.wires.map((line) => (
                  <tr
                    key={`${line.partNumber}|${line.length}`}
                    className={line.firstInGroup ? styles.groupStart : undefined}
                    title={sourcesTitle("Runs", line.sources)}
                  >
                    <td>{formatWireCutLabel(line)}</td>
                    <td className={styles.qty}>{line.count}</td>
                    <td className={styles.qty}>
                      {line.firstInGroup ? `${formatQty(line.groupTotal)} ${line.unit}` : "↑"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <ItemSection
          id="labels"
          title="Labels"
          description="One per row with a Label P/N."
          items={counted.labels}
          sourceLabel="Runs"
        />
        <ItemSection
          id="notes-items"
          title="Items"
          description='Items written in Notes as "PART (qty)".'
          items={counted.notesItems}
          sourceLabel="Runs"
        />
      </div>
    </section>
  );
}
