"use client";

import { use } from "react";
import { Gate } from "@/components/gate";
import { OntologySection } from "@/components/workspace-sections";

export default function OntologyPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <Gate><OntologySection workspaceId={workspaceId} /></Gate>;
}
