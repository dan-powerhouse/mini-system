/**
 * Lists the backend owns, read from the generated database types (supabase gen types),
 * not retyped here. A kind, status or role added by a migration shows up after the
 * types are regenerated; labels below only polish the ones we know.
 */
import { Constants, type Database } from "./database.types";

type Enums = Database["public"]["Enums"];
export type Kind = Enums["entity_kind"];
export type Status = Enums["entity_status"];
export type Role = Enums["workspace_role"];

/** "process_kind" → "Process kind". Fallback label for values without a curated one. */
export function humanize(value: string) {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const KIND_LABELS: Partial<Record<string, { label: string; singular: string }>> = {
  person: { label: "People", singular: "Person" },
  object: { label: "Objects", singular: "Object" },
  process_kind: { label: "Process kinds", singular: "Process kind" },
  agent: { label: "Agents", singular: "Agent" },
  app: { label: "Apps", singular: "App" },
};

export const KINDS: { id: Kind; label: string; singular: string }[] = Constants.public.Enums.entity_kind.map((id) => ({
  id,
  label: KIND_LABELS[id]?.label ?? `${humanize(id)}s`,
  singular: KIND_LABELS[id]?.singular ?? humanize(id),
}));

export const STATUSES: Status[] = [...Constants.public.Enums.entity_status];

/** Roles in order of authority, as the database lists them. */
export const ROLES: Role[] = [...Constants.public.Enums.workspace_role];

/** Roles an invitation may grant; ownership only moves by transfer. */
export const INVITABLE_ROLES: Role[] = ROLES.filter((role) => role !== "owner");

/** True when `role` is at least `minimum` (owner > admin > editor > viewer). */
export function roleAtLeast(role: Role | null | undefined, minimum: Role) {
  if (!role) return false;
  const rank = (value: Role) => ROLES.indexOf(value);
  return rank(role) !== -1 && rank(role) <= rank(minimum);
}
