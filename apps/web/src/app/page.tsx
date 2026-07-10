import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createProject,
  deleteProject,
  getCurrentUser,
  getHealth,
  getPageDescriptions,
  listProjectHarnesses,
  listProjects,
  logoutUser,
  updateProject
} from "@/lib/api";
import { ProjectsReorderList } from "./projects-reorder-list";
import styles from "./page.module.css";

async function createProjectAction(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw.length > 0 ? descriptionRaw : undefined;

  if (!name) {
    throw new Error("Project name is required.");
  }

  await createProject({ name, description });
  revalidatePath("/");
}

async function renameProjectAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "").trim();
  const currentName = String(formData.get("currentProjectName") ?? "").trim();
  const nextName = String(formData.get("nextProjectName") ?? "").trim();
  if (!projectId || !nextName) {
    throw new Error("Project name is required.");
  }
  if (currentName === nextName) {
    return;
  }

  await updateProject({ projectId, name: nextName });
  revalidatePath("/");
}

async function deleteProjectAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  await deleteProject(projectId);
  revalidatePath("/");
}

async function logoutAction() {
  "use server";
  await logoutUser();
  const cookieStore = await cookies();
  cookieStore.delete("cdt_session");
  redirect("/login");
}

export default function Home() {
  const healthPromise = getHealth();
  const projectsPromise = listProjects();
  const pageDescriptionsPromise = getPageDescriptions();

  return <HomeView healthPromise={healthPromise} projectsPromise={projectsPromise} pageDescriptionsPromise={pageDescriptionsPromise} />;
}

async function HomeView(input: {
  healthPromise: ReturnType<typeof getHealth>;
  projectsPromise: ReturnType<typeof listProjects>;
  pageDescriptionsPromise: ReturnType<typeof getPageDescriptions>;
}) {
  let currentUser: Awaited<ReturnType<typeof getCurrentUser>>["user"] | null = null;
  let healthStatus = "unreachable";
  let healthService = "unknown";
  let healthTime = "n/a";
  let projectError: string | undefined;
  let projects: Awaited<ReturnType<typeof listProjects>> = [];
  let projectsHeaderDescription = "Projects are collections of cable designs. They can be used to keep cable designs separate.";

  try {
    const health = await input.healthPromise;
    healthStatus = health.ok ? "ok" : "error";
    healthService = health.service;
    healthTime = new Date(health.now).toLocaleString();
  } catch {
    healthStatus = "error";
  }

  try {
    const auth = await getCurrentUser();
    currentUser = auth.user;
  } catch {
    redirect("/login");
  }

  try {
    projects = await input.projectsPromise;
  } catch (error) {
    projectError = error instanceof Error ? error.message : "Unknown project load failure.";
  }
  try {
    const pageDescriptions = await input.pageDescriptionsPromise;
    projectsHeaderDescription = pageDescriptions.projectsHeaderDescription;
  } catch {
    // keep default fallback copy
  }
  const harnessCountByProjectId = new Map<string, number>();
  if (!projectError && projects.length > 0) {
    await Promise.all(
      projects.map(async (project) => {
        try {
          const harnesses = await listProjectHarnesses(project.id);
          harnessCountByProjectId.set(project.id, harnesses.length);
        } catch {
          harnessCountByProjectId.set(project.id, 0);
        }
      })
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>Cable Design Tool Frontend (MVP)</h1>
          <p>{projectsHeaderDescription}</p>
          <div className={styles.headerActions}>
            <form action={logoutAction}>
              <button type="submit" className={styles.inlineSummary}>Log out</button>
            </form>
            {currentUser?.accountRole === "admin" ? (
              <Link href="/admin" className={styles.inlineSummary}>
                Admin console
              </Link>
            ) : null}
          </div>
        </div>

        <section className={`${styles.card} ${styles.projectsCard}`}>
          <h2>Projects</h2>
          <details>
            <summary className={styles.ctaSummary}>Create project</summary>
            <form action={createProjectAction} className={styles.form} data-testid="create-project-form">
              <label>
                Name
                <input name="name" type="text" required placeholder="Project name" />
              </label>
              <label>
                Description
                <textarea name="description" rows={3} placeholder="Optional description" />
              </label>
              <button type="submit" data-testid="create-project-submit">Create</button>
            </form>
          </details>
          {projectError ? <p className={styles.error}>{projectError}</p> : null}
          {!projectError && projects.length === 0 ? <p>No projects yet.</p> : null}
          {!projectError && projects.length > 0 ? (
            <ProjectsReorderList
              items={projects.map((project) => ({
                id: project.id,
                name: project.name,
                description: project.description,
                harnessCount: harnessCountByProjectId.get(project.id) ?? 0
              }))}
              renameAction={renameProjectAction}
              deleteAction={deleteProjectAction}
            />
          ) : null}
        </section>

        <section className={`${styles.card} ${styles.mutedCard} ${styles.healthCard}`}>
          <h2>Backend health</h2>
          <p>
            status: <strong>{healthStatus}</strong>
          </p>
          <p>service: {healthService}</p>
          <p>timestamp: {healthTime}</p>
        </section>
      </main>
    </div>
  );
}
