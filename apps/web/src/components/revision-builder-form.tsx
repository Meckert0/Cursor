"use client";

import { useEffect, useMemo, useState } from "react";
import type { LibraryComponentDto, RevisionDto } from "@/lib/api";
import {
  INITIAL_ANNOTATIONS,
  INITIAL_BUNDLES,
  INITIAL_CONNECTORS,
  INITIAL_JUNCTIONS,
  INITIAL_MAPPINGS,
  INITIAL_PATHS,
  buildClientValidationIssues,
  buildSnapshotFromRows,
  convertSnapshotToRows,
  summarizeSnapshotDiff,
  type AnnotationRow,
  type BundleRow,
  type ConnectorLocationMap,
  type ConnectorRow,
  type MappingRow,
  type PathRow
} from "@/lib/revision-builder-utils";
import styles from "./revision-builder-form.module.css";

type RevisionTemplate = {
  revisionId: string;
  label: string;
  snapshot: RevisionDto["snapshot"];
};

function loadDraftRows(draftStorageKey?: string) {
  if (!draftStorageKey || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as RevisionDto["snapshot"];
    return convertSnapshotToRows(parsed);
  } catch {
    return null;
  }
}

function loadImportRows(importStorageKey?: string) {
  if (!importStorageKey || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(importStorageKey);
    if (!raw) {
      return null;
    }
    window.localStorage.removeItem(importStorageKey);
    const parsed = JSON.parse(raw) as RevisionDto["snapshot"];
    return convertSnapshotToRows(parsed);
  } catch {
    return null;
  }
}

