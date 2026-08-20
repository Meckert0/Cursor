import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  LIBRARY_ITEM_CATEGORIES,
  type CompatStatus,
  type LibraryItemCategory,
  deleteAdminUser,
  deleteContactWireCompat,
  deleteLibraryComponent,
  deleteModuleBackshellCompat,
  deleteModuleContactCompat,
  deleteModuleStrainReliefCompat,
  deletePartAlias,
  deletePartRelationship,
  ingestLibraryComponents,
  getPageDescriptions,
  listAdminProjectOverview,
  listAdminUsers,
  listContactWireCompat,
  listLibraryComponents,
  listModuleBackshellCompat,
  listModuleContactCompat,
  listModuleStrainReliefCompat,
  listPartAliases,
  listPartRelationships,
  updateAdminPageDescriptions,
  updateLibraryComponent,
  upsertContactWireCompat,
  upsertModuleBackshellCompat,
  upsertModuleContactCompat,
  upsertModuleStrainReliefCompat,
  upsertPartAlias,
  upsertPartRelationship
} from "@/lib/api";
import { requireAdminUser } from "@/lib/auth";
import { collectAttributesFromFormData } from "@/lib/part-fields";
import { CompatibilityManager } from "./compatibility-manager";
import { ItemDatabaseViewer } from "./item-database-viewer";
import styles from "./page.module.css";

const COMPAT_STATUSES: CompatStatus[] = ["allowed", "forbidden", "review"];

function parseCompatStatus(raw: string): CompatStatus {
  if (COMPAT_STATUSES.includes(raw as CompatStatus)) {
    return raw as CompatStatus;
  }
  throw new Error("Invalid compatibility status.");
}

function requireFormField(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    throw new Error(`Missing ${key}.`);
  }
  return value;
}

type AdminPageSearchParams = Promise<{
  q?: string;
  category?: LibraryItemCategory;
  family?: string;
  awg?: string;
  color?: string;
}>;

