"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { EntityPicker } from "@/components/entity-picker";
import { recipes } from "@/components/kit";
import { formatValue, isEditable, toggleItem, type FieldDraft } from "@/lib/fields";
import type { Entity, FieldDef, Kind } from "@/lib/model";
import { useRegistry } from "@/lib/registry";

type RendererProps = {
  field: FieldDef;
  draft: FieldDraft;
  onChange: (next: FieldDraft) => void;
  workspaceId: string;
  control: { id: string; "aria-invalid"?: true; "aria-describedby"?: string };
  /** Overrides the derived placeholder (e.g. for a template default). */
  placeholder?: string;
  /** For references: suggest records before anything is typed. */
  suggestWhenEmpty?: boolean;
};

/**
 * Editor control per field type. Add a type here to give it a dedicated control;
 * types without one get a text input, and values the screen cannot edit are kept.
 */
const RENDERERS: Record<string, (props: RendererProps) => React.ReactElement> = {
  select: ({ field, draft, onChange, control }) => (
    <select {...control} className={recipes.select.wide} value={draft} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose</option>
      {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  ),
  number: ({ draft, onChange, control }) => (
    <Input {...control} type="number" inputMode="decimal" step="any" value={draft} onChange={(event) => onChange(event.target.value)} className={recipes.field.md} />
  ),
  date: ({ draft, onChange, control }) => (
    <Input {...control} type="date" value={draft} onChange={(event) => onChange(event.target.value)} className={recipes.field.md} />
  ),
  multiselect: ({ field, draft, onChange, control }) => {
    const picked = Array.isArray(draft) ? draft : [];
    return (
      <div {...control} role="group" aria-label={field.name.replace(/[_-]/g, " ")} className="flex flex-wrap gap-2">
        {(field.options ?? []).map((option) => (
          <button key={option} type="button" aria-pressed={picked.includes(option)} className={recipes.chip({ on: picked.includes(option), surface: "secondary" })} onClick={() => onChange(toggleItem(picked, option, field.options))}>
            {option}
          </button>
        ))}
      </div>
    );
  },
  entity_ref: (props) => <EntityRefRenderer {...props} />,
};

/** Picks another record of the kind the template allows; the draft holds its id. */
function EntityRefRenderer({ field, draft, onChange, workspaceId, placeholder, control, suggestWhenEmpty = true }: RendererProps) {
  const { api } = useRegistry();
  const [selected, setSelected] = useState<Entity | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const reference = typeof draft === "string" ? draft : "";

  // Show the name of a record that is already referenced.
  useEffect(() => {
    if (!reference || selected?.id === reference) return;
    let stop = false;
    api.getEntity(workspaceId, reference).then((detail) => {
      if (!stop) { setSelected(detail.entity); setUnavailable(null); }
    }).catch(() => { if (!stop) setUnavailable(reference); });
    return () => { stop = true; };
  }, [api, workspaceId, reference, selected?.id]);

  const kinds = field.entityRefKind ? [field.entityRefKind as Kind] : undefined;
  return (
    <div>
      <EntityPicker
        inputProps={control}
        workspaceId={workspaceId}
        value={reference && selected?.id === reference ? selected : null}
        onChange={(entity) => { setSelected(entity); setUnavailable(null); onChange(entity?.id ?? ""); }}
        kinds={kinds}
        placeholder={placeholder ?? `Search ${field.name.replace(/_/g, " ")}`}
        suggestWhenEmpty={suggestWhenEmpty}
      />
      {reference && selected?.id !== reference && (
        <p role="status" className="mt-1 px-2 text-xs text-muted-foreground">
          {unavailable === reference ? "Could not load the linked record. Choose another record to replace it." : "Loading the linked record…"}
        </p>
      )}
    </div>
  );
}

function TextRenderer({ field, draft, onChange, control, placeholder }: RendererProps) {
  return <Input {...control} value={draft} onChange={(event) => onChange(event.target.value)} className={recipes.field.md} placeholder={placeholder ?? field.dataType} />;
}

/** Read-only view of a value the screen cannot edit; it is saved back unchanged. */
function KeptValue({ id, field, value }: { id: string; field: FieldDef; value: unknown }) {
  return (
    <div id={id} className="rounded-2xl bg-secondary/70 px-4 py-2 text-sm">
      <p className="break-words">{value === undefined || value === null ? "Empty" : formatValue(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This screen cannot edit {field.dataType} fields yet. The value is kept as it is; change it through MCP or the API.
      </p>
    </div>
  );
}

export function FieldInput({
  field,
  id = field.name,
  draft,
  stored,
  onChange,
  workspaceId,
  error,
  placeholder,
  suggestWhenEmpty,
}: {
  field: FieldDef;
  id?: string;
  draft: FieldDraft;
  stored: unknown;
  onChange: (next: FieldDraft) => void;
  workspaceId: string;
  error?: string;
  placeholder?: string;
  suggestWhenEmpty?: boolean;
}) {
  if (!isEditable(field, stored)) return <KeptValue id={id} field={field} value={stored} />;
  const Renderer = Object.hasOwn(RENDERERS, field.dataType) ? RENDERERS[field.dataType] : TextRenderer;
  const control = { id, "aria-invalid": error ? true as const : undefined, "aria-describedby": error ? `${id}-error` : undefined };
  return (
    <>
      <Renderer field={field} draft={draft} onChange={onChange} workspaceId={workspaceId} control={control} placeholder={placeholder} suggestWhenEmpty={suggestWhenEmpty} />
      {error && <p id={control["aria-describedby"]} className="px-2 text-xs text-destructive" role="alert">{error}</p>}
    </>
  );
}
