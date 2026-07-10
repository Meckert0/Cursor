import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createHarness,
  deleteHarness,
  getPageDescriptions,
  listProjectHarnesses,
  listProjects,
  updateHarness,
  updateProject
} from "@/lib/api";
import { requireSignedInUser } from "@/lib/auth";
import { HarnessReorderList } from "./harness-reorder-list";
import { ProjectDescriptionField } from "./project-description-field";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function createHarnessAction(projectId: string, formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Harness name is required.");
  }

  const harness = await createHarness({ projectId, name });
  redirect(`/harnesses/${harness.id}/canvas`);
}

async function deleteHarnessAction(projectId: string, formData: FormData) {
  "use server";

  const harnessId = String(formData.get("harnessId") ?? "").trim();
  const harnessName = String(formData.get("harnessName") ?? "").trim();
  const confirmationName = String(formData.get("confirmHarnessName") ?? "").trim();
  if (!harnessId || !harnessName) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent("Invalid harness delete request.")}`);
  }
  if (confirmationName !== harnessName) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent(`Type "${harnessName}" to confirm deletion.`)}`);
  }

  await deleteHarness(harnessId);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

async function renameHarnessAction(projectId: string, formData: FormData) {
  "use server";

  const harnessId = String(formData.get("harnessId") ?? "").trim();
  const currentName = String(formData.get("currentHarnessName") ?? "").trim();
  const nextName = String(formData.get("nextHarnessName") ?? "").trim();
  if (!harnessId || !nextName) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent("Harness rename requires an id and name.")}`);
  }
  if (currentName === nextName) {
    redirect(`/projects/${projectId}`);
  }

  await updateHarness({
    harnessId,
    name: nextName
  });
  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/harnesses/${harnessId}`);
  revalidatePath(`/harnesses/${harnessId}/canvas`);
  redirect(`/projects/${projectId}`);
}

async function saveProjectDescriptionAction(projectId: string, description: string) {
  "use server";

  await updateProject({
    projectId,
    description
  });
  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
}

export default async function ProjectPage({
  params,
  searchParams
}: {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  await requireSignedInUser();
  const { projectId } = await params;
  const { error } = await searchParams;
  const harnessesPromise = listProjectHarnesses(projectId);
  const projectsPromise = listProjects();
  const pageDescriptionsPromise = getPageDescriptions();

  let harnessError: string | undefined;
  let harnesses: Awaited<ReturnType<typeof listProjectHarnesses>> = [];

  try {
    harnesses = await harnessesPromise;
  } catch (error) {
    harnessError = error instanceof Error ? error.message : "Failed to load harnesses.";
  }

  const sortedHarnesses = harnesses.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const projectDescription =
    (await projectsPromise.catch(() => [] as Awaited<ReturnType<typeof listProjects>>)).find((project) => project.id === projectId)
      ?.description ?? "";
  const projectsHeaderDescription = (await pageDescriptionsPromise.catch(() => null))?.projectsHeaderDescription
    ?? "Each harness is a separate cable assembly. Each harness has its own details history.";

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>Project workspace</h1>
          <p>{projectsHeaderDescription}</p>
          <p>Project ID: {projectId}</p>
          <div className={styles.actions}>
            <Link href="/">Back to projects</Link>
          </div>
          <ProjectDescriptionField
            initialDescription={projectDescription}
            saveDescriptionAction={saveProjectDescriptionAction.bind(null, projectId)}
          />
        </div>

        <section className={styles.card}>
          <h2>Harness</h2>
          <details>
            <summary className={styles.ctaSummary}>Create harness</summary>
            <form action={createHarnessAction.bind(null, projectId)} className={styles.form} data-testid="create-harness-form">
              <label>
                Harness name
                <input name="name" required type="text" placeholder="Harness A" />
              </label>
              <button type="submit" data-testid="create-harness-submit">Create harness</button>
            </form>
          </details>
          {error ? <p className={styles.error}>{error}</p> : null}
          {harnessError ? <p className={styles.error}>{harnessError}</p> : null}
          {!harnessError && harnesses.length === 0 ? <p>No harnesses yet.</p> : null}
          {!harnessError && sortedHarnesses.length > 0 ? (
            <HarnessReorderList
              projectId={projectId}
              items={sortedHarnesses.map((harness) => ({
                id: harness.id,
                name: harness.name,
                description: harness.description,
                updatedAt: harness.updatedAt
              }))}
              renameAction={renameHarnessAction.bind(null, projectId)}
              deleteAction={deleteHarnessAction.bind(null, projectId)}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}
