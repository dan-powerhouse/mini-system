import { KINDS, humanize, roleAtLeast, type Kind, type Role, type Status } from "./schema";

// Kinds, statuses and roles come from the database enums (see ./schema).
export { KINDS, STATUSES, ROLES, INVITABLE_ROLES } from "./schema";
export type { Kind, Role, Status } from "./schema";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  stale_process_kind_days: number;
  created_at: string;
  updated_at: string;
};

/** Patch accepted by workspace_update (its keys are camelCase). */
export type WorkspacePatch = { name?: string; slug?: string; staleProcessKindDays?: number };

export type Member = {
  workspace_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  updated_at: string;
  email?: string;
};

export type FieldDef = {
  name: string;
  dataType: "text" | "number" | "date" | "select" | "multiselect" | "entity_ref" | string;
  required?: boolean;
  options?: string[];
  default?: unknown;
  entityRefKind?: Kind;
};

export type Template = {
  workspace_id: string;
  kind: Kind;
  type: string;
  fields: FieldDef[];
  version: number;
  updated_at: string;
  updated_by: string;
};

export type Predicate = {
  workspace_id: string;
  name: string;
  description: string;
  directed: boolean;
  from_kinds: Kind[];
  to_kinds: Kind[];
  symmetric_helper: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export type Entity = {
  id: string;
  workspace_id: string;
  kind: Kind;
  type: string;
  title: string;
  status: Status;
  attributes: Record<string, unknown>;
  notes: string | null;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export type Relation = {
  id: string;
  workspace_id: string;
  from_id: string;
  to_id: string;
  predicate: string;
  attributes: Record<string, unknown>;
  valid_from: string | null;
  valid_to: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export type AuditEvent = {
  id: string;
  workspace_id: string;
  action: string;
  actor_type: string;
  actor_id?: string | null;
  outcome: string;
  source: string;
  target_id: string | null;
  target_type: string | null;
  at: string;
  before?: unknown;
  after?: unknown;
  request_id: string;
  effective_user_id: string | null;
};

export type SavedView = {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  name: string;
  visibility: "personal" | "workspace";
  kind: Kind | null;
  query: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
};

export type TokenSummary = {
  id: string;
  workspace_id: string;
  user_id: string;
  label: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type SearchQuery = {
  q?: string;
  kind?: Kind;
  type?: string;
  status?: Status[];
  tagsAny?: string[];
  limit?: number;
  cursor?: string;
  sort?: { field: "title" | "createdAt" | "updatedAt"; direction: "asc" | "desc" };
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type Dashboard = {
  countsByKind: Record<string, number>;
  orphanCountsByKind: Record<string, number>;
  recentActivity: AuditEvent[];
  staleProcessKinds: Entity[];
  staleProcessKindDays: number;
};

export type EntityDetail = {
  entity: Entity;
  relations: { incoming: Relation[]; outgoing: Relation[] };
};

/** Dry-run result of import_preview (registry_exchange). */
export type ImportPreview = {
  previewId: string;
  entityRows: number;
  relationRows: number;
  validRows: number;
  errors: { file?: string; row?: number; field?: string; code?: string; message?: string }[];
  warnings?: unknown[];
  expiresAt?: string;
};

/** One ordered path from registry_path_report: records in order and the relations between them. */
export type PathRow = { entities: Entity[]; relations: Relation[] };
export type PathStep = { predicate: string; direction: "outgoing" | "incoming" | "either" };

export type SessionUser = { id: string; email: string };

export function canWrite(role: Role | null | undefined) {
  return roleAtLeast(role, "editor");
}

export function canAdmin(role: Role | null | undefined) {
  return roleAtLeast(role, "admin");
}

export function kindLabel(kind: string) {
  return KINDS.find((item) => item.id === kind)?.label ?? humanize(kind);
}

export function asEntity(value: unknown): Entity {
  const row = value as Entity;
  return {
    ...row,
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    tags: row.tags ?? [],
    notes: row.notes ?? null,
  };
}
