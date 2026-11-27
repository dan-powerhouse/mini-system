"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { Gate } from "@/components/gate";
import { TemplateEditor } from "@/components/template-editor";

function Editor({ workspaceId }: { workspaceId: string }) {
  const params = useSearchParams();
  const kind = params.get("kind") ?? undefined;
  const type = params.get("type") ?? undefined;
  // Keyed so switching from a new template to the saved one starts fresh.
  return <TemplateEditor key={`${kind}/${type}`} workspaceId={workspaceId} kind={kind} type={type} />;
}

export default function TemplatePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return (
    <Gate>
      <Suspense>
        <Editor workspaceId={workspaceId} />
      </Suspense>
    </Gate>
  );
}
