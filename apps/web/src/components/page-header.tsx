import type { ReactNode } from "react";
import Link from "next/link";
import { getPageHeaderCopy, type AuthUserDto, type PageKey } from "@/lib/api";
import { DEFAULT_PAGE_HEADERS } from "../../../../src/domain/ui-settings";
import { EditablePageHeader } from "./editable-page-header";
import { savePageHeaderAction } from "./page-header-actions";
import styles from "./page-header.module.css";

export async function PageHeader({ children, className, user, pageKey, values }: {
  children?: ReactNode;
  className?: string;
  user?: AuthUserDto | null;
  pageKey: PageKey;
  values?: Record<string, string | number>;
}) {
  const copy = await getPageHeaderCopy(pageKey).catch(() => DEFAULT_PAGE_HEADERS[pageKey]);
  return (
    <header className={className}>
      <div className={styles.layout}>
        <div className={styles.content}>
          <EditablePageHeader pageKey={pageKey} copy={copy} values={values} canEdit={user?.accountRole === "admin"} saveAction={savePageHeaderAction} />
          {children}
        </div>
        {user?.accountRole === "admin" ? (
          <Link href="/admin" className={styles.adminLink}>
            Admin console
          </Link>
        ) : null}
      </div>
    </header>
  );
}
