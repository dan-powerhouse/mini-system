"use client";

import { Suspense, use } from "react";
import { Gate } from "@/components/gate";
import { WorkforceSection } from "@/components/workforce";

export default function WorkforcePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  // Suspense: the workforce filter reads the address (useSearchParams).
  return <Gate><Suspense><WorkforceSection workspaceId={workspaceId} /></Suspense></Gate>;
}
