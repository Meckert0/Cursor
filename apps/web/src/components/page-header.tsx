import type { ReactNode } from "react";
import Link from "next/link";
import type { AuthUserDto } from "@/lib/api";
import styles from "./page-header.module.css";

export function PageHeader({ children, className, user }: {
  children: ReactNode;
  className?: string;
  user: AuthUserDto;
}) {
  return (
    <header className={className}>
      <div className={styles.layout}>
        <div className={styles.content}>{children}</div>
        {user.accountRole === "admin" ? (
          <Link href="/admin" className={styles.adminLink}>
            Admin console
          </Link>
        ) : null}
      </div>
    </header>
  );
}
