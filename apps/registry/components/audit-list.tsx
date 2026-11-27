"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LineSkeletons, RowSkeletons, recipes } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { actionLabel, originLabel, targetName } from "@/lib/audit";
import { messageOf, whenFull } from "@/lib/format";
import type { AuditEvent } from "@/lib/model";
import { useRegistry } from "@/lib/registry";

/**
 * Paged audit events in plain words. `query` is passed to audit_recent (targetType,
 * targetId, actionPrefix, …); "More" follows the database's signed cursor.
 */
export function AuditList({
  workspaceId,
  query,
  pageSize = 30,
  compact = false,
  empty = "No audit events yet.",
  refreshKey,
}: {
  workspaceId: string;
  query: Record<string, string>;
  pageSize?: number;
  /** Plain rows for use inside a card (record history). */
  compact?: boolean;
  empty?: string;
  /** Change it to reload from the first page (e.g. after the record is edited). */
  refreshKey?: unknown;
}) {
  const { api } = useRegistry();
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const queryKey = JSON.stringify(query);

  async function load(next: string | null) {
    const mine = ++generation.current;
    setLoading(true);
    try {
      const page = await api.auditRecent(workspaceId, { ...query, limit: pageSize, ...(next ? { cursor: next } : {}) });
      if (mine !== generation.current) return;
      setItems((current) => (next ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError(null);
    } catch (err) {
      if (mine === generation.current) setError(messageOf(err));
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, workspaceId, queryKey, pageSize, refreshKey]);

  return (
    <>
      {error && <p className={recipes.join("mb-3", recipes.text.error)}>{error}</p>}
      <ul className={compact ? "grid gap-3" : "grid gap-2"}>
        {items.map((event) => {
          const name = targetName(event);
          const by = originLabel(event);
          const failed = event.outcome !== "success";
          const linkable = event.target_type === "entity" && event.target_id && !compact;
          return (
            <li key={event.id} className={compact ? "flex items-baseline justify-between gap-3 text-sm" : recipes.join(recipes.row.item, "flex items-baseline justify-between gap-3")}>
              <div className="min-w-0">
                <p className={compact ? "" : "font-medium"}>
                  {actionLabel(event.action)}
                  {failed && <span className="ml-2 text-xs font-medium text-destructive">failed</span>}
                </p>
                {(name || by) && (
                  <p className={compact ? "text-xs text-muted-foreground" : "mt-1 truncate text-sm text-muted-foreground"}>
                    {name && (linkable ? <Link href={`/w/${workspaceId}/e/${event.target_id}`} className="text-primary">{name}</Link> : name)}
                    {name && by ? " · " : ""}
                    {by}
                  </p>
                )}
              </div>
              <time dateTime={event.at} className="shrink-0 text-xs text-muted-foreground">{whenFull(event.at)}</time>
            </li>
          );
        })}
      </ul>
      {!loading && items.length === 0 && !error && <p className="text-sm text-muted-foreground">{empty}</p>}
      {loading && items.length === 0 && (compact ? <LineSkeletons label="Loading history" /> : <RowSkeletons shape="item" label="Loading events" />)}
      {cursor && (
        <Button variant="secondary" className={recipes.join("mt-4", recipes.pill.bare)} disabled={loading} onClick={() => void load(cursor)}>
          {loading ? "Loading…" : "More"}
        </Button>
      )}
    </>
  );
}
