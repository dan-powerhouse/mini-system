"use client";

import { Combobox } from "@base-ui/react/combobox";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { messageOf } from "@/lib/format";
import { kindLabel, type Entity, type Kind } from "@/lib/model";
import { useRegistry } from "@/lib/registry";
import { recipes } from "@/components/kit";

/** Search-as-you-type picker over the whole workspace, not a fixed first page. */
export function EntityPicker({
  workspaceId,
  value,
  onChange,
  kinds,
  excludeId,
  placeholder = "Search records",
  suggestWhenEmpty = true,
  inputProps,
}: {
  workspaceId: string;
  value: Entity | null;
  onChange: (entity: Entity | null) => void;
  kinds?: Kind[];
  excludeId?: string;
  placeholder?: string;
  /** Show suggestions before anything is typed. */
  suggestWhenEmpty?: boolean;
  inputProps?: Pick<ComponentProps<"input">, "id" | "aria-invalid" | "aria-describedby">;
}) {
  const { api } = useRegistry();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<{ key: string; items: Entity[]; error?: string }>();
  const input = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const kindKey = (kinds ?? []).join(",");
  const search = query.trim();
  const searchKey = JSON.stringify([workspaceId, search, kindKey, excludeId]);
  const searching = !value && (suggestWhenEmpty || Boolean(search));
  const result = searching && response?.key === searchKey ? response : undefined;
  const items = result?.items ?? [];

  useEffect(() => {
    if (!searching) return;
    let stop = false;
    const handle = setTimeout(async () => {
      try {
        const allowed = kindKey ? (kindKey.split(",") as Kind[]) : [undefined];
        const pages = await Promise.all(allowed.map((kind) => api.search(workspaceId, {
          q: search || undefined,
          kind,
          status: ["active", "inactive"],
          limit: 9,
          sort: { field: "title", direction: "asc" },
        })));
        if (stop) return;
        const matches = pages.flatMap((page) => page.items).filter((item) => item.id !== excludeId);
        if (pages.length > 1) matches.sort((left, right) => left.title.localeCompare(right.title));
        setResponse({ key: searchKey, items: matches.slice(0, 8) });
      } catch (err) {
        if (!stop) setResponse({ key: searchKey, items: [], error: messageOf(err) });
      }
    }, 200);
    return () => {
      stop = true;
      clearTimeout(handle);
    };
  }, [api, workspaceId, search, searchKey, kindKey, excludeId, searching]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (value ? changeButton.current : input.current)?.focus();
  }, [value]);

  function choose(entity: Entity | null) {
    moveFocus.current = true;
    setQuery("");
    setResponse(undefined);
    onChange(entity);
  }

  if (value) {
    return (
      <div className="flex h-11 items-center justify-between gap-2 rounded-full border border-input px-4 text-sm">
        <span className="min-w-0 truncate">
          {value.title} <span className="text-muted-foreground">· {kindLabel(value.kind)}</span>
        </span>
        <button ref={changeButton} type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => choose(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <Combobox.Root<Entity>
        items={items}
        filter={null}
        inline
        open={items.length > 0}
        inputValue={query}
        onInputValueChange={(text) => setQuery(text)}
        itemToStringLabel={(item) => item.title}
        onValueChange={(item) => { if (item) choose(item); }}
      >
        <Combobox.Input ref={input} render={<Input />} {...inputProps} placeholder={placeholder} aria-label={inputProps?.id ? undefined : placeholder} className={recipes.field.md} />
        {items.length > 0 && (
          <Combobox.List className={recipes.picker.list} aria-label="Matching records">
            {(item: Entity) => (
              <Combobox.Item key={item.id} value={item} className={recipes.picker.option}>
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{kindLabel(item.kind)} · {item.type}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
        )}
      </Combobox.Root>
      {searching && !result && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">Searching…</p>}
      {result && !result.error && items.length === 0 && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">No matching records.</p>}
      {result?.error && <p role="alert" className="px-3 py-1 text-xs text-destructive">{result.error}</p>}
    </div>
  );
}