function parseOptionalDateTime(raw: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function normalizeRequiredIngestText(raw: string): string {
  return raw.length > 0 ? raw : " ";
}

function optionalFormText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function editItemAction(formData: FormData) {
  "use server";

  const componentId = String(formData.get("componentId") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const partNumber = String(formData.get("partNumber") ?? "").trim();
  const family = String(formData.get("family") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActiveRaw = String(formData.get("isActive") ?? "").trim();
  const stockStatusRaw = String(formData.get("stockStatus") ?? "").trim();
  const createdByUserId = String(formData.get("createdByUserId") ?? "").trim();
  const createdAtRaw = String(formData.get("createdAt") ?? "").trim();
  const isReviewedRaw = String(formData.get("isReviewed") ?? "").trim();
  const reviewedByUserIdRaw = String(formData.get("reviewedByUserId") ?? "").trim();
  const reviewedAtRaw = String(formData.get("reviewedAt") ?? "").trim();
  const lastEditedByUserId = String(formData.get("lastEditedByUserId") ?? "").trim();
  const lastEditedAtRaw = String(formData.get("lastEditedAt") ?? "").trim();
  if (!componentId || !LIBRARY_ITEM_CATEGORIES.includes(categoryRaw as LibraryItemCategory)) {
    throw new Error("Invalid edit payload.");
  }
  const category = categoryRaw as LibraryItemCategory;
  const isActive = isActiveRaw === "false" ? false : true;
  const stockStatus = ["in_stock", "low_stock", "out_of_stock", "unknown"].includes(stockStatusRaw)
    ? (stockStatusRaw as "in_stock" | "low_stock" | "out_of_stock" | "unknown")
    : "in_stock";
  const wantsReviewed = isReviewedRaw === "true";
  const isReviewed = wantsReviewed;
  const reviewedByUserId = wantsReviewed ? reviewedByUserIdRaw || process.env.API_USER_ID || "system-user" : undefined;
  const reviewedAt = wantsReviewed ? parseOptionalDateTime(reviewedAtRaw) ?? new Date().toISOString() : undefined;
  const createdBy = createdByUserId || process.env.API_USER_ID || "system-user";
  const createdAt = parseOptionalDateTime(createdAtRaw) ?? new Date().toISOString();
  const lastEditedBy = lastEditedByUserId || process.env.API_USER_ID || "system-user";
  const lastEditedAt = parseOptionalDateTime(lastEditedAtRaw) ?? new Date().toISOString();
  const attributes = collectAttributesFromFormData(formData, category);

  await updateLibraryComponent({
    componentId,
    partNumber: normalizeRequiredIngestText(partNumber),
    family: normalizeRequiredIngestText(family),
    description: normalizeRequiredIngestText(description),
    isActive,
    stockStatus,
    createdByUserId: createdBy,
    createdAt,
    isReviewed,
    reviewedByUserId,
    reviewedAt,
    lastEditedByUserId: lastEditedBy,
    lastEditedAt,
    partType: optionalFormText(formData, "partType"),
    side: optionalFormText(formData, "side"),
    notes: optionalFormText(formData, "notes"),
    electricalMode: optionalFormText(formData, "electricalMode"),
    attributes
  });
  revalidatePath("/admin");
}

async function deleteItemAction(formData: FormData) {
  "use server";
  const componentId = String(formData.get("componentId") ?? "").trim();
  if (!componentId) {
    throw new Error("Invalid delete payload.");
  }
  await deleteLibraryComponent(componentId);
  revalidatePath("/admin");
}

async function createItemAction(formData: FormData) {
  "use server";

  await requireAdminUser();

  const categoryRaw = String(formData.get("category") ?? "").trim();
  const partNumber = String(formData.get("partNumber") ?? "").trim();
  const family = String(formData.get("family") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActiveRaw = String(formData.get("isActive") ?? "true").trim();
  const stockStatusRaw = String(formData.get("stockStatus") ?? "").trim();
  const isReviewedRaw = String(formData.get("isReviewed") ?? "false").trim();
  const reviewedByUserIdRaw = String(formData.get("reviewedByUserId") ?? "").trim();
  const reviewedAtRaw = String(formData.get("reviewedAt") ?? "").trim();

  if (!LIBRARY_ITEM_CATEGORIES.includes(categoryRaw as LibraryItemCategory)) {
    throw new Error("Invalid create payload.");
  }
  const category = categoryRaw as LibraryItemCategory;
  const isActive = isActiveRaw === "false" ? false : true;
  const stockStatus = ["in_stock", "low_stock", "out_of_stock", "unknown"].includes(stockStatusRaw)
    ? (stockStatusRaw as "in_stock" | "low_stock" | "out_of_stock" | "unknown")
    : "in_stock";
  const wantsReviewed = isReviewedRaw === "true";
  const isReviewed = wantsReviewed;
  const reviewedByUserId = wantsReviewed ? reviewedByUserIdRaw || process.env.API_USER_ID || "system-user" : undefined;
  const reviewedAt = wantsReviewed ? parseOptionalDateTime(reviewedAtRaw) ?? new Date().toISOString() : undefined;
  const attributes = collectAttributesFromFormData(formData, category);

  await ingestLibraryComponents({
    items: [
      {
        category,
        partNumber: normalizeRequiredIngestText(partNumber),
        family: normalizeRequiredIngestText(family),
        description: normalizeRequiredIngestText(description),
        isActive,
        stockStatus,
        isReviewed,
        reviewedByUserId,
        reviewedAt,
        partType: optionalFormText(formData, "partType") || undefined,
        side: optionalFormText(formData, "side") || undefined,
        notes: optionalFormText(formData, "notes") || undefined,
        electricalMode: optionalFormText(formData, "electricalMode") || undefined,
        attributes
      }
    ]
  });

  revalidatePath("/admin");
}

async function updatePageDescriptionsAction(formData: FormData) {
  "use server";
  const projectsHeaderDescription = String(formData.get("projectsHeaderDescription") ?? "").trim();
  const harnessHeaderDescription = String(formData.get("harnessHeaderDescription") ?? "").trim();
  if (!projectsHeaderDescription || !harnessHeaderDescription) {
    throw new Error("Both description fields are required.");
  }
  await updateAdminPageDescriptions({
    projectsHeaderDescription,
    harnessHeaderDescription
  });
  revalidatePath("/admin");
  revalidatePath("/");
}

async function deleteUserAction(formData: FormData) {
  "use server";
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    throw new Error("User id is required.");
  }
  await deleteAdminUser(userId);
  revalidatePath("/admin");
  revalidatePath("/");
}

async function upsertContactWireAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await upsertContactWireCompat({
    contactPartId: requireFormField(formData, "contactPartId"),
    wirePartId: requireFormField(formData, "wirePartId"),
    status: parseCompatStatus(requireFormField(formData, "status"))
  });
  revalidatePath("/admin");
}

async function deleteContactWireAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await deleteContactWireCompat({
    contactPartId: requireFormField(formData, "contactPartId"),
    wirePartId: requireFormField(formData, "wirePartId")
  });
  revalidatePath("/admin");
}

async function upsertModuleContactAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await upsertModuleContactCompat({
    modulePartId: requireFormField(formData, "modulePartId"),
    contactPartId: requireFormField(formData, "contactPartId"),
    status: parseCompatStatus(requireFormField(formData, "status"))
  });
  revalidatePath("/admin");
}

