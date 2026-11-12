"use server";

import { revalidatePath } from "next/cache";
import { updatePageHeaderCopy, type PageKey, type PageHeaderCopy } from "@/lib/api";
import { requireAdminUser } from "@/lib/auth";
import { PAGE_KEYS } from "../../../../src/domain/ui-settings";

export async function savePageHeaderAction(pageKey: PageKey, copy: Partial<PageHeaderCopy>) {
  await requireAdminUser();
  if (!PAGE_KEYS.includes(pageKey)) return { ok: false as const, error: "Unknown page header." };
  try {
    const saved = await updatePageHeaderCopy(pageKey, copy);
    revalidatePath("/", "layout");
    return { ok: true as const, copy: saved };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The page header could not be saved. Please try again." };
  }
}
