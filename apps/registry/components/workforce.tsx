"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActorPill } from "@/components/actor-pill";
import { EntityEditor } from "@/components/entity-editor";
import { Frame } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTORS, MACHINE_TYPE, actorOf, type Actor } from "@/lib/actors";
import { messageOf, when } from "@/lib/format";
import { canWrite, type Entity, type Member, type SearchQuery } from "@/lib/model";
import { useRegistry } from "@/lib/registry";
import { EmptyState, Initial, RowSkeletons, recipes } from "@/components/kit";

type Filter = Actor | "all";

// One search per registry source; "all" merges people and agents.
function sourcesFor(filter: Filter): { key: string; query: SearchQuery; keep?: (entity: Entity) => boolean }[] {
  const human = { key: "person", query: { kind: "person" as const } };
  const machine = { key: "machine", query: { kind: "agent" as const, type: MACHINE_TYPE } };
  // The search RPC has no "type is not" filter, so LLM agents are agents minus machines.
  const agent = { key: "agent", query: { kind: "agent" as const }, keep: (entity: Entity) => entity.type !== MACHINE_TYPE };
  if (filter === "human") return [human];
  if (filter === "machine") return [machine];
  if (filter === "agent") return [agent];
  return [human, { key: "agent-all", query: { kind: "agent" as const } }];
}

type SourceState = { items: Entity[]; cursor: string | null };

export function WorkforceSection({ workspaceId }: { workspaceId: string }) {
  const { api, session } = useRegistry();
  // The actor filter lives in the address (?actor=machine) so back, reload and shared links keep it.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("actor");
  const filter: Filter = ACTORS.some((item) => item.id === fromUrl) ? (fromUrl as Actor) : "all";
  function setFilter(next: Filter) {
    router.replace(next === "all" ? pathname : `${pathname}?actor=${next}`, { scroll: false });
  }
  const [query, setQuery] = useState("");
  const [state, setState] = useState<Record<string, SourceState>>({});
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  async function load(more: boolean) {
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const sources = sourcesFor(filter);
      const pages = await Promise.all(
        sources.map(async (source) => {
          const previous = more ? state[source.key] : undefined;
          if (more && !previous?.cursor) return [source.key, previous ?? { items: [], cursor: null }] as [string, SourceState];
          const page = await api.search(workspaceId, {
            ...source.query,
            q: query.trim() || undefined,
            status: ["active", "inactive"],
            limit: 30,
            cursor: previous?.cursor ?? undefined,
            sort: { field: "title", direction: "asc" },
          });
          const fresh = source.keep ? page.items.filter(source.keep) : page.items;
          return [source.key, { items: [...(previous?.items ?? []), ...fresh], cursor: page.nextCursor }] as [string, SourceState];
        }),
      );
      if (mine !== generation.current) return;
      setState(Object.fromEntries(pages));
    } catch (err) {
      if (mine === generation.current) setError(messageOf(err));
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => void load(false), 180);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filter, query]);

  useEffect(() => {
    if (!session) return;
    api.membership(workspaceId, session.id).then(setMember).catch(() => setMember(null));
  }, [api, workspaceId, session]);

  const items = Object.values(state)
    .flatMap((source) => source.items)
    .sort((a, b) => a.title.localeCompare(b.title));
  const hasMore = Object.values(state).some((source) => source.cursor);
  const create = filter === "human" ? { kind: "person" as const, type: undefined } : filter === "machine" ? { kind: "agent" as const, type: MACHINE_TYPE } : filter === "agent" ? { kind: "agent" as const, type: undefined } : null;

  return (
    <Frame title="Workforce" backHref={`/w/${workspaceId}`}>
      <p className={recipes.join("mb-4", recipes.text.intro)}>
        Everyone and everything that does the work: people, LLM agents, and machines. Machines are agents of type <span className="font-mono text-xs">machine</span>; add agent types such as internal or external under Ontology.
      </p>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by actor">
        {([{ id: "all", label: "All" }, ...ACTORS] as { id: Filter; label: string }[]).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={recipes.chip({ on: filter === item.id, animated: true })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the workforce" aria-label="Search the workforce" className={recipes.field.lg} />
        {canWrite(member?.role) && (
          <EntityEditor
            workspaceId={workspaceId}
            initialKind={create?.kind ?? "person"}
            initialType={create?.type}
            label={filter === "machine" ? "New machine" : filter === "agent" ? "New LLM agent" : filter === "human" ? "New person" : "New record"}
            onSaved={() => void load(false)}
          />
        )}
      </div>
      {error && <p className={recipes.join("mb-4", recipes.notice.error)}>{error}</p>}
      <ul className="grid gap-2" aria-busy={loading || undefined}>
        {items.map((entity) => {
          const actor = actorOf(entity);
          return (
            <li key={entity.id}>
              <Link href={`/w/${workspaceId}/e/${entity.id}`} className={recipes.row.link}>
                <Initial label={entity.title} />
                <span className="min-w-0 flex-1">
                  <span className={recipes.row.title}>{entity.title}</span>
                  <span className={recipes.row.meta}>
                    {actor && <ActorPill actor={actor} />}
                    <span className="truncate">{[actor === "machine" ? null : entity.type, entity.status === "inactive" ? "inactive" : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{when(entity.updated_at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {loading && items.length === 0 && <RowSkeletons label="Loading the workforce" />}
      {!loading && items.length === 0 && !error && (
        query.trim() ? (
          <EmptyState
            title={`No one matches “${query.trim()}”`}
            action={<Button variant="secondary" className={recipes.join(recipes.pill.md, "px-5")} onClick={() => setQuery("")}>Clear search</Button>}
          >
            Search covers names, notes and tags.
          </EmptyState>
        ) : (
          <EmptyState title="No one here yet">
            {filter === "machine" ? "Add an agent type called machine under Ontology, then create one." : "People and agents you add show up here together."}
          </EmptyState>
        )
      )}
      {hasMore && !loading && <Button variant="secondary" className={recipes.join("mt-4", recipes.pill.bare)} onClick={() => void load(true)}>More</Button>}
    </Frame>
  );
}
