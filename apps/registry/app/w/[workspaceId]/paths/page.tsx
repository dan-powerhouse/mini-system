"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PathReport } from "@/components/entity-view";
import { Gate } from "@/components/gate";

function Report({ workspaceId }: { workspaceId: string }) {
  const params = useSearchParams();
  const start = params.get("start") ?? "";
  if (!start) return <p className="p-8 text-sm text-muted-foreground">Open a record and choose Ordered path report.</p>;
  return <PathReport workspaceId={workspaceId} startId={start} />;
}

export default function PathsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return (
    <Gate>
      <Suspense>
        <Report workspaceId={workspaceId} />
      </Suspense>
    </Gate>
  );
}
