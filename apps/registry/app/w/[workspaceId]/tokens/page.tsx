"use client";

import { use } from "react";
import { Gate } from "@/components/gate";
import { TokensSection } from "@/components/workspace-sections";

export default function TokensPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <Gate><TokensSection workspaceId={workspaceId} /></Gate>;
}