async function deleteModuleContactAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await deleteModuleContactCompat({
    modulePartId: requireFormField(formData, "modulePartId"),
    contactPartId: requireFormField(formData, "contactPartId")
  });
  revalidatePath("/admin");
}

async function upsertModuleBackshellAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await upsertModuleBackshellCompat({
    modulePartId: requireFormField(formData, "modulePartId"),
    backshellPartId: requireFormField(formData, "backshellPartId"),
    status: parseCompatStatus(requireFormField(formData, "status"))
  });
  revalidatePath("/admin");
}

async function deleteModuleBackshellAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await deleteModuleBackshellCompat({
    modulePartId: requireFormField(formData, "modulePartId"),
    backshellPartId: requireFormField(formData, "backshellPartId")
  });
  revalidatePath("/admin");
}

async function upsertModuleStrainReliefAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await upsertModuleStrainReliefCompat({
    modulePartId: requireFormField(formData, "modulePartId"),
    strainReliefPartId: requireFormField(formData, "strainReliefPartId"),
    status: parseCompatStatus(requireFormField(formData, "status"))
  });
  revalidatePath("/admin");
}

async function deleteModuleStrainReliefAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await deleteModuleStrainReliefCompat({
    modulePartId: requireFormField(formData, "modulePartId"),
    strainReliefPartId: requireFormField(formData, "strainReliefPartId")
  });
  revalidatePath("/admin");
}

async function upsertAliasAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await upsertPartAlias({
    partId: requireFormField(formData, "partId"),
    codeSystem: requireFormField(formData, "codeSystem"),
    code: requireFormField(formData, "code")
  });
  revalidatePath("/admin");
}

async function deleteAliasAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await deletePartAlias({
    codeSystem: requireFormField(formData, "codeSystem"),
    code: requireFormField(formData, "code")
  });
  revalidatePath("/admin");
}

function parseParentPositions(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function upsertRelationshipAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const compatibleParts = optionalFormText(formData, "compatibleParts");
  await upsertPartRelationship({
    parentPartId: requireFormField(formData, "parentPartId"),
    compatibleParts: compatibleParts || undefined,
    relationshipType: requireFormField(formData, "relationshipType"),
    positionType: optionalFormText(formData, "positionType") || undefined,
    parentPositions: parseParentPositions(String(formData.get("parentPositions") ?? "")),
    status: parseCompatStatus(requireFormField(formData, "status")),
    sourceStatus: optionalFormText(formData, "sourceStatus") || undefined,
    notes: optionalFormText(formData, "notes") || undefined
  });
  revalidatePath("/admin");
}

