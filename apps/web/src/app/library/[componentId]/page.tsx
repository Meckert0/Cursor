import Link from "next/link";
import { getLibraryComponent } from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import styles from "./page.module.css";

export default async function LibraryComponentDetailPage({
  params
}: {
  params: Promise<{ componentId: string }>;
}) {
  await requireSignedInUser();
  const { componentId } = await params;
  const component = await getLibraryComponent(componentId);

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
          <h2>Compatibility hints</h2>
          {component.compatibilityHints.length === 0 ? (
            <p>No compatibility hints available.</p>
          ) : (
            <ul>
              {component.compatibilityHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
