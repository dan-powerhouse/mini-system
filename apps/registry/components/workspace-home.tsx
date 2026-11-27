"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Frame } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { messageOf, when } from "@/lib/format";
import { KINDS, STATUSES, canAdmin, canWrite, kindLabel, type Dashboard, type Entity, type Kind, type Member, type SavedView, type SearchQuery, type Status } from "@/lib/model";
import { useRegistry } from "@/lib/registry";
import { EntityEditor } from "@/components/entity-editor";
import { EntityActorPill } from "@/components/actor-pill";
import { useBusy } from "@/lib/use-busy";
import { sectionsFor } from "@/lib/sections";
import { EmptyState, Initial, RowSkeletons, recipes } from "@/components/kit";
import { findWorkspaceView, workspaceOverviewHref } from "@/lib/workspace-links";

export function WorkspaceHome({ workspaceId, viewId }: { workspaceId: string; viewId?: string }) {
  const { api, session } = useRegistry();
  const [member, setMember] = useState<Member | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | "">("");
  const [status, setStatus] = useState<Status>("active");
  const [searchResult, setSearchResult] = useState<{ key: string; items: Entity[]; cursor: string | null; error?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [viewReady, setViewReady] = useState(!viewId);
  const [viewUnavailable, setViewUnavailable] = useState(false);
  const [views, setViews] = useState<SavedView[] | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const searchRequest = useRef(0);
  const nextSearchRequest = useCallback(() => ++searchRequest.current, []);
  const userId = session?.id;
  const term = query.trim();
  const searchKey = JSON.stringify([workspaceId, userId, term, kind, status]);
  const current = searchResult?.key === searchKey ? searchResult : null;
  const items = current?.items ?? [];
  const cursor = current?.cursor;
  const error = current?.error;
  const loading = pending || !current;

  const load = useCallback(async (nextCursor?: string) => {
    const request = nextSearchRequest();
    setPending(true);
    const search: SearchQuery = {
      q: term || undefined,
      kind: kind || undefined,
      status: [status],
      limit: 30,
      cursor: nextCursor || undefined,
      sort: { field: "updatedAt", direction: "desc" },
    };
    try {
      const found = await api.search(workspaceId, search);
      if (request !== searchRequest.current) return;
      setSearchResult((previous) => ({
        key: searchKey,
        items: nextCursor && previous?.key === searchKey ? [...previous.items, ...found.items] : found.items,
        cursor: found.nextCursor,
      }));
    } catch (err) {
      if (request !== searchRequest.current) return;
      setSearchResult((previous) => ({
        key: searchKey,
        items: previous?.key === searchKey ? previous.items : [],
        cursor: previous?.key === searchKey ? previous.cursor : null,
        error: messageOf(err),
      }));
    } finally {
      if (request === searchRequest.current) setPending(false);
    }
  }, [api, workspaceId, searchKey, term, kind, status, nextSearchRequest]);

  useEffect(() => {
    if (!viewReady) return;
    setSearchResult(null);
    const handle = setTimeout(() => void load(), 180);
    return () => {
      clearTimeout(handle);
      nextSearchRequest();
    };
  }, [load, nextSearchRequest, viewReady]);

  const [summaryRevision, setSummaryRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api.dashboard(workspaceId).then((summary) => {
      if (active) setDashboard(summary);
    }).catch((err) => {
      if (active) setContextError(messageOf(err));
    });
    return () => { active = false; };
  }, [api, workspaceId, userId, summaryRevision]);

  const applyView = useCallback((view: SavedView) => {
    const saved = view.query as { q?: unknown; status?: unknown };
    setQuery(typeof saved.q === "string" ? saved.q : "");
    setKind((view.kind ?? "") as Kind | "");
    const first = Array.isArray(saved.status) ? saved.status[0] : null;
    setStatus(STATUSES.includes(first as Status) ? (first as Status) : "active");
  }, []);

  useEffect(() => {
    let active = true;
    const report = (err: unknown) => { if (active) setContextError(messageOf(err)); };
    api.savedViews(workspaceId).then((saved) => {
      if (!active) return;
      setViews(saved);
      if (viewId) {
        const selected = findWorkspaceView(saved, workspaceId, viewId);
        if (selected) applyView(selected);
        else setViewUnavailable(true);
      }
    }).catch(report).finally(() => { if (active) setViewReady(true); });
    if (userId) {
      api.membership(workspaceId, userId).then((mine) => {
        if (active) setMember(mine);
      }).catch(report);
    }
    return () => { active = false; };
  }, [api, workspaceId, userId, viewId, applyView]);

  async function saveView() {
    await run(async () => { try {
      const view = await api.createSavedView(workspaceId, query || kindLabel(kind || "person"), "personal", kind || null, {
        q: query || undefined,
        kind: kind || undefined,
        status: [status],
      });
      setViews((current) => [view, ...(current ?? [])]);
      toast.success("View saved");
    } catch (err) {
      toast.error(messageOf(err));
    } });
  }



  async function deleteView(view: SavedView) {
    await run(async () => { try {
      await api.deleteSavedView(workspaceId, view.id);
      setViews((current) => current?.filter((row) => row.id !== view.id) ?? null);
      toast.success("View removed");
    } catch (err) {
      toast.error(messageOf(err));
    } });
  }

  const filtered = Boolean(query.trim() || kind || status !== "active");
  const total = dashboard ? Object.values(dashboard.countsByKind ?? {}).reduce((sum, count) => sum + (Number(count) || 0), 0) : null;

  function clearFilters() {
    setQuery("");
    setKind("");
    setStatus("active");
  }

  // "Nothing yet" and "nothing matches" call for different next steps.
  function emptyRecords() {
    if (status === "archived" && !query.trim() && !kind) {
      return <EmptyState title="Nothing archived">Archived records land here. Archiving is permanent; their history stays readable.</EmptyState>;
    }
    if (filtered) {
      return <EmptyState title="Nothing matches these filters">Try another term or clear the filters.</EmptyState>;
    }
    if (total === 0) {
      return (
        <EmptyState
          title="No records yet"
          action={canAdmin(member?.role) ? <Link href={`/w/${workspaceId}/ontology`} className={recipes.join(recipes.pill.md, recipes.cta.inline)}>Set up templates</Link> : undefined}
        >
          {canWrite(member?.role)
            ? "Each record follows a template for its kind and type. Once one exists under Ontology, use New record to add the first."
            : "Records that editors add will show up here."}
        </EmptyState>
      );
    }
    return <EmptyState title="Nothing in this view">Search is workspace-scoped. Archived records stay out until you ask for them.</EmptyState>;
  }

  return (
    <Frame title="Registry" backHref={workspaceOverviewHref(workspaceId)} workspaceRole={member?.role}>
      {viewUnavailable && <p role="status" className="mb-4 text-sm text-muted-foreground">This saved view is unavailable.</p>}
      <Input value={query} onChange={(event) => setQuery(event.target.value)} type="search" aria-label="Search records" placeholder="Search titles, notes, tags" className={recipes.join("mb-4", recipes.field.lg)} />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Record kind">
        {KINDS.map((item) => (
          <button key={item.id} type="button" aria-pressed={kind === item.id} onClick={() => setKind(kind === item.id ? "" : item.id)} className={recipes.chip({ on: kind === item.id, animated: true })}>
            {item.label}
            {dashboard ? ` ${dashboard.countsByKind?.[item.id] ?? 0}` : ""}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Record status">
          {STATUSES.map((item) => (
            <button key={item} type="button" aria-pressed={status === item} onClick={() => setStatus(item)} className={recipes.join(recipes.chip({ on: status === item, tone: "ink", size: "tall" }), "capitalize")}>{item}</button>
          ))}
        </div>
        {filtered && <Button variant="ghost" className={recipes.pill.bare} onClick={clearFilters}>Clear filters</Button>}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canWrite(member?.role) && <EntityEditor workspaceId={workspaceId} onSaved={() => { void load(); setSummaryRevision((revision) => revision + 1); }} />}
        {canWrite(member?.role) && <Button variant="ghost" className={recipes.pill.bare} disabled={busy || views === null} onClick={() => void saveView()}>Save this view</Button>}
      </div>
      <nav className="mb-4 flex flex-wrap items-center gap-1" aria-label="Workspace sections">
        {sectionsFor(member?.role ?? "viewer").map((section) => (
          <Link key={section.path} href={`/w/${workspaceId}/${section.path}`} className={recipes.navLink}>{section.label}</Link>
        ))}
      </nav>
      {views && views.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {views.map((view) => {
            const removable = view.owner_user_id === session?.id || (view.visibility === "workspace" && canAdmin(member?.role));
            return (
              <span key={view.id} className="flex shrink-0 items-center rounded-full bg-secondary text-sm">
                <button type="button" className={`py-1.5 pl-3 ${removable ? "pr-1" : "pr-3"}`} onClick={() => applyView(view)}>{view.name}</button>
                {removable && (
                  <button type="button" disabled={busy} aria-label={`Remove view ${view.name}`} className="grid size-7 disabled:opacity-50 place-items-center rounded-full text-muted-foreground hover:text-foreground" onClick={() => void deleteView(view)}>×</button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {contextError && <p role="status" className={recipes.join("mb-4", recipes.notice.error)}>Some workspace details couldn’t load. {contextError}</p>}
      {error && <p role="alert" className={recipes.join("mb-4", recipes.notice.error)}>{error}</p>}
      <ul className="grid grid-cols-1 gap-2" aria-busy={loading || undefined}>
        {items.map((entity) => (
          <li key={entity.id}>
            <Link href={`/w/${workspaceId}/e/${entity.id}`} className={recipes.row.link}>
              <Initial label={entity.title} />
              <span className="min-w-0 flex-1">
                <span className={recipes.row.title}>{entity.title}</span>
                <span className={recipes.row.meta}>
                  <EntityActorPill entity={entity} />
                  <span className="min-w-0 wrap-anywhere sm:truncate">{kindLabel(entity.kind)} · {entity.type} · {entity.status}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground sm:hidden">{when(entity.updated_at)}</span>
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{when(entity.updated_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {loading && items.length === 0 && <RowSkeletons label="Loading records" />}
      {!loading && items.length === 0 && !error && emptyRecords()}
      {cursor && <Button variant="secondary" className={recipes.join("mt-4", recipes.pill.bare)} disabled={loading} onClick={() => void load(cursor)}>More</Button>}
      {error && !cursor && <Button variant="secondary" className={recipes.join("mt-4", recipes.pill.bare)} disabled={loading} onClick={() => void load()}>Retry</Button>}
      {dashboard && dashboard.staleProcessKinds?.length > 0 && (
        <p className={recipes.join("mt-6", recipes.text.muted)}>{dashboard.staleProcessKinds.length} process kind{dashboard.staleProcessKinds.length === 1 ? "" : "s"} older than {dashboard.staleProcessKindDays} days.</p>
      )}
    </Frame>
  );
}
