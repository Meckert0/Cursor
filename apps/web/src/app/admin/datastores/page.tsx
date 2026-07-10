import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  LIBRARY_ITEM_CATEGORIES,
  type LibraryItemCategory,
  archiveLibraryComponent,
  listLibraryReviewQueue,
  reviewLibraryComponent,
  toActionableApiErrorMessage
} from "@/lib/api";
import { requireAdminUser } from "@/lib/auth";
import styles from "./page.module.css";

async function reviewComponentAction(formData: FormData) {
  "use server";
  const componentId = String(formData.get("componentId") ?? "").trim();
  if (!componentId) {
    redirect("/admin/datastores?error=Missing+component+id.");
  }

  const notice = "Component reviewed.";
  try {
    await reviewLibraryComponent({ componentId });
    revalidatePath("/admin/datastores");
  } catch (error) {
    const message = toActionableApiErrorMessage(error instanceof Error ? error.message : "Review failed.", {
      "Component not found.": "Component not found. It may already be archived or removed.",
      "Insufficient role for this operation.": "Review requires owner role."
    });
    redirect(`/admin/datastores?error=${encodeURIComponent(message)}`);
  }
  redirect(`/admin/datastores?notice=${encodeURIComponent(notice)}`);
}

async function archiveComponentAction(formData: FormData) {
  "use server";
  const componentId = String(formData.get("componentId") ?? "").trim();
  if (!componentId) {
    redirect("/admin/datastores?error=Missing+component+id.");
  }
  const notice = "Component archived.";
  try {
    await archiveLibraryComponent(componentId);
    revalidatePath("/admin/datastores");
  } catch (error) {
    const message = toActionableApiErrorMessage(error instanceof Error ? error.message : "Archive failed.", {
      "Component not found.": "Component not found. It may already be archived or removed.",
      "Insufficient role for this operation.": "Archive requires owner role."
    });
    redirect(`/admin/datastores?error=${encodeURIComponent(message)}`);
  }
  redirect(`/admin/datastores?notice=${encodeURIComponent(notice)}`);
}

async function bulkReviewComponentsAction(formData: FormData) {
  "use server";
  const componentIds = formData
    .getAll("selectedComponentId")
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
  if (componentIds.length === 0) {
    redirect("/admin/datastores?error=Select+at+least+one+entry+for+bulk+review.");
  }
  const notice = `Reviewed ${componentIds.length} entries.`;
  try {
    await Promise.all(componentIds.map((componentId) => reviewLibraryComponent({ componentId })));
    revalidatePath("/admin/datastores");
  } catch (error) {
    const message = toActionableApiErrorMessage(error instanceof Error ? error.message : "Bulk review failed.", {
      "Insufficient role for this operation.": "Bulk review requires owner role."
    });
    redirect(`/admin/datastores?error=${encodeURIComponent(message)}`);
  }
  redirect(`/admin/datastores?notice=${encodeURIComponent(notice)}`);
}

export default async function AdminDatastoresPage({
  searchParams
}: {
  searchParams: Promise<{
    category?: LibraryItemCategory;
    family?: string;
    enteredByUserId?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  await requireAdminUser();
  const { category, family, enteredByUserId, notice, error } = await searchParams;
  const queue = await listLibraryReviewQueue({
    category,
    family,
    enteredByUserId
  });

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Datastore Admin Console (Phase 7)</h1>
          <p>Review queue for unreviewed library entries. Reviewed entries become globally visible.</p>
          <p>
            <Link href="/">Back to home</Link>
          </p>
          {notice ? <p className={styles.notice}>{notice}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </header>

        <section className={styles.card}>
          <h2>Queue filters</h2>
          <form className={styles.filters} method="GET">
            <label>
              Category
              <select name="category" defaultValue={category ?? ""}>
                <option value="">All</option>
                {LIBRARY_ITEM_CATEGORIES.map((itemCategory) => (
                  <option key={itemCategory} value={itemCategory}>
                    {itemCategory}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Family
              <input name="family" type="text" placeholder="e.g. Micro-D" defaultValue={family ?? ""} />
            </label>
            <label>
              Entered by user
              <input name="enteredByUserId" type="text" placeholder="author-a" defaultValue={enteredByUserId ?? ""} />
            </label>
            <button type="submit">Apply filters</button>
          </form>
        </section>

        <section className={styles.card}>
          <h2>Unreviewed entries</h2>
          {queue.length === 0 ? <p>No pending entries for current filters.</p> : null}
          {queue.length > 0 ? (
            <form action={bulkReviewComponentsAction}>
              <div className={styles.bulkActions}>
                <button type="submit">Bulk approve selected</button>
              </div>
              <ul className={styles.queueList}>
                {queue.map((item) => (
                  <li key={item.id} className={styles.queueItem}>
                    <label className={styles.selectRow}>
                      <input type="checkbox" name="selectedComponentId" value={item.id} />
                      <span>Select for bulk approve</span>
                    </label>
                    <div>
                      <strong>{item.partNumber}</strong> ({item.category}) - {item.family}
                    </div>
                    <div className={styles.meta}>
                      entered by <code>{item.enteredByUserId}</code> at {new Date(item.enteredAt).toLocaleString()}
                    </div>
                    <p>{item.description}</p>
                    <div className={styles.itemActions}>
                      <button type="submit" formAction={reviewComponentAction} name="componentId" value={item.id}>
                        Approve (review)
                      </button>
                      <button
                        type="submit"
                        formAction={archiveComponentAction}
                        name="componentId"
                        value={item.id}
                        className={styles.archiveButton}
                      >
                        Reject (archive)
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </form>
          ) : null}
        </section>
      </main>
    </div>
  );
}
