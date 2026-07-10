import { redirect } from "next/navigation";

export default async function DesignCanvasPage({
  params
}: {
  params: Promise<{ designId: string }>;
}) {
  const { designId } = await params;
  redirect(`/harnesses/${designId}/canvas`);
}
