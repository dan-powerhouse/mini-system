import { Gate } from "@/components/gate";
import { WorkspaceOverview } from "@/components/workspace-overview";

export default async function WorkspaceOverviewPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <Gate><WorkspaceOverview key={workspaceId} workspaceId={workspaceId} /></Gate>;
}