export function RevisionBuilderForm({
  action,
  templates,
  draftStorageKey,
  importStorageKey,
  connectorLibraryHints
}: {
  action: (formData: FormData) => void | Promise<void>;
  templates: RevisionTemplate[];
  draftStorageKey?: string;
  importStorageKey?: string;
  connectorLibraryHints?: LibraryComponentDto[];
}) {
  const initialImport = useMemo(() => loadImportRows(importStorageKey), [importStorageKey]);
  const initialDraft = useMemo(() => loadDraftRows(draftStorageKey), [draftStorageKey]);
  const initialRows = initialImport ?? initialDraft;
  const [connectors, setConnectors] = useState<ConnectorRow[]>(() => initialRows?.connectors ?? INITIAL_CONNECTORS);
  const [junctions, setJunctions] = useState<RevisionDto["snapshot"]["junctions"]>(() => initialRows?.junctions ?? INITIAL_JUNCTIONS);
  const [paths, setPaths] = useState<PathRow[]>(() => initialRows?.paths ?? INITIAL_PATHS);
  const [mappings, setMappings] = useState<MappingRow[]>(() => initialRows?.mappings ?? INITIAL_MAPPINGS);
  const [bundles, setBundles] = useState<BundleRow[]>(() => initialRows?.bundles ?? INITIAL_BUNDLES);
  const [annotations, setAnnotations] = useState<AnnotationRow[]>(() => initialRows?.annotations ?? INITIAL_ANNOTATIONS);
  const [connectorLocations, setConnectorLocations] = useState<ConnectorLocationMap>(() => initialRows?.connectorLocations ?? {});
  const [showRawJson, setShowRawJson] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateNotices, setTemplateNotices] = useState<string[]>(() => {
    if (initialImport) {
      return ["Imported snapshot draft from graphical canvas."];
    }
    if (initialDraft) {
      return ["Loaded draft-in-progress from local browser storage."];
    }
    return [];
  });
  const [baseSnapshot, setBaseSnapshot] = useState<RevisionDto["snapshot"] | null>(null);
  const connectorGroups = useMemo(() => {
    const groups = new Map<string, { connectorId: string; reference: string; rowIndexes: number[] }>();
    connectors.forEach((row, index) => {
      const existing = groups.get(row.id);
      if (existing) {
        existing.rowIndexes.push(index);
      } else {
        groups.set(row.id, {
          connectorId: row.id,
          reference: row.reference,
          rowIndexes: [index]
        });
      }
    });
    return Array.from(groups.values());
  }, [connectors]);

  const snapshotObject = useMemo(
    () =>
      buildSnapshotFromRows({
        connectors,
        junctions: junctions ?? [],
        paths,
        mappings,
        bundles,
        annotations
      }, connectorLocations),
    [annotations, bundles, connectorLocations, connectors, junctions, mappings, paths]
  );

  const snapshotJson = useMemo(() => {
    return JSON.stringify(snapshotObject, null, 2);
  }, [snapshotObject]);

  const validationIssues = useMemo(
    () =>
      buildClientValidationIssues({
        connectors,
        junctions: junctions ?? [],
        paths,
        mappings,
        bundles,
        annotations
      }),
    [annotations, bundles, connectors, junctions, mappings, paths]
  );

  const canSubmit = validationIssues.length === 0;
  const connectorHints = useMemo(
    () => (connectorLibraryHints ?? []).filter((item) => item.category === "contact"),
    [connectorLibraryHints]
  );
  const connectorHintByPartNumber = useMemo(
    () => new Map(connectorHints.map((item) => [item.partNumber.trim().toLowerCase(), item])),
    [connectorHints]
  );
  const referenceListId = "connector-reference-hints";

  const diffSummary = useMemo(() => {
    if (!baseSnapshot) {
      return null;
    }
    return summarizeSnapshotDiff(baseSnapshot, snapshotObject);
  }, [baseSnapshot, snapshotObject]);

  useEffect(() => {
    if (!draftStorageKey) {
      return;
    }
    window.localStorage.setItem(draftStorageKey, JSON.stringify(snapshotObject));
  }, [draftStorageKey, snapshotObject]);

  const loadTemplate = () => {
    if (!selectedTemplateId) {
      return;
    }
    const template = templates.find((item) => item.revisionId === selectedTemplateId);
    if (!template) {
      return;
    }
    const converted = convertSnapshotToRows(template.snapshot);
    setConnectors(converted.connectors);
    setJunctions(converted.junctions);
    setPaths(converted.paths);
    setMappings(converted.mappings);
    setBundles(converted.bundles);
    setAnnotations(converted.annotations);
    setConnectorLocations(converted.connectorLocations);
    setTemplateNotices(converted.notices);
    setBaseSnapshot(template.snapshot);
    if (draftStorageKey) {
      window.localStorage.removeItem(draftStorageKey);
    }
  };

  const updateConnectorRow = (rowIndex: number, patch: Partial<ConnectorRow>) => {
    const current = connectors[rowIndex];
    const previousId = current?.id.trim() ?? "";
    const nextId = typeof patch.id === "string" ? patch.id.trim() : previousId;
    if (previousId && previousId !== nextId) {
      setConnectorLocations((previous) => {
        const previousLocation = previous[previousId];
        const alreadyHasNext = nextId.length > 0 && Boolean(previous[nextId]);
        const nextLocations: ConnectorLocationMap = { ...previous };
        delete nextLocations[previousId];
        if (previousLocation && nextId.length > 0 && !alreadyHasNext) {
          nextLocations[nextId] = previousLocation;
        }
        return nextLocations;
      });
    }
    setConnectors((prev) => prev.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row)));
  };

  const addConnector = () => {
    setConnectors((prev) => [
      ...prev,
      {
        id: `c${connectorGroups.length + 1}`,
        reference: `J${connectorGroups.length + 1}`,
        pinId: "1",
        pinNumber: "1"
      }
    ]);
  };

  const addPinToConnector = (connectorId: string) => {
    const group = connectorGroups.find((item) => item.connectorId === connectorId);
    const reference = group?.reference ?? "";
    const existingPinIds = connectors
      .filter((row) => row.id === connectorId)
      .map((row) => Number.parseInt(row.pinId, 10))
      .filter((value) => Number.isFinite(value));
    const nextPinNumber = existingPinIds.length > 0 ? Math.max(...existingPinIds) + 1 : 1;

    setConnectors((prev) => [
      ...prev,
      {
        id: connectorId,
        reference,
        pinId: String(nextPinNumber),
        pinNumber: String(nextPinNumber)
      }
    ]);
  };

  const removeConnector = (connectorId: string) => {
    setConnectorLocations((previous) => {
      const next = { ...previous };
      delete next[connectorId];
      return next;
    });
    setConnectors((prev) => prev.filter((row) => row.id !== connectorId));
  };

  const removeConnectorPin = (rowIndex: number) => {
    const connectorId = connectors[rowIndex]?.id.trim();
    if (connectorId) {
      const remainingRows = connectors.filter((row, index) => index !== rowIndex && row.id.trim() === connectorId).length;
      if (remainingRows === 0) {
        setConnectorLocations((previous) => {
          const next = { ...previous };
          delete next[connectorId];
          return next;
        });
      }
    }
    setConnectors((prev) => prev.filter((_, index) => index !== rowIndex));
  };

  const clearDraft = () => {
    if (!draftStorageKey) {
      return;
    }
    window.localStorage.removeItem(draftStorageKey);
    setTemplateNotices((prev) => [...prev, "Draft-in-progress cleared from local browser storage."]);
  };

  const isInvalid = (value: string) => value.trim().length === 0;

  return (
    <form action={action} className={styles.form} data-testid="revision-builder-form">
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Load from existing revision</h3>
        </div>
        <div className={styles.templateRow}>
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
            <option value="">Select revision snapshot</option>
            {templates.map((template) => (
              <option key={template.revisionId} value={template.revisionId}>
                {template.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadTemplate} disabled={!selectedTemplateId}>
            Load snapshot
          </button>
        </div>
        {templateNotices.length > 0 ? (
          <ul className={styles.noticeList}>
            {templateNotices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        ) : null}
        {draftStorageKey ? (
          <button type="button" onClick={clearDraft}>
            Clear local draft
          </button>
        ) : null}
      </section>

      <label>
        Ruleset version (optional)
        <input name="rulesetVersion" type="text" placeholder="rules-2026.03" />
      </label>
      <label>
        Library version (optional)
        <input name="libraryVersion" type="text" placeholder="lib-2026.03.1" />
      </label>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Connector pins</h3>
          <button type="button" onClick={addConnector}>
            Add connector
          </button>
        </div>
        {connectorGroups.map((group) => {
          const matchedHint = connectorHintByPartNumber.get(group.reference.trim().toLowerCase());
          return (
            <div key={group.connectorId} className={styles.connectorCard}>
              <div className={styles.connectorHeader}>
                <h4>{group.connectorId || "(missing connector id)"}</h4>
                <div className={styles.connectorActions}>
                  <button type="button" onClick={() => addPinToConnector(group.connectorId)}>
                    Add pin
                  </button>
                  <button type="button" onClick={() => removeConnector(group.connectorId)}>
                    Remove connector
                  </button>
                </div>
              </div>
              {matchedHint ? (
                <div className={styles.catalogSignalRow}>
                  <span className={styles.catalogPart}>{matchedHint.partNumber}</span>
                  <span className={styles.catalogBadge}>{matchedHint.stockStatus}</span>
                  {!matchedHint.isActive ? <span className={styles.catalogWarning}>inactive component</span> : null}
                </div>
              ) : null}
              {group.rowIndexes.map((rowIndex) => {
                const connector = connectors[rowIndex];
                return (
                  <div key={`${connector.id}-${rowIndex}`} className={styles.rowGrid}>
                    <label>
                      Connector ID
                      <input
                        className={isInvalid(connector.id) ? styles.invalidInput : undefined}
                        value={connector.id}
                        onChange={(event) => updateConnectorRow(rowIndex, { id: event.target.value })}
                      />
                    </label>
                    <label>
                      Reference
                      <input
                        className={isInvalid(connector.reference) ? styles.invalidInput : undefined}
                        list={referenceListId}
                        value={connector.reference}
                        onChange={(event) => updateConnectorRow(rowIndex, { reference: event.target.value })}
                      />
                    </label>
                    <label>
                      Pin ID
                      <input
                        className={isInvalid(connector.pinId) ? styles.invalidInput : undefined}
                        value={connector.pinId}
                        onChange={(event) => updateConnectorRow(rowIndex, { pinId: event.target.value })}
                      />
                    </label>
                    <label>
                      Pin Number
                      <input
                        className={isInvalid(connector.pinNumber) ? styles.invalidInput : undefined}
                        value={connector.pinNumber}
                        onChange={(event) => updateConnectorRow(rowIndex, { pinNumber: event.target.value })}
                      />
                    </label>
                    <button type="button" onClick={() => removeConnectorPin(rowIndex)}>
                      Remove pin
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        {connectorHints.length > 0 ? (
          <datalist id={referenceListId}>
            {connectorHints.map((hint) => (
              <option key={hint.id} value={hint.partNumber} />
            ))}
          </datalist>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Paths</h3>
          <button
            type="button"
            onClick={() =>
              setPaths((prev) => [
                ...prev,
                {
                  id: `p${prev.length + 1}`,
                  wireName: `wire${prev.length + 1}`,
                  fromConnectorId: connectors[0]?.id ?? "",
                  toConnectorId: connectors[1]?.id ?? "",
                  pathType: "wire",
                  length: "",
                  sleeving: "none",
                  wireComponentId: ""
                }
              ])
            }
          >
            Add path
          </button>
        </div>
        {paths.map((path, index) => (
          <div key={`${path.id}-${index}`} className={styles.rowGrid}>
            <label>
              Wire name
              <input value={path.wireName} readOnly />
            </label>
            <label>
              ID
              <input
                className={isInvalid(path.id) ? styles.invalidInput : undefined}
                value={path.id}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, id: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              From connector
              <input
                className={isInvalid(path.fromConnectorId) ? styles.invalidInput : undefined}
                value={path.fromConnectorId}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, fromConnectorId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              To connector
              <input
                className={isInvalid(path.toConnectorId) ? styles.invalidInput : undefined}
                value={path.toConnectorId}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, toConnectorId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              Path type
              <input
                className={isInvalid(path.pathType) ? styles.invalidInput : undefined}
                value={path.pathType}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, pathType: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              Length (inches)
              <input
                value={path.length}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, length: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              Sleeving type
              <select
                value={path.sleeving}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            sleeving: event.target.value as "none" | "expandable_sleeving" | "wire_braid_under_expandable_sleeving"
                          }
                        : item
                    )
                  )
                }
              >
                <option value="none">none</option>
                <option value="expandable_sleeving">expandable sleeving</option>
                <option value="wire_braid_under_expandable_sleeving">wire braid under expandable sleeving</option>
              </select>
            </label>
            <label>
              Wire component ID
              <input
                value={path.wireComponentId}
                onChange={(event) =>
                  setPaths((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, wireComponentId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <button type="button" onClick={() => setPaths((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Pin mappings</h3>
          <button
            type="button"
            onClick={() =>
              setMappings((prev) => [
                ...prev,
                {
                  id: `m${prev.length + 1}`,
                  pathId: paths[0]?.id ?? "",
                  fromConnectorId: connectors[0]?.id ?? "",
                  fromPinId: connectors[0]?.pinId ?? "1",
                  toConnectorId: connectors[1]?.id ?? "",
                  toPinId: connectors[1]?.pinId ?? "1",
                  mappingType: "one_to_one"
                }
              ])
            }
          >
            Add mapping
          </button>
        </div>
        {mappings.map((mapping, index) => (
          <div key={`${mapping.id}-${index}`} className={styles.mappingGrid}>
            <label>
              ID
              <input
                className={isInvalid(mapping.id) ? styles.invalidInput : undefined}
                value={mapping.id}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, id: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              Path ID
              <input
                className={isInvalid(mapping.pathId) ? styles.invalidInput : undefined}
                value={mapping.pathId}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, pathId: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              From connector
              <input
                className={isInvalid(mapping.fromConnectorId) ? styles.invalidInput : undefined}
                value={mapping.fromConnectorId}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, fromConnectorId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              From pin
              <input
                className={isInvalid(mapping.fromPinId) ? styles.invalidInput : undefined}
                value={mapping.fromPinId}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, fromPinId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              To connector
              <input
                className={isInvalid(mapping.toConnectorId) ? styles.invalidInput : undefined}
                value={mapping.toConnectorId}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, toConnectorId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              To pin
              <input
                className={isInvalid(mapping.toPinId) ? styles.invalidInput : undefined}
                value={mapping.toPinId}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, toPinId: event.target.value } : item
                    )
                  )
                }
              />
            </label>
            <label>
              Mapping type
              <select
                value={mapping.mappingType}
                onChange={(event) =>
                  setMappings((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, mappingType: event.target.value as MappingRow["mappingType"] }
                        : item
                    )
                  )
                }
              >
                <option value="one_to_one">one_to_one</option>
                <option value="one_to_many">one_to_many</option>
                <option value="loopback">loopback</option>
              </select>
            </label>
            <button type="button" onClick={() => setMappings((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Bundles</h3>
          <button
            type="button"
            onClick={() =>
              setBundles((prev) => [
                ...prev,
                {
                  id: `b${prev.length + 1}`,
                  name: `Bundle ${prev.length + 1}`,
                  pathIds: paths[0]?.id ?? ""
                }
              ])
            }
          >
            Add bundle
          </button>
        </div>
        {bundles.length === 0 ? <p className={styles.emptyHint}>No bundles defined.</p> : null}
        {bundles.map((bundle, index) => (
          <div key={`${bundle.id}-${index}`} className={styles.rowGrid}>
            <label>
              ID
              <input
                className={isInvalid(bundle.id) ? styles.invalidInput : undefined}
                value={bundle.id}
                onChange={(event) =>
                  setBundles((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, id: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              Name
              <input
                className={isInvalid(bundle.name) ? styles.invalidInput : undefined}
                value={bundle.name}
                onChange={(event) =>
                  setBundles((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              Path IDs (comma-separated)
              <input
                className={isInvalid(bundle.pathIds) ? styles.invalidInput : undefined}
                value={bundle.pathIds}
                onChange={(event) =>
                  setBundles((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, pathIds: event.target.value } : item))
                  )
                }
              />
            </label>
            <button type="button" onClick={() => setBundles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Annotations</h3>
          <button
            type="button"
            onClick={() =>
              setAnnotations((prev) => [
                ...prev,
                {
                  id: `a${prev.length + 1}`,
                  text: ""
                }
              ])
            }
          >
            Add annotation
          </button>
        </div>
        {annotations.length === 0 ? <p className={styles.emptyHint}>No annotations defined.</p> : null}
        {annotations.map((annotation, index) => (
          <div key={`${annotation.id}-${index}`} className={styles.rowGrid}>
            <label>
              ID
              <input
                className={isInvalid(annotation.id) ? styles.invalidInput : undefined}
                value={annotation.id}
                onChange={(event) =>
                  setAnnotations((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, id: event.target.value } : item))
                  )
                }
              />
            </label>
            <label>
              Text
              <input
                className={isInvalid(annotation.text) ? styles.invalidInput : undefined}
                value={annotation.text}
                onChange={(event) =>
                  setAnnotations((prev) =>
                    prev.map((item, itemIndex) => (itemIndex === index ? { ...item, text: event.target.value } : item))
                  )
                }
              />
            </label>
            <button
              type="button"
              onClick={() => setAnnotations((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <button type="button" className={styles.toggleButton} onClick={() => setShowRawJson((prev) => !prev)}>
        {showRawJson ? "Hide generated snapshot JSON" : "Preview generated snapshot JSON"}
      </button>
      {showRawJson ? <pre className={styles.preview}>{snapshotJson}</pre> : null}

      {diffSummary ? (
        <section className={styles.section}>
          <h3>Pre-submit diff review</h3>
          <p>Comparing loaded base snapshot to current editor state.</p>
          {Object.entries(diffSummary).map(([entity, delta]) => (
            <div key={entity} className={styles.diffRow}>
              <strong>{entity}</strong>
              <span>
                +{delta.added.length} / -{delta.removed.length} / ~{delta.changed.length}
              </span>
              {delta.added.length + delta.removed.length + delta.changed.length > 0 ? (
                <small>
                  {[
                    delta.added.length > 0 ? `added: ${delta.added.join(", ")}` : "",
                    delta.removed.length > 0 ? `removed: ${delta.removed.join(", ")}` : "",
                    delta.changed.length > 0 ? `changed: ${delta.changed.join(", ")}` : ""
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </small>
              ) : (
                <small>No changes.</small>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {!canSubmit ? (
        <div className={styles.validationPanel}>
          <h4>Fix before creating revision</h4>
          <ul>
            {validationIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.validState}>Snapshot passes client-side checks.</p>
      )}

      <input type="hidden" name="snapshotJson" value={snapshotJson} />
      <button type="submit" className={styles.submitButton} disabled={!canSubmit} data-testid="create-revision-submit">
        Create revision
      </button>
    </form>
  );
}