async function deleteRelationshipAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  await deletePartRelationship({
    id: requireFormField(formData, "id")
  });
  revalidatePath("/admin");
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: AdminPageSearchParams }) {
  const signedInUser = await requireAdminUser();
  const { q, category, family, awg, color } = await searchParams;
  const [users, projects, items, pageDescriptions, contactWire, moduleContact, moduleBackshell, moduleStrainRelief, aliases, relationships] =
    await Promise.all([
      listAdminUsers(),
      listAdminProjectOverview(),
      listLibraryComponents({
        q,
        category,
        family,
        awg,
        color
      }),
      getPageDescriptions(),
      listContactWireCompat(),
      listModuleContactCompat(),
      listModuleBackshellCompat(),
      listModuleStrainReliefCompat(),
      listPartAliases(),
      listPartRelationships()
    ]);

  const projectsByUserId = new Map<
    string,
    Array<{
      project: (typeof projects)[number];
      memberRole: "viewer" | "editor" | "owner" | "supplier_reviewer";
    }>
  >();
  for (const project of projects) {
    for (const member of project.members) {
      const entries = projectsByUserId.get(member.userId) ?? [];
      entries.push({
        project,
        memberRole: member.role
      });
      projectsByUserId.set(member.userId, entries);
    }
  }

  const categoryOrder = LIBRARY_ITEM_CATEGORIES;
  const categoryLabel: Record<(typeof categoryOrder)[number], string> = {
    contact: "Contact",
    wire: "Wire",
    "sleeve-tube-braid": "Sleeve/Tube/Braid",
    label: "Label",
    backshell: "Backshell",
    "strain-relief": "Strain-Relief",
    module: "Module",
    splice: "Splice",
    frame: "Frame"
  };
  const visibleCategories = category ? [category] : categoryOrder;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Admin console</h1>
          <p>Full visibility across users, projects, harness canvases, and library inventory.</p>
          <div className={styles.actionButtons}>
            <Link href="/" className={styles.actionButton}>
              Back to home
            </Link>
            <Link href="/library" className={styles.actionButton}>
              Browse library catalog
            </Link>
            <Link href="/admin/datastores" className={styles.actionButton}>
              Datastore queue
            </Link>
          </div>
        </header>

        <section className={`${styles.card} ${styles.sectionPanel}`}>
          <details>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionTitle}>Section 0: Global Page Descriptions</span>
              <span className={styles.sectionHint}>admin editable copy - expand panel</span>
            </summary>
            <div className={styles.sectionContent}>
              <form action={updatePageDescriptionsAction} className={styles.pageDescriptionForm}>
                <label>
                  Projects page header description
                  <textarea
                    name="projectsHeaderDescription"
                    rows={3}
                    defaultValue={pageDescriptions.projectsHeaderDescription}
                    required
                  />
                </label>
                <label>
                  Harness page header description
                  <textarea
                    name="harnessHeaderDescription"
                    rows={3}
                    defaultValue={pageDescriptions.harnessHeaderDescription}
                    required
                  />
                </label>
                <button type="submit">Save descriptions</button>
              </form>
            </div>
          </details>
        </section>

        <section className={`${styles.card} ${styles.sectionPanel}`}>
          <details>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionTitle}>Section 1: Users, Projects, and Canvas Access</span>
              <span className={styles.sectionHint}>{users.length} users - expand panel</span>
            </summary>
            <div className={styles.sectionContent}>
              <h3>Users (expand to view projects)</h3>
              {users.length === 0 ? <p>No users found.</p> : null}
              {users.length > 0 ? (
                <div className={styles.userDropdownList}>
                  {users.map((user) => {
                    const userProjects = projectsByUserId.get(user.id) ?? [];
                    return (
                      <details key={user.id} className={styles.userDropdown}>
                        <summary className={styles.userSummary}>
                          <span>
                            <strong>{user.email}</strong> ({user.id})
                          </span>
                          <span className={styles.userSummaryMeta}>
                            <span className={styles.projectMeta}>{user.accountRole}</span>
                          </span>
                        </summary>
                        <div className={styles.userDropdownContent}>
                          <form action={deleteUserAction} className={styles.inlineAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <ConfirmSubmitButton
                              type="submit"
                              className={styles.dangerActionButton}
                              confirmMessage={`Delete user "${user.email}" and all owned projects/harnesses?`}
                              disabled={user.accountRole === "admin"}
                            >
                              Delete user
                            </ConfirmSubmitButton>
                          </form>
                          {userProjects.length === 0 ? <p className={styles.projectMeta}>No project memberships.</p> : null}
                          {userProjects.length > 0 ? (
                            <ul className={styles.projectList}>
                              {userProjects.map(({ project, memberRole }) => (
                                <li key={`${user.id}:${project.id}`} className={styles.projectItem}>
                                  <div className={styles.projectHeading}>
                                    <div>
                                      <strong>{project.name}</strong> <span className={styles.projectMeta}>({project.id})</span>
                                    </div>
                                    <Link href={`/projects/${project.id}`}>Open project</Link>
                                  </div>
                                  <p className={styles.projectMeta}>
                                    Membership role: {memberRole} | Harnesses: {project.harnesses.length}
                                  </p>
                                  <div className={styles.canvasLinks}>
                                    {project.harnesses.length === 0 ? (
                                      <span className={styles.projectMeta}>No harnesses yet.</span>
                                    ) : (
                                      project.harnesses.map((harness) => (
                                        <Link key={harness.id} href={`/harnesses/${harness.id}/canvas`}>
                                          Open canvas: {harness.name}
                                        </Link>
                                      ))
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </details>
        </section>

        <section className={`${styles.card} ${styles.sectionPanel}`}>
          <details>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionTitle}>Section 2: Item Database Viewer</span>
              <span className={styles.sectionHint}>{items.length} items - expand panel</span>
            </summary>
            <ItemDatabaseViewer
              items={items}
              visibleCategories={visibleCategories}
              categoryLabel={categoryLabel}
              q={q}
              category={category}
              family={family}
              awg={awg}
              color={color}
              createAction={createItemAction}
              editAction={editItemAction}
              deleteAction={deleteItemAction}
              currentUserId={signedInUser.id}
            />
          </details>
        </section>

        <section className={`${styles.card} ${styles.sectionPanel}`}>
          <details>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionTitle}>Section 3: Compatibility &amp; Aliases</span>
              <span className={styles.sectionHint}>
                {contactWire.length +
                  moduleContact.length +
                  moduleBackshell.length +
                  moduleStrainRelief.length +
                  aliases.length +
                  relationships.length}{" "}
                rows - expand panel
              </span>
            </summary>
            <CompatibilityManager
              items={items}
              contactWire={contactWire}
              moduleContact={moduleContact}
              moduleBackshell={moduleBackshell}
              moduleStrainRelief={moduleStrainRelief}
              aliases={aliases}
              relationships={relationships}
              upsertContactWireAction={upsertContactWireAction}
              deleteContactWireAction={deleteContactWireAction}
              upsertModuleContactAction={upsertModuleContactAction}
              deleteModuleContactAction={deleteModuleContactAction}
              upsertModuleBackshellAction={upsertModuleBackshellAction}
              deleteModuleBackshellAction={deleteModuleBackshellAction}
              upsertModuleStrainReliefAction={upsertModuleStrainReliefAction}
              deleteModuleStrainReliefAction={deleteModuleStrainReliefAction}
              upsertAliasAction={upsertAliasAction}
              deleteAliasAction={deleteAliasAction}
              upsertRelationshipAction={upsertRelationshipAction}
              deleteRelationshipAction={deleteRelationshipAction}
            />
          </details>
        </section>
      </main>
    </div>
  );
}
