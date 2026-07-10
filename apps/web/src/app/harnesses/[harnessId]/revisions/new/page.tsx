import { redirect } from "next/navigation";
import { requireSignedInUser } from "@/lib/auth";

export default async function NewHarnessRevisionPage({
  params,
  searchParams
}: {
  params: Promise<{
    harnessId: string;
  }>;
  searchParams: Promise<{
    error?: string;
    notice?: string;
  }>;
}) {
  await requireSignedInUser();
  const { harnessId } = await params;
  const query = new URLSearchParams();
  const resolvedSearchParams = await searchParams;
  if (resolvedSearchParams.error) {
    query.set("error", resolvedSearchParams.error);
  }
  if (resolvedSearchParams.notice) {
    query.set("notice", resolvedSearchParams.notice);
  }
  redirect(`/harnesses/${harnessId}/details/new${query.size > 0 ? `?${query.toString()}` : ""}`);
}
