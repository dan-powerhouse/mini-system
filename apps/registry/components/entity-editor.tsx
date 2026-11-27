"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorCode, messageOf } from "@/lib/format";
import { KINDS, type Entity, type FieldDef, type Kind, type Status, type Template } from "@/lib/model";
import { useRegistry } from "@/lib/registry";
import { useBusy } from "@/lib/use-busy";
import { FieldInput } from "@/components/field-input";
import { defaultDrafts, toAttributes, toDrafts, validateDrafts, type FieldDraft } from "@/lib/fields";
import { LineSkeletons, recipes } from "@/components/kit";

export function EntityEditor({
  workspaceId,
  entity,
  onSaved,
  onConflict,
  initialKind,
  initialType,
  label,
}: {
  workspaceId: string;
  entity?: Entity;
  /** Preselected kind and type for a new record. */
  initialKind?: Kind;
  initialType?: string;
  /** Trigger text for a new record; defaults to "New record". */
  label?: string;
  onSaved: (entity: Entity) => void;
  /** Called when someone else saved first; the caller reloads the record. */
  onConflict?: () => void;
}) {
  const { api } = useRegistry();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [record, setRecord] = useState(entity);
  const [kind, setKind] = useState<Kind>(entity?.kind ?? initialKind ?? "person");
  const [type, setType] = useState(entity?.type ?? initialType ?? "");
  const [title, setTitle] = useState(entity?.title ?? "");
  const [notes, setNotes] = useState(entity?.notes ?? "");
  const [tags, setTags] = useState((entity?.tags ?? []).join(", "));
  const [attributes, setAttributes] = useState<Record<string, FieldDraft>>({});
  // Archived records are not editable, so an edited record is active or inactive.
  const [status, setStatus] = useState<Status>(entity?.status === "inactive" ? "inactive" : "active");
  // Field errors show after the first save attempt, then update as the user types.
  const [showErrors, setShowErrors] = useState(false);
  const [busy, run] = useBusy();

  useEffect(() => {
    if (!open) return;
    let active = true;
    api.templates(workspaceId).then((rows) => {
      if (active) setTemplates(rows);
    }).catch((error) => {
      if (active) setTemplateError(messageOf(error));
    });
    return () => { active = false; };
  }, [api, open, workspaceId, attempt]);

  function changeOpen(next: boolean) {
    if (busy) return;
    if (next) {
      // Use the version the user actually sees for the entire editing session.
      setRecord(entity);
      const startKind = entity?.kind ?? initialKind;
      if (startKind) {
        setKind(startKind);
        setType(entity?.type ?? initialType ?? "");
      }
      setTitle(entity?.title ?? "");
      setNotes(entity?.notes ?? "");
      setTags((entity?.tags ?? []).join(", "));
      setStatus(entity?.status === "inactive" ? "inactive" : "active");
      setAttributes({});
      setShowErrors(false);
      setTemplates(null);
      setTemplateError(null);
    }
    setOpen(next);
  }

  const template = templates?.find((item) => item.kind === kind && item.type === type);
  const fields: FieldDef[] = template?.fields ?? [];
  const editedFields = record ? fields.filter((field) => Object.hasOwn(attributes, field.name)) : fields;
  const drafts = { ...(record ? toDrafts(fields, record.attributes) : defaultDrafts(fields)), ...attributes };
  const errors = validateDrafts(editedFields, drafts, record?.attributes);
  const errorCount = Object.keys(errors).length;
  const types = templates?.filter((item) => item.kind === kind) ?? [];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!template) return;
    if (errorCount) {
      setShowErrors(true);
      toast.error(errorCount === 1 ? "One field needs attention." : `${errorCount} fields need attention.`);
      return;
    }
    await run(async () => { try {
      const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const values = { title, notes: notes || null, tags: tagList };
      const saved = record
        ? await api.updateEntity(workspaceId, record.id, record.version, {
            ...values,
            ...(editedFields.length ? { attributes: toAttributes(editedFields, attributes, record.attributes) } : {}),
            ...(status !== record.status ? { status } : {}),
          })
        : await api.createEntity(workspaceId, { ...values, kind, type, attributes: toAttributes(fields, drafts) });
      toast.success(record ? "Saved" : "Created");
      setOpen(false);
      onSaved(saved);
    } catch (error) {
      if (onConflict && errorCode(error) === "VERSION_CONFLICT") {
        toast.error("Someone else changed this record while you were editing. It has been reloaded; reapply your changes.");
        setOpen(false);
        onConflict();
        return;
      }
      toast.error(messageOf(error));
    } });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button className={recipes.join(recipes.pill.md, "px-5")}>{entity ? "Edit" : label ?? "New record"}</Button>} />
      <DialogContent className={recipes.dialog.form}>
        <DialogHeader>
          <DialogTitle>{record ? "Edit record" : "New record"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={save}>
          {!templates && !templateError && <LineSkeletons label="Loading record templates" />}
          {templateError && (
            <div className="grid gap-2">
              <p role="alert" className={recipes.notice.error}>Could not load templates. {templateError}</p>
              <Button type="button" variant="secondary" onClick={() => { setTemplateError(null); setAttempt((current) => current + 1); }}>Retry</Button>
            </div>
          )}
          {record && templates && !template && <p role="alert" className={recipes.notice.error}>This record’s template is unavailable.</p>}
          {!record && (
            <>
              <Label>Kind</Label>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((item) => (
                  <button key={item.id} type="button" aria-pressed={kind === item.id} className={recipes.chip({ on: kind === item.id, surface: "secondary" })} onClick={() => { setKind(item.id); setType(""); setAttributes({}); setShowErrors(false); }}>{item.singular}</button>
                ))}
              </div>
              <Label>Type</Label>
              <div className="flex flex-wrap gap-2">
                {types.map((item) => (
                  <button key={item.type} type="button" aria-pressed={type === item.type} className={recipes.chip({ on: type === item.type, tone: "ink", surface: "secondary" })} onClick={() => { setType(item.type); setAttributes({}); setShowErrors(false); }}>{item.type}</button>
                ))}
                {templates && types.length === 0 && <p className="text-sm text-muted-foreground">No template for this kind yet. An owner adds one under Ontology.</p>}
              </div>
            </>
          )}
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input id={`${id}-title`} required value={title} onChange={(event) => setTitle(event.target.value)} className={recipes.field.md} />
          {fields.map((field) => (
            <div key={field.name} className="grid gap-1.5">
              <Label htmlFor={`${id}-field-${field.name}`}>{field.name}{field.required ? " *" : ""}</Label>
              <FieldInput
                field={field}
                id={`${id}-field-${field.name}`}
                draft={Object.hasOwn(drafts, field.name) ? drafts[field.name] : ""}
                stored={record && Object.hasOwn(record.attributes, field.name) ? record.attributes[field.name] : undefined}
                workspaceId={workspaceId}
                error={showErrors ? errors[field.name] : undefined}
                onChange={(next) => setAttributes((current) => ({ ...current, [field.name]: next }))}
              />
            </div>
          ))}
          {record && (
            <>
              <Label>Status</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
                {(["active", "inactive"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={status === value} className={recipes.join(recipes.chip({ on: status === value, tone: "ink", surface: "secondary" }), "capitalize")} onClick={() => setStatus(value)}>{value}</button>
                ))}
              </div>
            </>
          )}
          <Label htmlFor={`${id}-notes`}>Notes</Label>
          <Textarea id={`${id}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 rounded-2xl" />
          <Label htmlFor={`${id}-tags`}>Tags</Label>
          <Input id={`${id}-tags`} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="comma separated" className={recipes.field.md} />
          <Button type="submit" disabled={busy || !template} className={recipes.pill.md}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
