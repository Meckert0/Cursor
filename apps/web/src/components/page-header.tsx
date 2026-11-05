import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/api";
import styles from "./page-header.module.css";

export async function PageHeader({ children, className }: { children: ReactNode; className?: string }) {
  const auth = await getCurrentUser().catch(() => null);

  return (
    <header className={className}>
      <div className={styles.layout}>
        <div className={styles.content}>{children}</div>
        {auth?.user.accountRole === "admin" ? (
          <Link href="/admin" className={styles.adminLink}>
            Admin console
          </Link>
        ) : null}
      </div>
    </header>
  );
}
