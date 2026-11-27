"use client";

import { use } from "react";
import { Gate } from "@/components/gate";
import { WorkspaceSettings } from "@/components/workspace-settings";

export default function SettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <Gate><WorkspaceSettings workspaceId={workspaceId} /></Gate>;
}
