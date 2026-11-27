"use client";

import { use } from "react";
import { Gate } from "@/components/gate";
import { ExchangeSection } from "@/components/workspace-sections";

export default function ExchangePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return <Gate><ExchangeSection workspaceId={workspaceId} /></Gate>;
}
