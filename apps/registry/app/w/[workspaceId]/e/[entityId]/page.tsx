"use client";

import { use } from "react";
import { EntityView } from "@/components/entity-view";
import { Gate } from "@/components/gate";

export default function EntityPage({ params }: { params: Promise<{ workspaceId: string; entityId: string }> }) {
  const { workspaceId, entityId } = use(params);
  return <Gate><EntityView key={`${workspaceId}/${entityId}`} workspaceId={workspaceId} entityId={entityId} /></Gate>;
}
