"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Frame } from "@/components/frame";
import { ErrorNotice, PageIntro, recipes } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messageOf } from "@/lib/format";
import { canAdmin, type Role, type Workspace, type WorkspacePatch } from "@/lib/model";
import { notifyWorkspacesChanged } from "@/lib/events";
import { useRegistry } from "@/lib/registry";
import { useBusy } from "@/lib/use-busy";
import { MAX_STALE_DAYS, validateWorkspace, workspaceErrorMessage } from "@/lib/workspace";

export function WorkspaceSettings({ workspaceId }: { workspaceId: string }) {
  const { api, session } = useRegistry();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [days, setDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, run] = useBusy();

  function fill(row: Workspace) {
    setWorkspace(row);
    setName(row.name);
    setSlug(row.slug);
    setDays(String(row.stale_process_kind_days));
  }

  useEffect(() => {
    let stop = false;
    Promise.all([api.workspaces(), session ? api.membership(workspaceId, session.id) : Promise.resolve(null)])
      .then(([rows, member]) => {
        if (stop) return;
        const row = rows.find((item) => item.id === workspaceId);
        if (!row) setError("This workspace was not found, or you no longer belong to it.");
        else fill(row);
        setRole(member?.role ?? null);
      })
      .catch((err) => { if (!stop) setError(messageOf(err)); });
    return () => { stop = true; };
  }, [api, workspaceId, session]);

  const errors = validateWorkspace({ name, slug, days: Number(days) });
  const changed: WorkspacePatch = {};
  if (workspace) {
    if (name.trim() !== workspace.name) changed.name = name.trim();
    if (slug.trim() !== workspace.slug) changed.slug = slug.trim();
    if (Number(days) !== workspace.stale_process_kind_days) changed.staleProcessKindDays = Number(days);
  }
  const dirty = Object.keys(changed).length > 0;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    if (!dirty) return;
    await run(async () => {
      try {
        const saved = await api.updateWorkspace(workspaceId, changed);
        fill(saved);
        setShowErrors(false);
        notifyWorkspacesChanged();
        toast.success("Settings saved");
      } catch (err) {
        toast.error(workspaceErrorMessage(err));
      }
    });
  }

  const backHref = `/w/${workspaceId}`;
  if (error) {
    return (
      <Frame title="Settings" backHref={backHref}>
        <ErrorNotice>{error}</ErrorNotice>
      </Frame>
    );
  }
  if (workspace && role && !canAdmin(role)) {
    return (
      <Frame title="Settings" backHref={backHref}>
        <PageIntro>Only owners and admins can change workspace settings.</PageIntro>
      </Frame>
    );
  }

  const fieldError = (key: "name" | "slug" | "days") =>
    showErrors && errors[key] ? <p className="px-2 text-xs text-destructive" role="alert">{errors[key]}</p> : null;

  return (
    <Frame title="Settings" backHref={backHref}>
      <PageIntro>How this workspace is named and when a process kind counts as stale on the overview.</PageIntro>
      {/* noValidate: our own messages, under each field, replace the browser's bubbles. */}
      <form noValidate className={recipes.join("grid max-w-lg gap-3", recipes.panel.md)} onSubmit={save}>
        <Label htmlFor="ws-name">Name</Label>
        <Input id="ws-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={(showErrors && Boolean(errors.name)) || undefined} className={recipes.field.md} />
        {fieldError("name")}
        <Label htmlFor="ws-slug">Slug</Label>
        <Input id="ws-slug" value={slug} onChange={(event) => setSlug(event.target.value)} aria-invalid={(showErrors && Boolean(errors.slug)) || undefined} className={recipes.join(recipes.field.md, "font-mono")} />
        {fieldError("slug")}
        <Label htmlFor="ws-days">Process kind review, in days</Label>
        <Input id="ws-days" type="number" inputMode="numeric" min={1} max={MAX_STALE_DAYS} step={1} value={days} onChange={(event) => setDays(event.target.value)} aria-invalid={(showErrors && Boolean(errors.days)) || undefined} className={recipes.field.md} />
        <p className="px-2 text-xs text-muted-foreground">Active process kinds not updated for this long are flagged as stale.</p>
        {fieldError("days")}
        <Button type="submit" disabled={busy || !workspace || !dirty} className={recipes.join("mt-2", recipes.pill.md)}>{busy ? "Saving…" : "Save settings"}</Button>
      </form>
    </Frame>
  );
}
