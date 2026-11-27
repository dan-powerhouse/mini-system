"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useRegistry } from "@/lib/registry";
import type { Workspace } from "@/lib/model";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useBusy } from "@/lib/use-busy";
import { notifyWorkspacesChanged, onWorkspacesChanged } from "@/lib/events";
import { slugify, validateWorkspace, workspaceErrorMessage } from "@/lib/workspace";
import { ErrorNotice, Initial, RowSkeletons, recipes } from "@/components/kit";
import { registryHref, workspaceOverviewHref } from "@/lib/workspace-links";

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" className={recipes.pill.bare} aria-label="Toggle color mode" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}

export function Frame({
  children,
  title,
  backHref,
  workspaceRole,
}: {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  workspaceRole?: string;
}) {
  const pathname = usePathname();
  const { api, session, mode } = useRegistry();
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // The slug follows the name until the user edits it by hand.
  const [slugTouched, setSlugTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const showRail = pathname === "/";
  const workspaceId = pathname.startsWith("/w/") ? pathname.split("/")[2] : undefined;
  const activeWorkspace = workspaces?.find((workspace) => workspace.id === workspaceId);
  const workspaceHref = workspaceId ? workspaceOverviewHref(workspaceId) : null;
  const heading = title ?? (workspaceId && (pathname === workspaceHref || pathname === registryHref(workspaceId)) ? activeWorkspace?.name ?? "Workspace" : undefined);
  const userId = session?.id;
  const [busy, run] = useBusy();

  const formErrors = validateWorkspace({ name, slug, days: 1 });

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (formErrors.name || formErrors.slug) {
      setShowErrors(true);
      return;
    }
    await run(async () => { try {
      const workspace = await api.createWorkspace(name.trim(), slug.trim());
      setWorkspaces((rows) => [workspace, ...(rows ?? []).filter((row) => row.id !== workspace.id)]);
      setWorkspaceError(null);
      notifyWorkspacesChanged();
      setName("");
      setSlug("");
      setSlugTouched(false);
      setShowErrors(false);
      toast.success(`${workspace.name} is ready`);
    } catch (error) {
      toast.error(workspaceErrorMessage(error));
    } });
  }

  useEffect(() => {
    let stop = false;
    let request = 0;
    const reload = () => {
      const current = ++request;
      api.workspaces().then((rows) => {
        if (stop || current !== request) return;
        setWorkspaces(rows);
        setWorkspaceError(null);
      }).catch((error) => {
        if (!stop && current === request) setWorkspaceError(workspaceErrorMessage(error));
      });
    };
    reload();
    // Another screen (settings, creation) changed the list.
    const unsubscribe = onWorkspacesChanged(reload);
    return () => {
      stop = true;
      unsubscribe();
    };
  }, [api, userId]);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl">
      <aside className={`${showRail ? "flex" : "hidden"} w-full flex-col border-border bg-rail md:flex md:w-[320px] md:shrink-0 md:border-r`}>
        <header className="flex items-center justify-between px-5 pt-6 pb-3">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Registry</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">mini system</p>
          </div>
          <ThemeButton />
        </header>
        {mode === "preview" && <p className="mx-5 mb-3 rounded-2xl bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground">Preview · sample records</p>}
        {showRail && <h1 className="sr-only">Workspaces</h1>}
        <nav aria-label="Workspaces" className="app-scroll flex-1 overflow-y-auto px-3 pb-24 md:pb-6">
          {workspaces?.map((workspace) => {
            const href = workspaceOverviewHref(workspace.id);
            const active = workspace.id === workspaceId;
            return (
              <Link key={workspace.id} href={href} aria-current={pathname === href ? "page" : active ? "location" : undefined} className={`mb-1 flex items-center gap-3 rounded-2xl border px-3 py-3 transition-colors ${active ? "bg-raised shadow-raised" : "border-transparent hover:bg-card/70"}`}>
                <Initial label={workspace.name} size="md" />
                <span className="min-w-0">
                  <span className={recipes.row.title}>{workspace.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">/{workspace.slug}</span>
                </span>
              </Link>
            );
          })}
          {!workspaces && !workspaceError && <RowSkeletons count={2} label="Loading workspaces" />}
          {workspaceError && <ErrorNotice>{workspaceError}</ErrorNotice>}
          {workspaces?.length === 0 && !workspaceError && <p className="px-3 py-6 text-sm leading-6 text-muted-foreground">No workspaces yet. Create one and you become its owner.</p>}
          <form noValidate className="mt-3 grid gap-2 px-2" onSubmit={createWorkspace}>
            <Label htmlFor="new-workspace-name">Workspace name</Label>
            <Input
              id="new-workspace-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              placeholder="Workspace name"
              aria-invalid={(showErrors && Boolean(formErrors.name)) || undefined}
              aria-describedby={showErrors && formErrors.name ? "new-workspace-name-error" : undefined}
              className={recipes.field.md}
            />
            {showErrors && formErrors.name && <p id="new-workspace-name-error" className="text-xs text-destructive" role="alert">{formErrors.name}</p>}
            <Label htmlFor="new-workspace-slug">Workspace address</Label>
            <Input
              id="new-workspace-slug"
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(event.target.value !== "");
              }}
              placeholder="slug"
              aria-invalid={(showErrors && Boolean(formErrors.slug)) || undefined}
              aria-describedby={showErrors && formErrors.slug ? "new-workspace-slug-error" : undefined}
              className={recipes.field.md}
            />
            {showErrors && formErrors.slug && <p id="new-workspace-slug-error" className="text-xs text-destructive" role="alert">{formErrors.slug}</p>}
            <Button type="submit" variant="secondary" disabled={busy} className={recipes.pill.md}>{busy ? "Creating…" : "New workspace"}</Button>
          </form>
        </nav>
        <div className="sticky bottom-0 border-t border-border bg-rail/90 px-4 py-3 backdrop-blur md:static">
          <div className="flex items-center justify-between gap-3">
            <Link href="/account" className="min-w-0 truncate text-sm text-muted-foreground">{session?.email}</Link>
            <Link href="/" aria-current={showRail ? "page" : undefined} className="text-sm font-medium text-foreground">Workspaces</Link>
          </div>
        </div>
      </aside>
      <main className={`${showRail ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col`}>
        <header className="flex items-center gap-3 px-4 pt-5 pb-3 md:px-8">
          {backHref && (
            <Link href={backHref} className="grid size-11 shrink-0 place-items-center rounded-full border bg-card shadow-panel hover:bg-raised" aria-label="Back">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0">
            {activeWorkspace && workspaceHref && workspaceHref !== pathname && (
              <Link href={workspaceHref} className="block truncate text-xs font-medium text-muted-foreground hover:text-foreground">{activeWorkspace.name}</Link>
            )}
            {heading && <h1 className="truncate text-lg font-semibold tracking-tight md:text-2xl">{heading}</h1>}
            {workspaceRole && <p aria-label={`Workspace role ${workspaceRole}`} className="mt-0.5 text-xs font-medium text-muted-foreground capitalize">{workspaceRole}</p>}
          </div>
          <div className="ml-auto md:hidden">
            <ThemeButton />
          </div>
        </header>
        <div className="app-scroll flex-1 overflow-y-auto px-4 pb-10 md:px-8">{children}</div>
      </main>
    </div>
  );
}
