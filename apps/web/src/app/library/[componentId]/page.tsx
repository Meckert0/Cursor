import Image from "next/image";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { getLibraryComponent, listLibraryComponents, listLibraryComponentMedia, listPartRelationships } from "@/lib/api";
import { moduleAccessoryStatus, STRAIN_RELIEF_RELATIONSHIP_TYPES } from "../../../../../../src/domain/module-accessory-compatibility";
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
  const [component, media, allRelationships] = await Promise.all([getLibraryComponent(componentId), listLibraryComponentMedia(componentId), listPartRelationships()]);
  const attributeFields = getPartFieldsForCategory(component.category).filter((field) => !field.isIdentity);
  const fitCategory = component.category === "module" ? "strain-relief" : component.category === "strain-relief" ? "module" : undefined;
  const fitParts = fitCategory ? await listLibraryComponents({ category: fitCategory, isActive: true }) : [];
  const byParent = new Map<string, typeof allRelationships>();
  for (const row of allRelationships) {
    const existing = byParent.get(row.parentPartId);
    if (existing) existing.push(row);
    else byParent.set(row.parentPartId, [row]);
  }
  const ownedRelationships = byParent.get(component.id) ?? [];
  const allowedFitParts = fitParts.filter(part => moduleAccessoryStatus(
    component.category === "module" ? component : part,
    component.category === "module" ? part : component,
    [...ownedRelationships, ...(byParent.get(part.id) ?? [])]
  ) === "allowed").sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  const fitIds = new Set(fitParts.map(part => part.id));
  const fitNumbers = new Set(fitParts.map(part => part.partNumber.trim().toUpperCase()));
  const fitLabel = component.category === "module" ? "Compatible strain reliefs" : "Compatible modules";
  // Fit pairs are shown once above the remaining directional relationships.
  // The original source groups are retained for editing in the admin console.
  const relationships = ownedRelationships.flatMap(row => {
    if (!fitCategory || !STRAIN_RELIEF_RELATIONSHIP_TYPES.some(type => type === row.relationshipType.trim().toUpperCase())) return [row];
    const kept = row.compatibleParts.map((_, index) => index).filter(index => row.targetPartIds
      ? !fitIds.has(row.targetPartIds[index]) : !fitNumbers.has(row.compatibleParts[index].trim().toUpperCase()));
    if (!kept.length && row.compatibleParts.length && !row.unresolvedParts?.length) return [];
    return [{ ...row, compatibleParts: kept.map(index => row.compatibleParts[index]),
      targetPartIds: row.targetPartIds ? kept.map(index => row.targetPartIds![index]) : undefined }];
  });

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
          {fitCategory ? <>
            <h3>{fitLabel}</h3>
            {allowedFitParts.length ? <ul aria-label={fitLabel}>
              {allowedFitParts.map(part => <li key={part.id}>
                <Link href={`/library/${part.id}`}>{part.partNumber}</Link>{part.description ? ` — ${part.description}` : ""}
              </li>)}
            </ul> : <p>No {fitLabel.toLowerCase()} recorded.</p>}
          </> : null}
          {relationships.length ? <ul>{relationships.map(row => <li key={row.id}>
            <strong>{row.relationshipType}:</strong> {row.compatibleParts.join(", ") || "Specification profile"} · {row.status}
            {row.parentPositions.length ? ` · Positions ${row.parentPositions.join(", ")}` : ""}
            {row.source ? ` · Source: ${row.source}` : ""}
            {row.unresolvedParts?.length ? ` · Needs review: ${row.unresolvedParts.join(", ")}` : ""}
          </li>)}</ul> : !fitCategory ? <p>No compatibility relationships recorded.</p> : null}
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
