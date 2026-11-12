"use client";

import { useMemo, useRef, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type {
  CompatStatus,
  ContactWireCompatDto,
  LibraryItemCategory,
  ModuleBackshellCompatDto,
  ModuleContactCompatDto,
  ModuleStrainReliefCompatDto,
  PartAliasDto,
  PartDto,
  PartRelationshipDto
} from "@/lib/api";
import styles from "./page.module.css";
import { compatiblePartDisplays, formatRelationshipPositions, visibleCompatibleParts } from "./compatibility-display";
import { moduleAccessoryStatus } from "../../../../../src/domain/module-accessory-compatibility";
import { BLANK_INSERT_FAMILY, catalogPartFamily } from "../../../../../src/domain/library";

type CompatKind = "contact-wire" | "module-contact" | "module-backshell" | "module-strain-relief" | "relationships" | "aliases";

const COMPAT_STATUS_OPTIONS: CompatStatus[] = ["allowed", "forbidden", "review"];

const CODE_SYSTEM_SUGGESTIONS = [
  "contact_3digit",
  "wire_3digit",
  "pc_designer_contact",
  "pc_designer_wire"
] as const;

const RELATIONSHIP_TYPE_SUGGESTIONS = [
  "MODULE_ALLOWED",
  "CONTACT_ALLOWED",
  "MATES_WITH",
  "INSERT_ALLOWED",
  "WIRE_COMPATIBILITY",
  "WIRE_ALLOWED",
  "BACKSHELL_ALLOWED",
  "STRAIN_RELIEF_ALLOWED"
] as const;

const TABS: Array<{ id: CompatKind; label: string }> = [
  { id: "relationships", label: "Compatibility groups" },
  { id: "contact-wire", label: "Contact ↔ Wire" },
  { id: "module-contact", label: "Module ↔ Contact" },
  { id: "module-backshell", label: "Module ↔ Backshell" },
  { id: "module-strain-relief", label: "Module ↔ Strain relief" },
  { id: "aliases", label: "Aliases" }
];

export interface CompatibilityManagerProps {
  items: PartDto[];
  contactWire: ContactWireCompatDto[];
  moduleContact: ModuleContactCompatDto[];
  moduleBackshell: ModuleBackshellCompatDto[];
  moduleStrainRelief: ModuleStrainReliefCompatDto[];
  aliases: PartAliasDto[];
  relationships: PartRelationshipDto[];
  matchingPartIds?: string[];
  searchQuery?: string;
  upsertContactWireAction: (formData: FormData) => void | Promise<void>;
  deleteContactWireAction: (formData: FormData) => void | Promise<void>;
  upsertModuleContactAction: (formData: FormData) => void | Promise<void>;
  deleteModuleContactAction: (formData: FormData) => void | Promise<void>;
  upsertModuleBackshellAction: (formData: FormData) => void | Promise<void>;
  deleteModuleBackshellAction: (formData: FormData) => void | Promise<void>;
  upsertModuleStrainReliefAction: (formData: FormData) => void | Promise<void>;
  deleteModuleStrainReliefAction: (formData: FormData) => void | Promise<void>;
  upsertAliasAction: (formData: FormData) => void | Promise<void>;
  deleteAliasAction: (formData: FormData) => void | Promise<void>;
  upsertRelationshipAction: (formData: FormData) => void | Promise<void>;
  deleteRelationshipAction: (formData: FormData) => void | Promise<void>;
}

function partsByCategory(items: PartDto[], category: LibraryItemCategory): PartDto[] {
  return items
    .filter((item) => item.category === category && !item.isArchived)
    .slice()
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}

function partLabel(part: PartDto): string {
  return `${part.partNumber}${part.family ? ` · ${part.family}` : ""}`;
}

function resolvePn(partById: Map<string, PartDto>, partId: string): string {
  return partById.get(partId)?.partNumber ?? partId;
}

function PartSelect({
  name,
  parts,
  label,
  required = true,
  emptyLabel
}: {
  name: string;
  parts: PartDto[];
  label: string;
  required?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} required={required} defaultValue="">
        <option value="" disabled={required}>
          {emptyLabel ?? (required ? "Select…" : "None")}
        </option>
        {parts.map((part) => (
          <option key={part.id} value={part.id}>
            {partLabel(part)}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusSelect() {
  return (
    <label>
      Status
      <select name="status" required defaultValue="allowed">
        {COMPAT_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompatPairTable({
  leftHeader,
  rightHeader,
  rows,
  deleteAction,
  leftKey,
  rightKey,
  partById
}: {
  leftHeader: string;
  rightHeader: string;
  rows: Array<{ leftId: string; rightId: string; leftPn: string; rightPn: string; status: CompatStatus }>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  leftKey: string;
  rightKey: string;
  partById: Map<string, PartDto>;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.compactTable}`}>
        <thead>
          <tr>
            <th>{leftHeader}</th>
            <th>Description</th>
            <th>{rightHeader}</th>
            <th>Description</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>No matching pairs found.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.leftId}:${row.rightId}`}>
                <td>{row.leftPn}</td>
                <td className={styles.compatDescription}>{partById.get(row.leftId)?.description || "Description unavailable"}</td>
                <td>{row.rightPn}</td>
                <td className={styles.compatDescription}>{partById.get(row.rightId)?.description || "Description unavailable"}</td>
                <td>{row.status}</td>
                <td>
                  <form action={deleteAction} className={styles.inlineAction}>
                    <input type="hidden" name={leftKey} value={row.leftId} />
                    <input type="hidden" name={rightKey} value={row.rightId} />
                    <ConfirmSubmitButton
                      type="submit"
                      className={styles.dangerActionButton}
                      confirmMessage={`Delete ${row.leftPn} ↔ ${row.rightPn}?`}
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CompatibilityManager(props: CompatibilityManagerProps) {
  const matchingIds = useMemo(() => props.matchingPartIds ? new Set(props.matchingPartIds) : undefined, [props.matchingPartIds]);
  const relationshipEditor = useRef<HTMLDetailsElement>(null);
  const [editingRelationship, setEditingRelationship] = useState<PartRelationshipDto | null>(null);
  const [requestedTab, setTab] = useState<CompatKind>("relationships");
  const rowCounts: Record<CompatKind, number> = {
    relationships: props.relationships.length,
    aliases: props.aliases.length,
    "contact-wire": props.contactWire.length,
    "module-contact": props.moduleContact.length,
    "module-backshell": props.moduleBackshell.length,
    "module-strain-relief": props.moduleStrainRelief.length
  };
  const visibleTabs = TABS.filter(entry => entry.id === "relationships" || rowCounts[entry.id] > 0);
  const tab = visibleTabs.some(entry => entry.id === requestedTab) ? requestedTab : "relationships";

  const partById = useMemo(() => {
    const map = new Map<string, PartDto>();
    for (const item of props.items) {
      map.set(item.id, item);
    }
    return map;
  }, [props.items]);

  const contacts = useMemo(() => partsByCategory(props.items, "contact"), [props.items]);
  const wires = useMemo(() => partsByCategory(props.items, "wire"), [props.items]);
  const modules = useMemo(() => partsByCategory(props.items, "module"), [props.items]);
  const strainReliefModules = useMemo(() => modules.filter(part => catalogPartFamily(part) !== BLANK_INSERT_FAMILY), [modules]);
  const backshells = useMemo(() => partsByCategory(props.items, "backshell"), [props.items]);
  const strainReliefs = useMemo(() => partsByCategory(props.items, "strain-relief"), [props.items]);
  const allParts = useMemo(
    () =>
      props.items
        .filter((item) => !item.isArchived)
        .slice()
        .sort((a, b) => a.partNumber.localeCompare(b.partNumber)),
    [props.items]
  );

  const contactWireRows = useMemo(
    () =>
      props.contactWire.map((row) => ({
        leftId: row.contactPartId,
        rightId: row.wirePartId,
        leftPn: resolvePn(partById, row.contactPartId),
        rightPn: resolvePn(partById, row.wirePartId),
        status: row.status
      })),
    [props.contactWire, partById]
  );

  const moduleContactRows = useMemo(
    () =>
      props.moduleContact.map((row) => ({
        leftId: row.modulePartId,
        rightId: row.contactPartId,
        leftPn: resolvePn(partById, row.modulePartId),
        rightPn: resolvePn(partById, row.contactPartId),
        status: row.status
      })),
    [props.moduleContact, partById]
  );

  const moduleBackshellRows = useMemo(
    () =>
      props.moduleBackshell.map((row) => ({
        leftId: row.modulePartId,
        rightId: row.backshellPartId,
        leftPn: resolvePn(partById, row.modulePartId),
        rightPn: resolvePn(partById, row.backshellPartId),
        status: row.status
      })),
    [props.moduleBackshell, partById]
  );

  const moduleStrainReliefRows = useMemo(
    () =>
      props.moduleStrainRelief.map((row) => ({
        leftId: row.modulePartId,
        rightId: row.strainReliefPartId,
        leftPn: resolvePn(partById, row.modulePartId),
        rightPn: resolvePn(partById, row.strainReliefPartId),
        status: partById.get(row.modulePartId) && partById.get(row.strainReliefPartId)
          ? moduleAccessoryStatus(partById.get(row.modulePartId)!, partById.get(row.strainReliefPartId)!, props.relationships) ?? row.status : row.status
      })),
    [props.moduleStrainRelief, partById, props.relationships]
  );

  return (
    <div className={styles.sectionContent}>
      <div className={styles.compatTabs} role="tablist" aria-label="Compatibility tables">
        {visibleTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? styles.compatTabActive : styles.compatTab}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "contact-wire" ? (
        <div className={styles.compatPanel}>
          <details className={styles.recordEditor}>
            <summary className={styles.smallActionButton}>Add contact–wire pair</summary>
          <form action={props.upsertContactWireAction} className={styles.compatAddForm}>
            <PartSelect name="contactPartId" parts={contacts} label="Contact" />
            <PartSelect name="wirePartId" parts={wires} label="Wire" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          </details>
          <CompatPairTable
            leftHeader="Contact PN"
            partById={partById}
            rightHeader="Wire PN"
            rows={contactWireRows}
            deleteAction={props.deleteContactWireAction}
            leftKey="contactPartId"
            rightKey="wirePartId"
          />
        </div>
      ) : null}

      {tab === "module-contact" ? (
        <div className={styles.compatPanel}>
          <details className={styles.recordEditor}>
            <summary className={styles.smallActionButton}>Add module–contact pair</summary>
          <form action={props.upsertModuleContactAction} className={styles.compatAddForm}>
            <PartSelect name="modulePartId" parts={modules} label="Module" />
            <PartSelect name="contactPartId" parts={contacts} label="Contact" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          </details>
          <CompatPairTable
            leftHeader="Module PN"
            partById={partById}
            rightHeader="Contact PN"
            rows={moduleContactRows}
            deleteAction={props.deleteModuleContactAction}
            leftKey="modulePartId"
            rightKey="contactPartId"
          />
        </div>
      ) : null}

      {tab === "module-backshell" ? (
        <div className={styles.compatPanel}>
          <details className={styles.recordEditor}>
            <summary className={styles.smallActionButton}>Add module–backshell pair</summary>
          <form action={props.upsertModuleBackshellAction} className={styles.compatAddForm}>
            <PartSelect name="modulePartId" parts={modules} label="Module" />
            <PartSelect name="backshellPartId" parts={backshells} label="Backshell" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          </details>
          <CompatPairTable
            leftHeader="Module PN"
            partById={partById}
            rightHeader="Backshell PN"
            rows={moduleBackshellRows}
            deleteAction={props.deleteModuleBackshellAction}
            leftKey="modulePartId"
            rightKey="backshellPartId"
          />
        </div>
      ) : null}

      {tab === "module-strain-relief" ? (
        <div className={styles.compatPanel}>
          <details className={styles.recordEditor}>
            <summary className={styles.smallActionButton}>Add module–strain relief pair</summary>
          <form action={props.upsertModuleStrainReliefAction} className={styles.compatAddForm}>
            <PartSelect name="modulePartId" parts={strainReliefModules} label="Module" />
            <PartSelect name="strainReliefPartId" parts={strainReliefs} label="Strain relief" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          </details>
          <CompatPairTable
            leftHeader="Module PN"
            partById={partById}
            rightHeader="Strain-relief PN"
            rows={moduleStrainReliefRows}
            deleteAction={props.deleteModuleStrainReliefAction}
            leftKey="modulePartId"
            rightKey="strainReliefPartId"
          />
        </div>
      ) : null}

      {tab === "relationships" ? (
        <div className={styles.compatPanel}>
          <details ref={relationshipEditor} className={styles.recordEditor}>
            <summary className={styles.smallActionButton}>{editingRelationship ? "Edit compatibility group" : "Add compatibility group"}</summary>
          <form key={editingRelationship?.id ?? "new"} action={async data => { await props.upsertRelationshipAction(data); setEditingRelationship(null); if (relationshipEditor.current) relationshipEditor.current.open = false; }} className={styles.compatAddForm}>
            {editingRelationship ? <input type="hidden" name="id" value={editingRelationship.id} /> : null}
            <input type="hidden" name="extra" value={JSON.stringify(editingRelationship?.extra ?? {})} />
            <label>Parent part<select name="parentPartId" required defaultValue={editingRelationship?.parentPartId ?? ""}>
              <option value="" disabled>Select…</option>{allParts.map(part => <option key={part.id} value={part.id}>{partLabel(part)}</option>)}
            </select></label>
            <label>
              Compatible parts
              <input
                name="compatibleParts"
                defaultValue={editingRelationship ? [...editingRelationship.compatibleParts, ...(editingRelationship.unresolvedParts ?? [])].join(", ") : ""}
                placeholder="510161101, 510161102, … (empty for gauge/media rule)"
              />
            </label>
            <label>
              Relationship type
              <input name="relationshipType" defaultValue={editingRelationship?.relationshipType ?? ""} list="relationship-types" required placeholder="MODULE_ALLOWED" />
              <datalist id="relationship-types">
                {RELATIONSHIP_TYPE_SUGGESTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label>
              Position type
              <input name="positionType" defaultValue={editingRelationship?.positionType ?? ""} placeholder="MODULE_SLOT, QUADRAPADDLE, …" />
            </label>
            <label>
              Parent positions
              <input name="parentPositions" defaultValue={editingRelationship?.parentPositions.join(", ") ?? ""} placeholder="A, B or pin IDs" />
            </label>
            <label>Status<select name="status" defaultValue={editingRelationship?.status ?? "allowed"}>{COMPAT_STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
            <label>Coverage<select name="isExhaustive" defaultValue={String(editingRelationship?.isExhaustive ?? true)}><option value="true">Only listed parts are allowed</option><option value="false">Other parts remain unknown</option></select></label>
            <label>Source<input name="source" defaultValue={editingRelationship?.source ?? ""} /></label>
            <label>
              Source status
              <input name="sourceStatus" defaultValue={editingRelationship?.sourceStatus ?? ""} placeholder="CONFIRMED, CONDITIONAL_CLEARANCE, …" />
            </label>
            <label>
              Notes
              <input name="notes" defaultValue={editingRelationship?.notes ?? ""} />
            </label>
            <button type="submit">Add / update</button>
            {editingRelationship ? <button type="button" onClick={() => { setEditingRelationship(null); if (relationshipEditor.current) relationshipEditor.current.open = false; }}>Cancel edit</button> : null}
          </form>
          </details>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.compactTable}`}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Parent</th>
                  <th>Parent description</th>
                  <th>Compatible parts</th>
                  <th>Positions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.relationships.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No compatibility groups found.</td>
                  </tr>
                ) : (
                  props.relationships.map((row) => {
                    const parent = partById.get(row.parentPartId);
                    const parts = compatiblePartDisplays(row, props.items);
                    const visibleParts = visibleCompatibleParts(parts, parent, matchingIds, props.searchQuery);
                    const usableParts = visibleParts.filter(part => !part.blockedReason);
                    const blockedParts = visibleParts.filter(part => part.blockedReason);
                    return (
                      <tr key={row.id}>
                        <td className={styles.compatRelationshipType}>
                          {row.relationshipType}
                          {row.positionType ? ` · ${row.positionType}` : ""}
                        </td>
                        <td>{resolvePn(partById, row.parentPartId)}</td>
                        <td className={styles.compatDescription}>{parent?.description || "Description unavailable"}</td>
                        <td>
                          {usableParts.length ? (
                            <ul className={styles.compatiblePartList}>
                              {usableParts.map(part => (
                                <li key={part.id ?? part.partNumber}>
                                  <span className={styles.compatiblePartNumber}>{part.partNumber}</span>
                                  <span className={styles.compatiblePartDescription}>{part.description || "Description unavailable"}</span>
                                </li>
                              ))}
                            </ul>
                          ) : "—"}
                          {blockedParts.length ? <p className={styles.compatSearchHint}>Excluded from strain-relief compatibility: {blockedParts.map(part => part.partNumber).join(", ")}. Blank modules cannot use strain reliefs.</p> : null}
                          {visibleParts.length < parts.length ? <p className={styles.compatSearchHint}>Showing {visibleParts.length} of {parts.length} {parts.some(part => part.blockedReason) ? "source targets" : "compatible parts"}</p> : null}
                          {row.unresolvedParts?.length ? <p role="status">Needs resolution: {row.unresolvedParts.join(", ")}</p> : null}
                        </td>
                        <td>{formatRelationshipPositions(row, parent)}</td>
                        <td>{row.status}<br />{row.isExhaustive ? "Exhaustive list" : "Other parts unknown"}</td>
                        <td>
                          {!row.legacyPairKey ? <button type="button" onClick={() => { setEditingRelationship(row); if (relationshipEditor.current) relationshipEditor.current.open = true; }}>Edit</button> : null}
                          <form action={props.deleteRelationshipAction} className={styles.inlineAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <ConfirmSubmitButton
                              type="submit"
                              className={styles.dangerActionButton}
                              confirmMessage={`Delete ${row.relationshipType} relationship?`}
                            >
                              Delete
                            </ConfirmSubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "aliases" ? (
        <div className={styles.compatPanel}>
          <details className={styles.recordEditor}>
            <summary className={styles.smallActionButton}>Add alias</summary>
          <form action={props.upsertAliasAction} className={styles.compatAddForm}>
            <label>
              Part
              <select name="partId" required defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {props.items
                  .filter((item) => !item.isArchived)
                  .slice()
                  .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
                  .map((part) => (
                    <option key={part.id} value={part.id}>
                      [{part.category}] {partLabel(part)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Code system
              <input name="codeSystem" list="alias-code-systems" required placeholder="e.g. contact_3digit" />
              <datalist id="alias-code-systems">
                {CODE_SYSTEM_SUGGESTIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label>
              Code
              <input name="code" required placeholder="Alias code" />
            </label>
            <button type="submit">Add / update</button>
          </form>
          </details>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.compactTable}`}>
              <thead>
                <tr>
                  <th>Code system</th>
                  <th>Code</th>
                  <th>Part PN</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.aliases.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No aliases found.</td>
                  </tr>
                ) : (
                  props.aliases.map((alias) => (
                    <tr key={`${alias.codeSystem}:${alias.code}`}>
                      <td>{alias.codeSystem}</td>
                      <td>{alias.code}</td>
                      <td>{resolvePn(partById, alias.partId)}</td>
                      <td className={styles.compatDescription}>{partById.get(alias.partId)?.description || "Description unavailable"}</td>
                      <td>
                        <form action={props.deleteAliasAction} className={styles.inlineAction}>
                          <input type="hidden" name="codeSystem" value={alias.codeSystem} />
                          <input type="hidden" name="code" value={alias.code} />
                          <ConfirmSubmitButton
                            type="submit"
                            className={styles.dangerActionButton}
                            confirmMessage={`Delete alias ${alias.codeSystem}/${alias.code}?`}
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
