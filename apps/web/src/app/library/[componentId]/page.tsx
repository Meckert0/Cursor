import Image from "next/image";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { getLibraryComponent, listLibraryComponentMedia, listPartRelationships } from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { formatPartFieldDisplayValue, getPartFieldsForCategory } from "@/lib/part-fields";
import styles from "./page.module.css";

export default async function LibraryComponentDetailPage({
  params
}: {
  params: Promise<{ componentId: string }>;
}) {
  const signedInUser = await requireSignedInUser();
  const { componentId } = await params;
  const [component, media, relationships] = await Promise.all([getLibraryComponent(componentId), listLibraryComponentMedia(componentId), listPartRelationships({ parentPartId: componentId })]);
  const attributeFields = getPartFieldsForCategory(component.category).filter((field) => !field.isIdentity);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <PageHeader className={styles.header} user={signedInUser} pageKey="libraryItem" values={{ partNumber: component.partNumber, partDescription: component.description }}>
          <div className={styles.meta}>
            <span>{component.category}</span>
            <span>{component.family}</span>
            <span>{component.stockStatus}</span>
            <span>{component.isActive ? "active" : "inactive"}</span>
          </div>
          <Link href="/library">Back to library</Link>
        </PageHeader>

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
        <section className={styles.card}>
          <h2>Compatibility</h2>
          {relationships.length ? <ul>{relationships.map(row => <li key={row.id}>
            <strong>{row.relationshipType}:</strong> {row.compatibleParts.join(", ") || "Specification profile"} · {row.status}
            {row.parentPositions.length ? ` · Positions ${row.parentPositions.join(", ")}` : ""}
            {row.source ? ` · Source: ${row.source}` : ""}
            {row.unresolvedParts?.length ? ` · Needs review: ${row.unresolvedParts.join(", ")}` : ""}
          </li>)}</ul> : <p>No compatibility relationships recorded.</p>}
        </section>
        <section className={styles.card}>
          <h2>Images and Files</h2>
          {media.length ? media.map(file => <figure key={file.id}>
            {file.mimeType?.startsWith("image/") || /\.(png|jpe?g|webp)(?:\?|$)/i.test(file.url)
              ? <Image unoptimized src={file.url} alt={file.altText ?? file.caption ?? `${component.partNumber} ${file.viewType}`} width={320} height={240} style={{ objectFit: "contain", maxWidth: "100%" }} />
              : null}
            <figcaption><a href={file.url} target="_blank" rel="noreferrer">{file.caption ?? file.viewType}</a>
              {file.orientation ? ` · ${file.orientation}` : ""}{file.source ? ` · ${file.source}` : ""}{file.revision ? ` · ${file.revision}` : ""}
            </figcaption>
          </figure>) : <p>No images or files linked yet.</p>}
        </section>
      </main>
    </div>
  );
}
