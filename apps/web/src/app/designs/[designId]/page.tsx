import { redirect } from "next/navigation";
export default async function DesignPage({
  params
}: {
  params: Promise<{
    designId: string;
  }>;
}) {
  const { designId } = await params;
  redirect(`/harnesses/${designId}`);
}
