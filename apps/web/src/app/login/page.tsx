import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, loginUser } from "@/lib/api";
import styles from "./page.module.css";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20are%20required.");
  }
  let result: Awaited<ReturnType<typeof loginUser>>;
  try {
    result = await loginUser({ email, password });
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "Login%20failed.";
    redirect(`/login?error=${message}`);
  }

  const cookieStore = await cookies();
  cookieStore.set("cdt_session", result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(result.expiresAt),
    path: "/"
  });
  redirect("/");
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const { error } = await searchParams;
  const currentUser = await getCurrentUser().catch(() => null);
  if (currentUser?.user) {
    redirect("/");
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1>Sign in</h1>
          <p>Sign in to load your projects and harness data.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <form action={loginAction} className={styles.form}>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <button type="submit">Sign in</button>
          </form>
          <p>
            Need an account? <Link href="/register">Register</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
