"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FieldInput } from "@/components/field-input";
import { Frame } from "@/components/frame";
import { ErrorNotice, PageIntro, recipes } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toAttributes, toDrafts } from "@/lib/fields";
import { errorCode, messageOf } from "@/lib/format";
import { KINDS, canAdmin, kindLabel, type FieldDef, type Kind, type Role, type Template } from "@/lib/model";
import { notifyError } from "@/lib/notify";
import { useRegistry } from "@/lib/registry";
import { templateHref } from "@/lib/sections";
import { FIELD_TYPES, hasErrors, normalizeField, validateTemplate, visuallyEditable } from "@/lib/templates";
import { useBusy } from "@/lib/use-busy";

const typeLabel = (id: string) => FIELD_TYPES.find((item) => item.id === id)?.label ?? id;

/**
 * Edit a template's fields visually. Saved field names are locked: renaming a field
 * that records use would strand their values, which the database refuses anyway.
 */
export function TemplateEditor({ workspaceId, kind: initialKind, type: initialType }: { workspaceId: string; kind?: string; type?: string }) {
  const { api, session } = useRegistry();
  const router = useRouter();
  const isNew = !initialKind || !initialType;
  const [role, setRole] = useState<Role | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [kind, setKind] = useState<Kind>((initialKind as Kind) ?? "person");
  const [type, setType] = useState(initialType ?? "");
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [json, setJson] = useState("[]");
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, run] = useBusy();

  async function load() {
    const [list, member] = await Promise.all([api.templates(workspaceId), session ? api.membership(workspaceId, session.id) : Promise.resolve(null)]);
    setTemplates(list);
    setRole(member?.role ?? null);
    if (!isNew) {
      const current = list.find((item) => item.kind === initialKind && item.type === initialType);
      setMissing(!current);
      if (current) {
        setVersion(current.version);
        setSaved(new Set(current.fields.map((field) => field.name)));
        setJson(JSON.stringify(current.fields, null, 2));
        if (visuallyEditable(current.fields)) {
          setFields(current.fields.map((field) => ({ ...field })));
          setMode("visual");
        } else {
          setMode("json");
        }
      }
    }
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch((error) => toast.error(messageOf(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, initialKind, initialType, session?.id]);

  const editable = canAdmin(role);
  const errors = validateTemplate(type, fields);
  const duplicate = isNew && templates.some((item) => item.kind === kind && item.type === type.trim());
  const backHref = `/w/${workspaceId}/ontology`;

  function update(index: number, patch: Partial<FieldDef>) {
    setFields((current) => current.map((field, at) => (at === index ? { ...field, ...patch } : field)));
  }
  function changeType(index: number, dataType: string) {
    // Options, reference kind and default belong to the old type; start clean.
    setFields((current) => current.map((field, at) => (at === index ? { name: field.name, dataType, required: field.required } : field)));
  }
  function move(index: number, by: number) {
    setFields((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  }

  function switchMode(next: "visual" | "json") {
    if (next === "json") {
      setJson(JSON.stringify(fields.map(normalizeField), null, 2));
      setMode("json");
      return;
    }
    try {
      const parsed = JSON.parse(json);
      if (!visuallyEditable(parsed)) {
        toast.error("This JSON uses something the visual editor cannot show. Keep editing it as JSON.");
        return;
      }
      setFields(parsed);
      setMode("visual");
    } catch {
      toast.error("The JSON is not valid yet.");
    }
  }

  async function save() {
    let payload: FieldDef[];
    if (mode === "json") {
      try {
        payload = JSON.parse(json);
      } catch {
        toast.error("The JSON is not valid yet.");
        return;
      }
    } else {
      if (hasErrors(errors) || duplicate) {
        setShowErrors(true);
        toast.error("Some fields need attention.");
        return;
      }
      payload = fields.map(normalizeField);
    }
    await run(async () => {
      try {
        const result = await api.upsertTemplate(workspaceId, kind, type.trim(), payload, isNew ? undefined : version);
        toast.success(isNew ? "Template created" : "Template saved");
        if (isNew) {
          router.replace(templateHref(workspaceId, result.kind, result.type));
          return;
        }
        setVersion(result.version);
        setSaved(new Set(result.fields.map((field) => field.name)));
        setShowErrors(false);
      } catch (error) {
        const text = error instanceof Error ? error.message : "";
        if (text.includes("invalidate existing entity")) {
          toast.error("Some existing records of this type do not fit this change: for example a new required field they lack, a removed field they use, or an option they hold. Make the field optional, keep it, or update those records first.", { duration: 10000 });
        } else if (errorCode(error) === "VERSION_CONFLICT" && isNew) {
          toast.error("A template for this kind and type already exists. Open it from Ontology instead.");
        } else {
          notifyError(error, () => void load());
        }
      }
    });
  }

  const title = isNew ? "New template" : `${KINDS.find((item) => item.id === kind)?.singular ?? kindLabel(kind)} · ${type}`;

  if (loaded && missing) {
    return (
      <Frame title="Template" backHref={backHref}>
        <ErrorNotice>There is no {initialType} template for {initialKind}. It may have been created under another kind.</ErrorNotice>
      </Frame>
    );
  }

  return (
    <Frame title={title} backHref={backHref}>
      <PageIntro>
        Fields every record of this type carries. Saved field names are fixed; to rename one, add a new field. A change that existing records do not fit is refused, so nothing is rewritten.
      </PageIntro>

      {isNew && editable && (
        <section className={recipes.join("mb-4 grid gap-3", recipes.panel.md)}>
          <Label>Kind</Label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((item) => (
              <button key={item.id} type="button" aria-pressed={kind === item.id} className={recipes.chip({ on: kind === item.id, surface: "secondary" })} onClick={() => setKind(item.id)}>{item.singular}</button>
            ))}
          </div>
          <Label htmlFor="type-key">Type key</Label>
          <Input id="type-key" value={type} onChange={(event) => setType(event.target.value)} placeholder="e.g. machine, internal, employee" className={recipes.field.md} aria-invalid={(showErrors && Boolean(errors.type || duplicate)) || undefined} />
          {showErrors && (errors.type || duplicate) && <p className="px-2 text-xs text-destructive" role="alert">{duplicate ? "This kind already has a template with that type" : errors.type}</p>}
        </section>
      )}

      {!isNew && version !== undefined && <p className="mb-3 text-xs text-muted-foreground">Version {version}</p>}

      {editable && (
        <div className="mb-3 flex gap-2" role="group" aria-label="Editor mode">
          {(["visual", "json"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} className={recipes.chip({ on: mode === value, tone: "ink", animated: true })} onClick={() => switchMode(value)}>{value === "visual" ? "Visual" : "JSON"}</button>
          ))}
        </div>
      )}

      {mode === "json" ? (
        <Textarea aria-label="Template fields as JSON" value={json} onChange={(event) => setJson(event.target.value)} readOnly={!editable} className="min-h-80 rounded-2xl font-mono text-xs" />
      ) : (
        <ul className="grid gap-3">
          {fields.map((field, index) => {
            const at = showErrors ? errors.fields[index] ?? {} : {};
            const locked = saved.has(field.name) && !isNew;
            return (
              <li key={index} className={recipes.panel.md} aria-label={`Field ${field.name || index + 1}`}>
                {editable ? (
                  <FieldCard
                    field={field}
                    index={index}
                    count={fields.length}
                    locked={locked}
                    errors={at}
                    workspaceId={workspaceId}
                    onChange={(patch) => update(index, patch)}
                    onType={(dataType) => changeType(index, dataType)}
                    onMove={(by) => move(index, by)}
                    onRemove={() => setFields((current) => current.filter((_, i) => i !== index))}
                  />
                ) : (
                  <ReadOnlyField field={field} />
                )}
              </li>
            );
          })}
          {fields.length === 0 && <li className="text-sm text-muted-foreground">No fields yet. A type can have none; records then carry only a title, notes and tags.</li>}
        </ul>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap gap-2">
          {mode === "visual" && (
            <Button type="button" variant="secondary" className={recipes.join(recipes.pill.md, "px-5")} onClick={() => setFields((current) => [...current, { name: "", dataType: "text" }])}>Add field</Button>
          )}
          <Button type="button" disabled={busy} className={recipes.join(recipes.pill.md, "px-5")} onClick={() => void save()}>{busy ? "Saving…" : isNew ? "Create template" : "Save template"}</Button>
        </div>
      )}
    </Frame>
  );
}

function FieldCard({
  field,
  index,
  count,
  locked,
  errors,
  workspaceId,
  onChange,
  onType,
  onMove,
  onRemove,
}: {
  field: FieldDef;
  index: number;
  count: number;
  locked: boolean;
  errors: Partial<Record<"name" | "options" | "default" | "entityRefKind", string>>;
  workspaceId: string;
  onChange: (patch: Partial<FieldDef>) => void;
  onType: (dataType: string) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const [option, setOption] = useState("");
  const id = (part: string) => `field-${index}-${part}`;
  const withOptions = field.dataType === "select" || field.dataType === "multiselect";

  function addOption() {
    const value = option.trim();
    if (!value) return;
    onChange({ options: [...(field.options ?? []), value] });
    setOption("");
  }

  // The default is edited with the same control records use; it never has to be filled.
  const defaultField: FieldDef = { ...field, name: id("default"), required: false };
  const defaultDraft = field.default === undefined ? "" : toDrafts([defaultField], { [defaultField.name]: field.default })[defaultField.name] ?? "";

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={id("name")}>Name</Label>
          {locked ? (
            <p id={id("name")} className="flex h-11 items-center px-4 font-mono text-sm">{field.name}</p>
          ) : (
            <Input id={id("name")} value={field.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="snake_case_name" aria-invalid={Boolean(errors.name) || undefined} className={recipes.join(recipes.field.md, "font-mono")} />
          )}
          {errors.name && <p className="px-2 text-xs text-destructive" role="alert">{errors.name}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("type")}>Type</Label>
          <select id={id("type")} className={recipes.select.md} value={field.dataType} onChange={(event) => onType(event.target.value)}>
            {FIELD_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </div>

      {withOptions && (
        <div className="grid gap-1.5">
          <Label htmlFor={id("option")}>Options</Label>
          <div className="flex flex-wrap gap-2">
            {(field.options ?? []).map((value, at) => (
              <span key={`${value}-${at}`} className="flex items-center rounded-full bg-secondary text-sm">
                <span className="py-1.5 pr-1 pl-3">{value}</span>
                <button type="button" aria-label={`Remove option ${value}`} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground" onClick={() => onChange({ options: (field.options ?? []).filter((_, i) => i !== at), default: undefined })}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input id={id("option")} value={option} onChange={(event) => setOption(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(); } }} placeholder="Add an option" className={recipes.field.md} />
            <Button type="button" variant="secondary" className={recipes.join(recipes.pill.md, "px-5")} onClick={addOption}>Add</Button>
          </div>
          {errors.options && <p className="px-2 text-xs text-destructive" role="alert">{errors.options}</p>}
        </div>
      )}

      {field.dataType === "entity_ref" && (
        <div className="grid gap-1.5">
          <Label htmlFor={id("refkind")}>Refers to</Label>
          <select id={id("refkind")} className={recipes.select.md} value={field.entityRefKind ?? ""} onChange={(event) => onChange({ entityRefKind: (event.target.value || undefined) as Kind | undefined, default: undefined })}>
            <option value="">Any kind of record</option>
            {KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      )}

      {(!withOptions || (field.options ?? []).length > 0) && (
        <div className="grid gap-1.5">
          <Label htmlFor={defaultField.name}>Default for new records</Label>
          <FieldInput
            field={defaultField}
            draft={defaultDraft}
            stored={undefined}
            workspaceId={workspaceId}
            error={errors.default}
            placeholder={field.dataType === "entity_ref" ? "Search a default record (optional)" : "Optional"}
            suggestWhenEmpty={false}
            onChange={(next) => onChange({ default: toAttributes([defaultField], { [defaultField.name]: next })[defaultField.name] })}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={Boolean(field.required)} className={recipes.chip({ on: Boolean(field.required), surface: "secondary" })} onClick={() => onChange({ required: !field.required })}>Required</button>
        <span className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" className={recipes.pill.bare} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">↑</Button>
          <Button type="button" variant="ghost" className={recipes.pill.bare} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">↓</Button>
          <Button type="button" variant="ghost" className={recipes.pill.bare} onClick={onRemove}>Remove</Button>
        </span>
      </div>
    </div>
  );
}

function ReadOnlyField({ field }: { field: FieldDef }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="font-mono">{field.name}</span>
      <span className="text-muted-foreground">
        {typeLabel(field.dataType)}
        {field.required ? " · required" : ""}
        {field.options?.length ? ` · ${field.options.join(", ")}` : ""}
        {field.entityRefKind ? ` · ${kindLabel(field.entityRefKind)}` : ""}
      </span>
    </div>
  );
}
