"use client";

import { useMemo, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import type {
  CompatStatus,
  ContactWireCompatDto,
  LibraryItemCategory,
  ModuleBackshellCompatDto,
  ModuleContactCompatDto,
  ModuleStrainReliefCompatDto,
  PartAliasDto,
  PartDto
} from "@/lib/api";
import styles from "./page.module.css";

type CompatKind = "contact-wire" | "module-contact" | "module-backshell" | "module-strain-relief" | "aliases";

const COMPAT_STATUS_OPTIONS: CompatStatus[] = ["allowed", "forbidden", "review"];

const CODE_SYSTEM_SUGGESTIONS = [
  "contact_3digit",
  "wire_3digit",
  "pc_designer_contact",
  "pc_designer_wire"
] as const;

const TABS: Array<{ id: CompatKind; label: string }> = [
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

function PartSelect({
  name,
  parts,
  label
}: {
  name: string;
  parts: PartDto[];
  label: string;
}) {
  return (
    <label>
      {label}
      <select name={name} required defaultValue="">
        <option value="" disabled>
          Select…
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
  rightKey
}: {
  leftHeader: string;
  rightHeader: string;
  rows: Array<{ leftId: string; rightId: string; leftPn: string; rightPn: string; status: CompatStatus }>;
  deleteAction: (formData: FormData) => void | Promise<void>;
  leftKey: string;
  rightKey: string;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.compactTable}`}>
        <thead>
          <tr>
            <th>{leftHeader}</th>
            <th>{rightHeader}</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4}>No pairs yet.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.leftId}:${row.rightId}`}>
                <td>{row.leftPn}</td>
                <td>{row.rightPn}</td>
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
  const [tab, setTab] = useState<CompatKind>("contact-wire");

  const partById = useMemo(() => {
    const map = new Map<string, PartDto>();
    for (const item of props.items) {
      map.set(item.id, item);
    }
    return map;
  }, [props.items]);

  const resolvePn = (partId: string) => partById.get(partId)?.partNumber ?? partId;

  const contacts = useMemo(() => partsByCategory(props.items, "contact"), [props.items]);
  const wires = useMemo(() => partsByCategory(props.items, "wire"), [props.items]);
  const modules = useMemo(() => partsByCategory(props.items, "module"), [props.items]);
  const backshells = useMemo(() => partsByCategory(props.items, "backshell"), [props.items]);
  const strainReliefs = useMemo(() => partsByCategory(props.items, "strain-relief"), [props.items]);

  const contactWireRows = useMemo(
    () =>
      props.contactWire.map((row) => ({
        leftId: row.contactPartId,
        rightId: row.wirePartId,
        leftPn: resolvePn(row.contactPartId),
        rightPn: resolvePn(row.wirePartId),
        status: row.status
      })),
    [props.contactWire, partById]
  );

  const moduleContactRows = useMemo(
    () =>
      props.moduleContact.map((row) => ({
        leftId: row.modulePartId,
        rightId: row.contactPartId,
        leftPn: resolvePn(row.modulePartId),
        rightPn: resolvePn(row.contactPartId),
        status: row.status
      })),
    [props.moduleContact, partById]
  );

  const moduleBackshellRows = useMemo(
    () =>
      props.moduleBackshell.map((row) => ({
        leftId: row.modulePartId,
        rightId: row.backshellPartId,
        leftPn: resolvePn(row.modulePartId),
        rightPn: resolvePn(row.backshellPartId),
        status: row.status
      })),
    [props.moduleBackshell, partById]
  );

  const moduleStrainReliefRows = useMemo(
    () =>
      props.moduleStrainRelief.map((row) => ({
        leftId: row.modulePartId,
        rightId: row.strainReliefPartId,
        leftPn: resolvePn(row.modulePartId),
        rightPn: resolvePn(row.strainReliefPartId),
        status: row.status
      })),
    [props.moduleStrainRelief, partById]
  );

  return (
    <div className={styles.sectionContent}>
      <div className={styles.compatTabs} role="tablist" aria-label="Compatibility tables">
        {TABS.map((entry) => (
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
          <form action={props.upsertContactWireAction} className={styles.compatAddForm}>
            <PartSelect name="contactPartId" parts={contacts} label="Contact" />
            <PartSelect name="wirePartId" parts={wires} label="Wire" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          <CompatPairTable
            leftHeader="Contact PN"
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
          <form action={props.upsertModuleContactAction} className={styles.compatAddForm}>
            <PartSelect name="modulePartId" parts={modules} label="Module" />
            <PartSelect name="contactPartId" parts={contacts} label="Contact" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          <CompatPairTable
            leftHeader="Module PN"
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
          <form action={props.upsertModuleBackshellAction} className={styles.compatAddForm}>
            <PartSelect name="modulePartId" parts={modules} label="Module" />
            <PartSelect name="backshellPartId" parts={backshells} label="Backshell" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          <CompatPairTable
            leftHeader="Module PN"
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
          <form action={props.upsertModuleStrainReliefAction} className={styles.compatAddForm}>
            <PartSelect name="modulePartId" parts={modules} label="Module" />
            <PartSelect name="strainReliefPartId" parts={strainReliefs} label="Strain relief" />
            <StatusSelect />
            <button type="submit">Add / update</button>
          </form>
          <CompatPairTable
            leftHeader="Module PN"
            rightHeader="Strain-relief PN"
            rows={moduleStrainReliefRows}
            deleteAction={props.deleteModuleStrainReliefAction}
            leftKey="modulePartId"
            rightKey="strainReliefPartId"
          />
        </div>
      ) : null}

      {tab === "aliases" ? (
        <div className={styles.compatPanel}>
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
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.compactTable}`}>
              <thead>
                <tr>
                  <th>Code system</th>
                  <th>Code</th>
                  <th>Part PN</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.aliases.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No aliases yet.</td>
                  </tr>
                ) : (
                  props.aliases.map((alias) => (
                    <tr key={`${alias.codeSystem}:${alias.code}`}>
                      <td>{alias.codeSystem}</td>
                      <td>{alias.code}</td>
                      <td>{resolvePn(alias.partId)}</td>
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
