import { redirect } from "next/navigation";

export default async function NewRevisionPage({
  params
}: {
  params: Promise<{
    designId: string;
  }>;
}) {
  const { designId } = await params;
  redirect(`/harnesses/${designId}/details/new`);
}
