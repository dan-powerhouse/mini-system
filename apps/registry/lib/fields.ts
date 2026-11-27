/**
 * How template field values move between the record and the editor's drafts.
 * Field types are a registry: a type the screen does not know (or a value it cannot
 * represent as text) is "kept": shown read-only and sent back unchanged on save, so
 * editing a record never corrupts data the screen does not understand.
 */
import type { FieldDef } from "./model";

export type FieldDraft = string | string[];

const stringDraft = (value: unknown) => typeof value === "string" ? value : null;

const DRAFT_CONVERTERS: Record<string, (value: unknown) => FieldDraft | null> = {
  text: stringDraft,
  date: stringDraft,
  select: stringDraft,
  entity_ref: stringDraft,
  number: (value) => typeof value === "number" && Number.isFinite(value) ? String(value) : null,
  multiselect: (value) => Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : null,
};

export const KNOWN_FIELD_TYPES = Object.keys(DRAFT_CONVERTERS);

export function isKnownFieldType(dataType: string) {
  return Object.hasOwn(DRAFT_CONVERTERS, dataType);
}

function storedValue(attributes: Record<string, unknown>, name: string) {
  return Object.hasOwn(attributes, name) ? attributes[name] : undefined;
}

/**
 * Whether the editor can edit this field for this record. Unknown types and values
 * that do not fit their type are kept as they are.
 */
export function isEditable(field: FieldDef, value: unknown) {
  if (!isKnownFieldType(field.dataType)) return false;
  return value === undefined || value === null || DRAFT_CONVERTERS[field.dataType](value) !== null;
}

/** Editor drafts for the editable fields of a record. */
export function toDrafts(fields: FieldDef[], attributes: Record<string, unknown> = {}) {
  const drafts: Record<string, FieldDraft> = {};
  for (const field of fields) {
    const value = storedValue(attributes, field.name);
    if (value === undefined || value === null || !isEditable(field, value)) continue;
    drafts[field.name] = DRAFT_CONVERTERS[field.dataType](value) ?? "";
  }
  return drafts;
}

/**
 * Supply only changed drafts on edit. An empty string clears an optional scalar;
 * omitted drafts retain the exact stored value.
 */
export function toAttributes(fields: FieldDef[], drafts: Record<string, FieldDraft>, stored: Record<string, unknown> = {}) {
  const out = { ...stored };
  for (const field of fields) {
    if (!Object.hasOwn(drafts, field.name) || !isEditable(field, storedValue(stored, field.name))) continue;
    const draft = drafts[field.name];
    if (draft === "") {
      delete out[field.name];
    } else {
      out[field.name] = field.dataType === "number" ? Number(draft) : draft;
    }
  }
  return out;
}

/** A readable form of any stored attribute value. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : String(item))).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Drafts for template defaults; used to prefill a new record. */
export function defaultDrafts(fields: FieldDef[]) {
  const drafts: Record<string, FieldDraft> = {};
  for (const field of fields) {
    if (field.default === undefined || !isEditable(field, field.default)) continue;
    drafts[field.name] = DRAFT_CONVERTERS[field.dataType](field.default) ?? "";
  }
  return drafts;
}

/** Real calendar date in YYYY-MM-DD, the database's date rule. */
function isRealDate(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * Field errors to show before saving, mirroring the database's field rules
 * (private.field_ok). Kept fields are not checked; the database still checks everything.
 */
export function validateDrafts(fields: FieldDef[], drafts: Record<string, FieldDraft>, stored: Record<string, unknown> = {}) {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!isEditable(field, storedValue(stored, field.name))) continue;
    const draft = Object.hasOwn(drafts, field.name) ? drafts[field.name] : "";
    if (Array.isArray(draft)) {
      const unknown = draft.filter((item) => !field.options?.includes(item));
      if (unknown.length) errors[field.name] = `Not an option: ${unknown.join(", ")}`;
      else if (new Set(draft).size !== draft.length) errors[field.name] = "Each option only once";
      continue;
    }
    if (draft === "") {
      if (field.required) errors[field.name] = "Required";
      continue;
    }
    if (field.dataType === "number" && (!draft.trim() || !Number.isFinite(Number(draft)))) errors[field.name] = "Enter a number";
    if (field.dataType === "date" && !isRealDate(draft)) errors[field.name] = "Enter a real date";
    if (field.dataType === "select" && field.options && !field.options.includes(draft)) errors[field.name] = "Choose one of the options";
  }
  return errors;
}

/** Keep the template's option order so saved values are stable. */
export function toggleItem(items: string[], item: string, options: string[] = []) {
  const next = items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
  const order = (value: string) => (options.indexOf(value) === -1 ? Number.MAX_SAFE_INTEGER : options.indexOf(value));
  return next.sort((a, b) => order(a) - order(b));
}
