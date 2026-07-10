import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  LIBRARY_ITEM_CATEGORIES,
  type LibraryItemCategory,
  createLibraryFieldDefinition,
  deleteAdminUser,
  deleteLibraryComponent,
  deleteLibraryFieldDefinition,
  ingestLibraryComponents,
  getPageDescriptions,
  listAdminProjectOverview,
  listAdminUsers,
  listLibraryComponents,
  listLibraryFieldDefinitions,
  updateAdminPageDescriptions,
  updateLibraryFieldDefinition,
  updateLibraryComponent
} from "@/lib/api";
import { requireAdminUser } from "@/lib/auth";
import { ItemDatabaseViewer } from "./item-database-viewer";
import styles from "./page.module.css";

type AdminPageSearchParams = Promise<{
  q?: string;
  category?: LibraryItemCategory;
  family?: string;
  awg?: string;
  color?: string;
}>;

async function editItemAction(formData: FormData) {
  "use server";
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

  const componentId = String(formData.get("componentId") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const partNumber = String(formData.get("partNumber") ?? "").trim();
  const family = String(formData.get("family") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const awgRaw = String(formData.get("awg") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const isActiveRaw = String(formData.get("isActive") ?? "").trim();
  const stockStatusRaw = String(formData.get("stockStatus") ?? "").trim();
  const compatibilityHintsRaw = String(formData.get("compatibilityHints") ?? "").trim();
  const createdByUserId = String(formData.get("createdByUserId") ?? "").trim();
  const createdAtRaw = String(formData.get("createdAt") ?? "").trim();
  const isReviewedRaw = String(formData.get("isReviewed") ?? "").trim();
  const reviewedByUserIdRaw = String(formData.get("reviewedByUserId") ?? "").trim();
  const reviewedAtRaw = String(formData.get("reviewedAt") ?? "").trim();
  const lastEditedByUserId = String(formData.get("lastEditedByUserId") ?? "").trim();
  const lastEditedAtRaw = String(formData.get("lastEditedAt") ?? "").trim();
  const customFieldValues = Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => key.startsWith("customField:"))
      .map(([key, value]) => [key.replace("customField:", ""), String(value)])
  );
  if (!componentId) {
    throw new Error("Invalid edit payload.");
  }
  const isActive = isActiveRaw === "false" ? false : true;
  const stockStatus = ["in_stock", "low_stock", "out_of_stock"].includes(stockStatusRaw)
    ? (stockStatusRaw as "in_stock" | "low_stock" | "out_of_stock")
    : "in_stock";
  const wantsReviewed = isReviewedRaw === "true";
  const isReviewed = wantsReviewed;
  const reviewedByUserId = wantsReviewed ? reviewedByUserIdRaw || process.env.API_USER_ID || "system-user" : undefined;
  const reviewedAt = wantsReviewed ? parseOptionalDateTime(reviewedAtRaw) ?? new Date().toISOString() : undefined;
  const createdBy = createdByUserId || process.env.API_USER_ID || "system-user";
  const createdAt = parseOptionalDateTime(createdAtRaw) ?? new Date().toISOString();
  const lastEditedBy = lastEditedByUserId || process.env.API_USER_ID || "system-user";
  const lastEditedAt = parseOptionalDateTime(lastEditedAtRaw) ?? new Date().toISOString();

  await updateLibraryComponent({
    componentId,
    partNumber: normalizeRequiredIngestText(partNumber),
    family: normalizeRequiredIngestText(family),
    description: normalizeRequiredIngestText(description),
    awg: category === "wire" ? normalizeRequiredIngestText(awgRaw) : undefined,
    color: category === "wire" ? normalizeRequiredIngestText(colorRaw) : undefined,
    isActive,
    stockStatus,
    compatibilityHints: compatibilityHintsRaw
      .split(",")
      .map((hint) => hint.trim())
      .filter((hint) => hint.length > 0),
    createdByUserId: createdBy,
    createdAt,
    isReviewed,
    reviewedByUserId,
    reviewedAt,
    lastEditedByUserId: lastEditedBy,
    lastEditedAt,
    customFieldValues
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

async function createFieldDefinitionAction(formData: FormData) {
  "use server";
  const category = String(formData.get("category") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const isVisibleInViewerRaw = String(formData.get("isVisibleInViewer") ?? "true").trim();
  const showOnAddFormRaw = String(formData.get("showOnAddForm") ?? "false").trim();
  const showInSearchRaw = String(formData.get("showInSearch") ?? "false").trim();
  if (!LIBRARY_ITEM_CATEGORIES.includes(category as LibraryItemCategory)) {
    throw new Error("Invalid field category.");
  }
  if (!key || !label) {
    throw new Error("Field key and label are required.");
  }
  const created = await createLibraryFieldDefinition({
    category: category as LibraryItemCategory,
    key,
    label,
    isVisibleInViewer: isVisibleInViewerRaw !== "false",
    showOnAddForm: showOnAddFormRaw === "true",
    showInSearch: showInSearchRaw === "true"
  });
  revalidatePath("/admin");
  return created;
}

async function createItemAction(formData: FormData) {
  "use server";

  await requireAdminUser();

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

  const category = String(formData.get("category") ?? "").trim();
  const partNumber = String(formData.get("partNumber") ?? "").trim();
  const family = String(formData.get("family") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const awgRaw = String(formData.get("awg") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const isActiveRaw = String(formData.get("isActive") ?? "true").trim();
  const stockStatusRaw = String(formData.get("stockStatus") ?? "").trim();
  const compatibilityHintsRaw = String(formData.get("compatibilityHints") ?? "").trim();
  const isReviewedRaw = String(formData.get("isReviewed") ?? "false").trim();
  const reviewedByUserIdRaw = String(formData.get("reviewedByUserId") ?? "").trim();
  const reviewedAtRaw = String(formData.get("reviewedAt") ?? "").trim();
  const customFieldValues = Object.fromEntries(
    Array.from(formData.entries())
      .filter(([key]) => key.startsWith("customField:"))
      .map(([key, value]) => [key.replace("customField:", ""), String(value).trim()])
      .filter(([, value]) => value.length > 0)
  );

  if (!LIBRARY_ITEM_CATEGORIES.includes(category as LibraryItemCategory)) {
    throw new Error("Invalid create payload.");
  }
  const isActive = isActiveRaw === "false" ? false : true;
  const stockStatus = ["in_stock", "low_stock", "out_of_stock"].includes(stockStatusRaw)
    ? (stockStatusRaw as "in_stock" | "low_stock" | "out_of_stock")
    : "in_stock";
  const wantsReviewed = isReviewedRaw === "true";
  const isReviewed = wantsReviewed;
  const reviewedByUserId = wantsReviewed ? reviewedByUserIdRaw || process.env.API_USER_ID || "system-user" : undefined;
  const reviewedAt = wantsReviewed ? parseOptionalDateTime(reviewedAtRaw) ?? new Date().toISOString() : undefined;

  await ingestLibraryComponents({
    items: [
      {
        category: category as LibraryItemCategory,
        partNumber: normalizeRequiredIngestText(partNumber),
        family: normalizeRequiredIngestText(family),
        description: normalizeRequiredIngestText(description),
        awg: category === "wire" ? normalizeRequiredIngestText(awgRaw) : undefined,
        color: category === "wire" ? normalizeRequiredIngestText(colorRaw) : undefined,
        isActive,
        stockStatus,
        compatibilityHints: compatibilityHintsRaw
          .split(",")
          .map((hint) => hint.trim())
          .filter((hint) => hint.length > 0),
        isReviewed,
        reviewedByUserId,
        reviewedAt,
        customFieldValues
      }
    ]
  });

  revalidatePath("/admin");
}

async function updateFieldDefinitionAction(formData: FormData) {
  "use server";
  const fieldDefinitionId = String(formData.get("fieldDefinitionId") ?? "").trim();
  const labelRaw = String(formData.get("label") ?? "").trim();
  const isVisibleInViewerRaw = formData.get("isVisibleInViewer");
  const showOnAddFormRaw = formData.get("showOnAddForm");
  const showInSearchRaw = formData.get("showInSearch");
  if (!fieldDefinitionId) {
    throw new Error("Field definition id is required.");
  }
  const updated = await updateLibraryFieldDefinition({
    fieldDefinitionId,
    label: labelRaw || undefined,
    isVisibleInViewer:
      typeof isVisibleInViewerRaw === "string" ? isVisibleInViewerRaw === "true" : undefined,
    showOnAddForm: typeof showOnAddFormRaw === "string" ? showOnAddFormRaw === "true" : undefined,
    showInSearch: typeof showInSearchRaw === "string" ? showInSearchRaw === "true" : undefined
  });
  revalidatePath("/admin");
  return updated;
}

async function deleteFieldDefinitionAction(formData: FormData) {
  "use server";
  const fieldDefinitionId = String(formData.get("fieldDefinitionId") ?? "").trim();
  if (!fieldDefinitionId) {
    throw new Error("Field definition id is required.");
  }
  await deleteLibraryFieldDefinition(fieldDefinitionId);
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

export default async function AdminOverviewPage({ searchParams }: { searchParams: AdminPageSearchParams }) {
  const signedInUser = await requireAdminUser();
  const { q, category, family, awg, color } = await searchParams;
  const [users, projects, items, pageDescriptions] = await Promise.all([
    listAdminUsers(),
    listAdminProjectOverview(),
    listLibraryComponents({
      q,
      category,
      family,
      awg,
      color
    }),
    getPageDescriptions()
  ]);
  const [
    contactFieldDefinitions,
    wireFieldDefinitions,
    sleeveTubeBraidFieldDefinitions,
    labelFieldDefinitions,
    backshellFieldDefinitions,
    strainReliefFieldDefinitions,
    moduleFieldDefinitions,
    spliceFieldDefinitions
  ] = await Promise.all([
    listLibraryFieldDefinitions("contact"),
    listLibraryFieldDefinitions("wire"),
    listLibraryFieldDefinitions("sleeve-tube-braid"),
    listLibraryFieldDefinitions("label"),
    listLibraryFieldDefinitions("backshell"),
    listLibraryFieldDefinitions("strain-relief"),
    listLibraryFieldDefinitions("module"),
    listLibraryFieldDefinitions("splice")
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
    splice: "Splice"
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
              createFieldDefinitionAction={createFieldDefinitionAction}
              updateFieldDefinitionAction={updateFieldDefinitionAction}
              deleteFieldDefinitionAction={deleteFieldDefinitionAction}
              currentUserId={signedInUser.id}
              fieldDefinitionsByCategory={{
                contact: contactFieldDefinitions,
                wire: wireFieldDefinitions,
                "sleeve-tube-braid": sleeveTubeBraidFieldDefinitions,
                label: labelFieldDefinitions,
                backshell: backshellFieldDefinitions,
                "strain-relief": strainReliefFieldDefinitions,
                module: moduleFieldDefinitions,
                splice: spliceFieldDefinitions
              }}
            />
          </details>
        </section>
      </main>
    </div>
  );
}
