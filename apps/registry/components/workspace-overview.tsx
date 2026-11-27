"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Frame } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { ErrorNotice, Panel, PanelSkeleton, recipes } from "@/components/kit";
import { messageOf } from "@/lib/format";
import type { Role, SavedView } from "@/lib/model";
import { useRegistry } from "@/lib/registry";
import { sectionsFor } from "@/lib/sections";
import { registryHref } from "@/lib/workspace-links";

type Overview =
  | { status: "ready"; role: Role; views: SavedView[] }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export function WorkspaceOverview({ workspaceId }: { workspaceId: string }) {
  const { api, session } = useRegistry();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = session?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function load(memberId: string) {
      try {
        const member = await api.membership(workspaceId, memberId);
        if (!active) return;
        if (!member) {
          setOverview({ status: "unavailable" });
          return;
        }
        const views = await api.savedViews(workspaceId);
        if (active) setOverview({ status: "ready", role: member.role, views });
      } catch (error) {
        if (active) setOverview({ status: "error", message: messageOf(error) });
      }
    }
    void load(userId);
    return () => { active = false; };
  }, [api, workspaceId, userId, attempt]);

  return (
    <Frame backHref="/" workspaceRole={overview?.status === "ready" ? overview.role : undefined}>
      <div className="grid gap-4">
        {!overview && <PanelSkeleton label="Loading workspace" />}
        {overview?.status === "unavailable" && <ErrorNotice role="alert">This workspace is unavailable.</ErrorNotice>}
        {overview?.status === "error" && (
          <Panel>
            <ErrorNotice role="alert">{overview.message}</ErrorNotice>
            <Button variant="secondary" onClick={() => { setOverview(null); setAttempt((current) => current + 1); }}>Retry</Button>
          </Panel>
        )}
        {overview?.status === "ready" && (
          <>
            <section className={recipes.panel.raised} aria-labelledby="registry-title">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <FolderOpen className="size-5 text-primary" aria-hidden="true" />
                  <h2 id="registry-title" className="text-xl font-semibold tracking-tight">Registry</h2>
                </div>
                <Link href={registryHref(workspaceId)} className={recipes.join(recipes.cta.inline, recipes.pill.md, "gap-2")}>
                  Open Registry <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </section>
            <Panel aria-labelledby="saved-views-title">
              <h2 id="saved-views-title" className="font-semibold">Saved views</h2>
              {overview.views.length ? (
                <ul className="mt-3 grid gap-1">
                  {overview.views.map((view) => (
                    <li key={view.id} className="min-w-0">
                      <Link href={registryHref(workspaceId, view.id)} className={recipes.join(recipes.listLink, "gap-3")}>
                        <Bookmark className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 wrap-anywhere">{view.name}</span>
                        <span className="text-xs text-muted-foreground">{view.visibility === "personal" ? "Personal" : "Shared"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-muted-foreground">Views saved in Registry appear here.</p>}
            </Panel>
            <Panel aria-labelledby="workspace-sections-title">
              <h2 id="workspace-sections-title" className="font-semibold">Workspace sections</h2>
              <nav className="mt-3 flex flex-wrap gap-1" aria-labelledby="workspace-sections-title">
                {sectionsFor(overview.role).map((section) => (
                  <Link key={section.path} href={`${registryHref(workspaceId)}/${section.path}`} className={recipes.navLink}>{section.label}</Link>
                ))}
              </nav>
            </Panel>
          </>
        )}
      </div>
    </Frame>
  );
}
