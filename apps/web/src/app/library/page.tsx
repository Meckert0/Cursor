import Link from "next/link";
import { LIBRARY_ITEM_CATEGORIES, listLibraryComponents } from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import styles from "./page.module.css";

export default async function LibraryPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    family?: string;
    isActive?: string;
    stockStatus?: string;
  }>;
}) {
  await requireSignedInUser();
  const query = await searchParams;
  const category = LIBRARY_ITEM_CATEGORIES.find((itemCategory) => itemCategory === query.category);
  const stockStatus =
    query.stockStatus === "in_stock" || query.stockStatus === "low_stock" || query.stockStatus === "out_of_stock"
      ? query.stockStatus
      : undefined;
  const isActive = query.isActive === "true" ? true : query.isActive === "false" ? false : undefined;
  const components = await listLibraryComponents({
    q: query.q,
    category,
    family: query.family,
    isActive,
    stockStatus
  });

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>Library catalog</h1>
          <p>Search and filter all item categories.</p>
          <Link href="/">Back to projects</Link>
        </div>

        <section className={styles.card}>
          <h2>Filters</h2>
          <form method="GET" className={styles.filters}>
            <input name="q" type="search" placeholder="Part number or description" defaultValue={query.q ?? ""} />
            <select name="category" defaultValue={query.category ?? ""}>
              <option value="">All categories</option>
              {LIBRARY_ITEM_CATEGORIES.map((itemCategory) => (
                <option key={itemCategory} value={itemCategory}>
                  {itemCategory}
                </option>
              ))}
            </select>
            <input name="family" type="text" placeholder="Family (e.g. Micro-D)" defaultValue={query.family ?? ""} />
            <select name="isActive" defaultValue={query.isActive ?? ""}>
              <option value="">Active + inactive</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
            <select name="stockStatus" defaultValue={query.stockStatus ?? ""}>
              <option value="">Any stock status</option>
              <option value="in_stock">in_stock</option>
              <option value="low_stock">low_stock</option>
              <option value="out_of_stock">out_of_stock</option>
            </select>
            <button type="submit">Apply</button>
          </form>
        </section>

        <section className={styles.card}>
          <h2>Components</h2>
          {components.length === 0 ? <p>No components match current filters.</p> : null}
          {components.length > 0 ? (
            <ul className={styles.list}>
              {components.map((component) => (
                <li key={component.id}>
                  <strong>
                    <Link href={`/library/${component.id}`}>{component.partNumber}</Link>
                  </strong>
                  <span>
                    {component.category} - {component.family} - {component.stockStatus} -{" "}
                    {component.isActive ? "active" : "inactive"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  );
}
