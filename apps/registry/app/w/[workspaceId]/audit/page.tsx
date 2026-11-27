"use client";

import { use } from "react";
import { Gate } from "@/components/gate";
import { AuditSection } from "@/components/workspace-sections";

export default function AuditPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <Gate><AuditSection workspaceId={workspaceId} /></Gate>;
}
