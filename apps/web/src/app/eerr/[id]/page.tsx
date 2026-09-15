import { StructureWorkspace } from "./structure-workspace";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StructureWorkspace key={id} id={id} />;
}
