"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EntityEditor } from "@/components/entity-editor";
import { EntityPicker } from "@/components/entity-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { EntityActorPill } from "@/components/actor-pill";
import { Frame } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { errorCode, messageOf, when } from "@/lib/format";
import { canWrite, kindLabel, type Entity, type EntityDetail, type Member, type PathRow, type PathStep, type Predicate, type Relation } from "@/lib/model";
import { notifyError } from "@/lib/notify";
import { useBusy } from "@/lib/use-busy";
import { AuditList } from "@/components/audit-list";
import { formatValue } from "@/lib/fields";
import { useRegistry } from "@/lib/registry";
import { PageIntro, PanelSkeleton, recipes } from "@/components/kit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function EntityView({ workspaceId, entityId }: { workspaceId: string; entityId: string }) {
  const { api, session } = useRegistry();
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [neighbors, setNeighbors] = useState<{ title: string; depth: number }[]>([]);
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [predicate, setPredicate] = useState("");
  const [target, setTarget] = useState<Entity | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, run] = useBusy();
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [next, preds, mine, walk] = await Promise.all([
        api.getEntity(workspaceId, entityId),
        api.predicates(workspaceId),
        session ? api.membership(workspaceId, session.id) : Promise.resolve(null),
        api.traverse(workspaceId, entityId, 2, "both"),
      ]);
      // Name every related record, not just the first page of a search.
      const map: Record<string, string> = { [next.entity.id]: next.entity.title };
      for (const node of walk.nodes) map[node.entity.id] = node.entity.title;
      // Records referenced by relations or by entity_ref attributes (stored as ids).
      const referenced = Object.values(next.entity.attributes).filter((value): value is string => typeof value === "string" && UUID.test(value));
      const related = [...next.relations.outgoing.map((row) => row.to_id), ...next.relations.incoming.map((row) => row.from_id), ...referenced];
      const missing = [...new Set(related.filter((id) => !map[id]))].slice(0, 25);
      const fetched = await Promise.all(missing.map((id) => api.getEntity(workspaceId, id).then((row) => row.entity).catch(() => null)));
      for (const row of fetched) if (row) map[row.id] = row.title;
      setDetail(next);
      setPredicates(preds);
      setMember(mine);
      setNames(map);
      setNeighbors(walk.nodes.map((node) => ({ title: node.entity.title, depth: node.depth })));
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, entityId, session?.id]);

  async function relate(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || !target) return;
    await run(async () => { try {
      await api.createRelation(workspaceId, detail.entity.id, target.id, predicate);
      toast.success("Relation saved");
      setTarget(null);
      setPickerKey((key) => key + 1);
      await refresh();
    } catch (err) {
      notifyError(err, () => void refresh());
    } });
  }

  async function remove(relation: Relation) {
    await run(async () => {
      try {
        await api.deleteRelation(workspaceId, relation.id);
        await refresh();
      } catch (err) {
        notifyError(err, () => void refresh());
      }
    });
  }

  async function archive() {
    if (!detail) return;
    try {
      await api.archiveEntity(workspaceId, detail.entity.id, detail.entity.version);
      toast.success("Archived");
      await refresh();
    } catch (err) {
      notifyError(err, () => void refresh());
    }
  }

  const entity = detail?.entity;
  // Only predicates that may start from this kind of record, and only matching targets.
  const usable = entity ? predicates.filter((item) => item.from_kinds.includes(entity.kind)) : [];
  const chosen = usable.find((item) => item.name === predicate);
  return (
    <Frame title={entity ? undefined : "Record"} backHref={`/w/${workspaceId}`}>
      {error && <p className={recipes.join("mb-4", recipes.notice.error)}>{error}</p>}
      {!entity && !error && (
        <div className="grid gap-4">
          <PanelSkeleton lines={2} label="Loading the record" />
          <PanelSkeleton />
          <PanelSkeleton lines={2} />
        </div>
      )}
      {entity && (
        <div className="grid gap-4">
          <div className={recipes.panel.raised}>
            <p className="flex flex-wrap items-center gap-2 text-sm text-primary">
              <EntityActorPill entity={entity} />
              <span>{kindLabel(entity.kind)} · {entity.type}</span>
            </p>
            <h1 className="mt-2 wrap-anywhere text-3xl font-semibold tracking-tight">{entity.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground capitalize">{entity.status} · version {entity.version} · updated {when(entity.updated_at)}</p>
            {entity.notes && <p className="mt-4 max-w-prose wrap-anywhere leading-7 text-[15px]">{entity.notes}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {entity.tags.map((tag) => <span key={tag} className={recipes.tag}>{tag}</span>)}
            </div>
            {canWrite(member?.role) && entity.status !== "archived" && (
              <div className="mt-5 flex gap-2">
                <EntityEditor workspaceId={workspaceId} entity={entity} onSaved={() => void refresh()} onConflict={() => void refresh()} />
                <ConfirmButton
                  label="Archive"
                  title={`Archive ${entity.title}?`}
                  description="Archiving is permanent. The record leaves search and can no longer be edited or linked. Its history is kept."
                  confirmLabel="Archive for good"
                  onConfirm={archive}
                />
              </div>
            )}
          </div>
          <section className={recipes.panel.lg}>
            <h2 className="font-medium">Attributes</h2>
            <dl className="mt-3 grid gap-3">
              {Object.entries(entity.attributes).map(([key, value]) => (
                <div key={key} className="grid gap-1 border-b border-border/70 pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-baseline sm:gap-4">
                  <dt className="min-w-0 wrap-anywhere text-sm text-muted-foreground">{key}</dt>
                  <dd className="min-w-0 wrap-anywhere text-sm sm:text-right">
                    {typeof value === "string" && names[value] ? (
                      <Link href={`/w/${workspaceId}/e/${value}`} className="text-primary">{names[value]}</Link>
                    ) : (
                      formatValue(value)
                    )}
                  </dd>
                </div>
              ))}
              {Object.keys(entity.attributes).length === 0 && <p className="text-sm text-muted-foreground">No attributes on this record.</p>}
            </dl>
          </section>
          <section className={recipes.panel.lg}>
            <h2 className="font-medium">Relations</h2>
            <RelationList title="Outgoing" rows={detail.relations.outgoing} names={names} canEdit={canWrite(member?.role)} busy={busy} onRemove={remove} />
            <RelationList title="Incoming" rows={detail.relations.incoming} names={names} canEdit={canWrite(member?.role)} busy={busy} onRemove={remove} incoming />
            {canWrite(member?.role) && entity.status !== "archived" && (
              <form className="mt-4 grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]" onSubmit={relate}>
                <select aria-label="Predicate" className={recipes.select.md} value={predicate} onChange={(event) => { setPredicate(event.target.value); setTarget(null); }} required>
                  <option value="">Predicate</option>
                  {usable.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                </select>
                {chosen ? (
                  <EntityPicker key={pickerKey} workspaceId={workspaceId} value={target} onChange={setTarget} kinds={chosen.to_kinds} excludeId={entity.id} placeholder="Search the target record" />
                ) : (
                  <p className="flex h-11 items-center px-2 text-sm text-muted-foreground">{usable.length ? "Choose a predicate first." : "No predicate starts from this kind yet."}</p>
                )}
                <Button type="submit" disabled={!target || busy} className={recipes.pill.md}>{busy ? "Linking…" : "Link"}</Button>
              </form>
            )}
          </section>
          <section className={recipes.panel.lg}>
            <h2 className="font-medium">Nearby</h2>
            <ul className="mt-3 grid gap-2">
              {neighbors.map((node) => <li key={node.title + node.depth} className="text-sm">{node.title} <span className="text-muted-foreground">· {node.depth} step{node.depth === 1 ? "" : "s"}</span></li>)}
              {neighbors.length === 0 && <li className="text-sm text-muted-foreground">No connected records within two steps.</li>}
            </ul>
            <Link href={`/w/${workspaceId}/paths?start=${entity.id}`} className="mt-3 inline-block text-sm text-primary">Ordered path report</Link>
          </section>
          <section className={recipes.panel.lg}>
            <h2 className="font-medium">History</h2>
            <div className="mt-3">
              <AuditList workspaceId={workspaceId} query={{ targetType: "entity", targetId: entity.id }} pageSize={10} compact refreshKey={entity.version} empty="No audit events for this record." />
            </div>
          </section>
        </div>
      )}
    </Frame>
  );
}

function RelationList({ title, rows, names, incoming, canEdit, busy, onRemove }: { title: string; rows: Relation[]; names: Record<string, string>; incoming?: boolean; canEdit?: boolean; busy?: boolean; onRemove: (relation: Relation) => void }) {
  return (
    <div className="mt-4">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="mt-2 grid gap-2">
        {rows.map((relation) => {
          const other = incoming ? relation.from_id : relation.to_id;
          return (
            <li key={relation.id} className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/70 px-3 py-2 text-sm">
              <span>{relation.predicate} · {names[other] ?? other.slice(0, 8)}</span>
              {canEdit && <button type="button" disabled={busy} className="text-muted-foreground disabled:opacity-50" onClick={() => onRemove(relation)}>Remove</button>}
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-muted-foreground">None</li>}
      </ul>
    </div>
  );
}

const DIRECTIONS: { id: PathStep["direction"]; label: string }[] = [
  { id: "outgoing", label: "Outgoing" },
  { id: "incoming", label: "Incoming" },
  { id: "either", label: "Either" },
];
const REPORT_LIMIT = 50;

export function PathReport({ workspaceId, startId }: { workspaceId: string; startId: string }) {
  const { api } = useRegistry();
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [start, setStart] = useState<Entity | null>(null);
  const [steps, setSteps] = useState<PathStep[]>([{ predicate: "", direction: "outgoing" }]);
  const [rows, setRows] = useState<PathRow[] | null>(null);
  const [busy, guard] = useBusy();

  useEffect(() => {
    api.predicates(workspaceId).then(setPredicates).catch(() => setPredicates([]));
    api.getEntity(workspaceId, startId).then((detail) => setStart(detail.entity)).catch(() => setStart(null));
  }, [api, workspaceId, startId]);

  function setStep(index: number, patch: Partial<PathStep>) {
    setSteps((current) => current.map((step, at) => (at === index ? { ...step, ...patch } : step)));
    setRows(null);
  }

  async function run(event: React.FormEvent) {
    event.preventDefault();
    await guard(async () => {
      try {
        setRows(await api.pathReport(workspaceId, startId, steps, REPORT_LIMIT));
      } catch (error) {
        toast.error(errorCode(error) === "PATH_NOT_CONFIGURED" ? "These steps cannot connect from this record: no predicate in the chain fits the kinds of record along the way." : messageOf(error));
      }
    });
  }

  return (
    <Frame title="Path report" backHref={`/w/${workspaceId}/e/${startId}`}>
      <PageIntro>
        Follows one or two relation steps from {start ? <span className="font-medium text-foreground">{start.title}</span> : "this record"}, in order. This is a registry report, not an execution graph.
      </PageIntro>
      <form className="grid max-w-2xl gap-3" onSubmit={run}>
        {steps.map((step, index) => (
          <fieldset key={index} className="grid gap-2 sm:grid-cols-[auto_1fr_10rem] sm:items-center">
            <legend className="sr-only">Step {index + 1}</legend>
            <span className="text-sm text-muted-foreground">Step {index + 1}</span>
            <select aria-label={`Step ${index + 1} predicate`} className={recipes.select.md} value={step.predicate} onChange={(event) => setStep(index, { predicate: event.target.value })} required>
              <option value="">Predicate</option>
              {predicates.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            <select aria-label={`Step ${index + 1} direction`} className={recipes.select.md} value={step.direction} onChange={(event) => setStep(index, { direction: event.target.value as PathStep["direction"] })}>
              {DIRECTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          {steps.length === 1 ? (
            <Button type="button" variant="secondary" className={recipes.join(recipes.pill.md, "px-5")} onClick={() => { setSteps((current) => [...current, { predicate: "", direction: "outgoing" }]); setRows(null); }}>Add a second step</Button>
          ) : (
            <Button type="button" variant="ghost" className={recipes.join(recipes.pill.md, "px-5")} onClick={() => { setSteps((current) => current.slice(0, 1)); setRows(null); }}>Remove step 2</Button>
          )}
          <Button type="submit" disabled={busy} className={recipes.join(recipes.pill.md, "px-5")}>{busy ? "Running…" : "Run report"}</Button>
        </div>
      </form>

      {rows && (
        <section className="mt-6" aria-label="Paths">
          <p className="mb-2 text-sm text-muted-foreground">
            {rows.length === 0 ? "No paths match these steps." : `${rows.length} path${rows.length === 1 ? "" : "s"}${rows.length === REPORT_LIMIT ? ` (showing the first ${REPORT_LIMIT})` : ""}`}
          </p>
          <ol className="grid gap-2">
            {rows.map((row, index) => (
              <li key={row.relations.map((relation) => relation.id).join("-") || index} className={recipes.join(recipes.row.item, "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm")}>
                {row.entities.map((entity, at) => {
                  const relation = row.relations[at - 1];
                  // The arrow follows how the relation is stored, not the direction asked for.
                  const forward = relation && relation.from_id === row.entities[at - 1].id;
                  return (
                    <span key={`${entity.id}-${at}`} className="contents">
                      {relation && (
                        <span className="text-xs text-muted-foreground">{forward ? `— ${relation.predicate} →` : `← ${relation.predicate} —`}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <EntityActorPill entity={entity} />
                        {at === 0 ? <span className="font-medium">{entity.title}</span> : <Link href={`/w/${workspaceId}/e/${entity.id}`} className="font-medium text-primary">{entity.title}</Link>}
                      </span>
                    </span>
                  );
                })}
              </li>
            ))}
          </ol>
        </section>
      )}
    </Frame>
  );
}
