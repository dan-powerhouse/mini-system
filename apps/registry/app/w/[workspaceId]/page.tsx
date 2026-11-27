import { Gate } from "@/components/gate";
import { WorkspaceHome } from "@/components/workspace-home";

export default async function RegistryPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const [{ workspaceId }, { view }] = await Promise.all([params, searchParams]);
  const viewId = typeof view === "string" ? view : undefined;
  return <Gate><WorkspaceHome key={JSON.stringify([workspaceId, viewId])} workspaceId={workspaceId} viewId={viewId} /></Gate>;
}
