/**
 * Template rules, mirroring the database (private.validate_fields and the type key
 * check on type_templates). The editor shows these errors before saving; the database
 * still decides.
 */
import { isEditable, validateDrafts, toDrafts } from "./fields";
import type { FieldDef } from "./model";
import { KINDS } from "./schema";

export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export const FIELD_TYPES: { id: string; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "select", label: "List" },
  { id: "multiselect", label: "Multi-list" },
  { id: "entity_ref", label: "Reference" },
];

const FIELD_KEYS = ["name", "dataType", "required", "options", "default", "entityRefKind"];
const hasOptions = (dataType: string) => dataType === "select" || dataType === "multiselect";

/** Whether the visual editor can show every part of these fields; otherwise use JSON. */
export function visuallyEditable(fields: unknown): fields is FieldDef[] {
  if (!Array.isArray(fields)) return false;
  return fields.every(
    (field) =>
      field !== null &&
      typeof field === "object" &&
      Object.keys(field).every((key) => FIELD_KEYS.includes(key)) &&
      FIELD_TYPES.some((type) => type.id === (field as FieldDef).dataType),
  );
}

/** Drop properties that do not apply to the field's type, as the database requires. */
export function normalizeField(field: FieldDef): FieldDef {
  const out: FieldDef = { name: field.name.trim(), dataType: field.dataType };
  if (field.required) out.required = true;
  if (hasOptions(field.dataType)) out.options = (field.options ?? []).map((option) => option.trim());
  if (field.dataType === "entity_ref" && field.entityRefKind) out.entityRefKind = field.entityRefKind;
  if (field.default !== undefined && field.default !== "" && !(Array.isArray(field.default) && field.default.length === 0)) out.default = field.default;
  return out;
}

export type TemplateErrors = { type?: string; fields: Record<number, Partial<Record<"name" | "options" | "default" | "entityRefKind", string>>> };

export function validateTemplate(type: string, fields: FieldDef[]): TemplateErrors {
  const errors: TemplateErrors = { fields: {} };
  if (!KEY_PATTERN.test(type.trim())) errors.type = "Lowercase letters, digits and underscores, starting with a letter";
  const seen = new Set<string>();
  fields.forEach((raw, index) => {
    const field = normalizeField(raw);
    const at: TemplateErrors["fields"][number] = {};
    if (!KEY_PATTERN.test(field.name)) at.name = "Lowercase letters, digits and underscores, starting with a letter";
    else if (seen.has(field.name)) at.name = "Another field already has this name";
    seen.add(field.name);
    if (hasOptions(field.dataType)) {
      const options = field.options ?? [];
      if (options.length === 0) at.options = "Add at least one option";
      else if (options.some((option) => option === "")) at.options = "Options cannot be blank";
      else if (new Set(options).size !== options.length) at.options = "Each option only once";
    }
    if (field.entityRefKind && !KINDS.some((kind) => kind.id === field.entityRefKind)) at.entityRefKind = "Unknown kind";
    if (field.default !== undefined && !at.options) {
      // A default must be a valid value for the field (entity references are checked by the database).
      const problem = isEditable(field, field.default)
        ? validateDrafts([{ ...field, required: false }], toDrafts([field], { [field.name]: field.default }))[field.name]
        : "Not a valid value for this type";
      if (problem) at.default = problem;
    }
    if (Object.keys(at).length) errors.fields[index] = at;
  });
  return errors;
}

export function hasErrors(errors: TemplateErrors) {
  return Boolean(errors.type) || Object.keys(errors.fields).length > 0;
}

/**
 * Whether stored attributes still fit a template (used by the preview to refuse a change
 * the database would refuse: unknown keys, missing required fields, invalid values).
 */
export function attributesFit(fields: FieldDef[], attributes: Record<string, unknown>) {
  const names = new Set(fields.map((field) => field.name));
  if (Object.keys(attributes).some((key) => !names.has(key))) return false;
  for (const field of fields) {
    const value = attributes[field.name];
    if (value === undefined) {
      if (field.required) return false;
      continue;
    }
    if (!isEditable(field, value)) return false;
    if (validateDrafts([field], toDrafts([field], attributes))[field.name]) return false;
  }
  return true;
}
