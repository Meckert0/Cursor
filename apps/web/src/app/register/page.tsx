import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, registerUser } from "@/lib/api";
import styles from "./page.module.css";

async function registerAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();
  if (!username || !email || !password) {
    redirect("/register?error=Username,%20email,%20and%20password%20are%20required.");
  }
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
    redirect("/register?error=Username%20must%20be%203-64%20characters%20and%20only%20include%20letters,%20numbers,%20'.',%20'_',%20or%20'-'.");
  }
  if (password !== confirmPassword) {
    redirect("/register?error=Passwords%20do%20not%20match.");
  }
  let result: Awaited<ReturnType<typeof registerUser>>;
  try {
    result = await registerUser({ username, email, password });
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "Registration%20failed.";
    redirect(`/register?error=${message}`);
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

export default async function RegisterPage({
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
          <h1>Create account</h1>
          <p>Register a user account to keep your project data between sessions.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <form action={registerAction} className={styles.form}>
            <label>
              Username
              <input name="username" type="text" required minLength={3} maxLength={64} autoComplete="username" />
            </label>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label>
              Confirm password
              <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <button type="submit">Create account</button>
          </form>
          <p>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
