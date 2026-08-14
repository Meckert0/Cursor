import Link from "next/link";
import { getLibraryComponent } from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { formatPartFieldDisplayValue, getPartFieldsForCategory } from "@/lib/part-fields";
import styles from "./page.module.css";

export default async function LibraryComponentDetailPage({
  params
}: {
  params: Promise<{ componentId: string }>;
}) {
  await requireSignedInUser();
  const { componentId } = await params;
  const component = await getLibraryComponent(componentId);
  const attributeFields = getPartFieldsForCategory(component.category).filter((field) => !field.isIdentity);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>{component.partNumber}</h1>
          <p>{component.description}</p>
          <div className={styles.meta}>
            <span>{component.category}</span>
            <span>{component.family}</span>
            <span>{component.stockStatus}</span>
            <span>{component.isActive ? "active" : "inactive"}</span>
          </div>
          <Link href="/library">Back to library</Link>
        </header>

        <section className={styles.card}>
          <h2>Attributes</h2>
          {attributeFields.length === 0 ? (
            <p>No attributes for this category.</p>
          ) : (
            <ul>
              {attributeFields.map((field) => (
                <li key={field.key}>
                  <strong>{field.label}:</strong>{" "}
                  {formatPartFieldDisplayValue(component.attributes?.[field.key])}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
