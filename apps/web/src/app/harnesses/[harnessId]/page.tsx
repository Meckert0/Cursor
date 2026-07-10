import { redirect } from "next/navigation";
import { requireSignedInUser } from "@/lib/auth";

export default async function HarnessPage({
  params
}: {
  params: Promise<{
    harnessId: string;
  }>;
}) {
  await requireSignedInUser();
  const { harnessId } = await params;
  redirect(`/harnesses/${harnessId}/canvas`);
}
