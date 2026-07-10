import { redirect } from "next/navigation";
import { requireSignedInUser } from "@/lib/auth";

export default async function RevisionPage({
  params,
  searchParams
}: {
  params: Promise<{
    revisionId: string;
  }>;
  searchParams: Promise<{
    validationRunId?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  await requireSignedInUser();
  const { revisionId } = await params;
  const query = new URLSearchParams();
  const resolvedSearchParams = await searchParams;
  if (resolvedSearchParams.validationRunId) {
    query.set("validationRunId", resolvedSearchParams.validationRunId);
  }
  if (resolvedSearchParams.notice) {
    query.set("notice", resolvedSearchParams.notice);
  }
  if (resolvedSearchParams.error) {
    query.set("error", resolvedSearchParams.error);
  }
  redirect(`/details/${revisionId}${query.size > 0 ? `?${query.toString()}` : ""}`);
}
