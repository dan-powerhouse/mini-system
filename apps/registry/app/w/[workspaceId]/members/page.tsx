"use client";

import { use } from "react";
import { Gate } from "@/components/gate";
import { MembersSection } from "@/components/workspace-sections";

export default function MembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <Gate><MembersSection workspaceId={workspaceId} /></Gate>;
}
