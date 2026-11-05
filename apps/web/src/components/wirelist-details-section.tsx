"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { ConnectorModulesSection } from "./connector-modules-section";
import styles from "./wirelist-details-section.module.css";

export function WirelistDetailsSection(props: ComponentProps<typeof ConnectorModulesSection>) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  return (
    <section className={styles.detailsBlock}>
      <button
        type="button"
        className={styles.detailsToggle}
        onClick={() => setIsDetailsOpen((previous) => !previous)}
        aria-expanded={isDetailsOpen}
        aria-controls="wirelist-details-panel"
      >
        {isDetailsOpen ? "Hide Details" : "Show Details"}
      </button>
      {isDetailsOpen ? (
        <div id="wirelist-details-panel" className={styles.connectorsColumn}>
          <ConnectorModulesSection {...props} />
        </div>
      ) : null}
    </section>
  );
}
