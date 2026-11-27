# mini system — Supabase technical contracts

Current technical specification for five Registry kinds and Supabase. This defines target behavior, not a declaration that all endpoints exist.

## 0. Binding architecture and adapter mapping

**Architecture:** Supabase is the backend; no separate application server is required. TypeScript interfaces below are logical wire/service shapes; SQL functions are their implementation, not a requirement to create a separate service class. Table names are singular, as in v0.2. RPC request/response objects preserve camelCase at the public adapter boundary; generated SQL types are snake_case. Use explicit DTO mapping; never expose hashes or system fields for mass assignment. Implementation presence is tracked in VALIDATION, not implied by this document.

- Human identity: verified Supabase JWT, `auth.uid()` plus current membership. Workspace supplied by caller is an untrusted selector, never identity. Public Data API exposes explicitly granted SELECTs protected by RLS; all domain mutations use narrow named RPCs. Unauthenticated roles have no domain grants. Views must use security_invoker. Private helpers have no public execution. Definer functions use a fixed search_path, schema-qualified objects, explicit authorization and least privilege; no broad service-role client in browser.
- Token identity: original opaque administrator-issued tokens remain supported for unattended clients; native OAuth delegated access is a separate production v0 requirement. Proposed implementation: Edge validates transport and passes opaque credential to a restricted database dispatcher (server-only execute grant); it hashes/looks up token in private storage, resolves current membership/scopes, locks relevant credential/member rows and uses shared internal write implementation. Do not accept actor, role or scopes from caller. Only privileged server code can call token dispatcher; no arbitrary SQL or user-impersonation endpoint. Agent/app identities may be linked for metadata, not permission. Agent/app credential lifecycle follows same role/scope rules. Supabase JWTs and opaque tokens are distinct; the function gateway must not mistake one for the other. Never disable JWT verification without full custom verification at handler boundary. Exact dispatcher and grant model must pass adversarial tests before activation.
- Every write is a transaction with workspace permission, dynamic validation, locks, optimistic compare-and-swap, mutation and audit. Initial implementation may serialize writes per workspace to avoid races; optimize only with equivalent proofs. Do not use separate HTTP requests as a transaction. No direct DML grant to ordinary clients, even editors. PostgREST reads are still bounded; canonical list/search/path RPC applies the common semantics. Audit and security records are never client-writable. Token revocation/member removal must be immediately effective; retain token history separately rather than deleting audit identity.
- API error mapping: stable codes listed in §4.3; translate at adapter or via deliberate PostgREST error SQLSTATE. Do not leak database internals. Permission-denied or missing records use same NOT_FOUND response when existence disclosure is a concern. RPC procedure catalog in §8 is a logical inventory: implement `entity.create` as `entity_create`, etc.; actual parameter names and grants are versioned by migrations/generated types and contract tests. RPCs receive workspace selector and logical operation input; no principal object from clients. Scope audit source/request ID is set by trusted boundary; human direct RPC uses server-assigned request ID. Private actor context must not be forgeable via caller-set GUC or JSON.
- MCP: Supabase official Edge template is a transport starting point, not automatic protocol/token compatibility. Pin actual modern SDK and validate Deno/Edge runtime; nine compatibility tools and three compatibility resources; expand approved business operations in §9. Preserve audit semantics (one successful mutation event per call, separate failure audit after rollback); define durable request coordination so lost response/retries do not produce fake success. Token failures use security log, not raw credentials. New domain tools are authorized in principle for production v0; exact operation contracts and legacy support require review. Public endpoint `/functions/v1/mcp` or approved alias.
- Invitations through Supabase Auth/SMTP or approved email provider; workspace acceptance still single-use and email-bound. Import/export through private Storage and authenticated Edge endpoints with expiring owner/workspace-bound staging; no direct public bucket or raw SQL import. Existing logical binary contracts remain; exact host paths may differ.
- Registry, Authority and Workspace use the same authoritative contracts as the custom MCP. Shared login and OAuth consent have separate hosting. Their stable origins are open. Execution remains separately gated. SQL is authoritative; optional Zod is only a transport/form helper. Supabase-managed PostgreSQL version must be confirmed. All current proposed defaults remain proposals in DECISIONS.md. Distinguish direct code test evidence from production configuration.

Official references: https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/ai-tools/byo-mcp ; https://supabase.com/docs/guides/local-development/testing/overview .

# 1. Domain contracts

## 1.1 Shared types

```ts
export type UUID = string;
export type ISODateTime = string; // RFC 3339 UTC timestamp
export type DateOnly = string;    // YYYY-MM-DD

export type EntityKind = "person" | "object" | "process_kind" | "agent" | "app";
export type EntityStatus = "active" | "inactive" | "archived";
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type TokenScope = "read" | "write";
export type ActorType = "user" | "token" | "system";
export type RequestSource = "ui" | "rpc" | "mcp" | "import" | "system";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;
```

JSON numbers must be finite. `NaN`, positive/negative infinity, `undefined`, functions, dates, and class instances are not valid JSON values.

## 1.2 Workspace and membership

Use workspace roles, workspace-configurable registries and explicit multi-workspace isolation.

```ts
export interface Workspace {
  id: UUID;
  name: string;
  slug: string;
  staleProcessKindDays: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface WorkspaceMember {
  workspaceId: UUID;
  userId: UUID;
  role: WorkspaceRole;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

A user may belong to multiple workspaces. Every workspace has exactly one `owner` in v1; ownership transfer is an explicit operation. All entities, relations, templates, predicates, saved views, tokens, and audit queries are scoped to one workspace. An MCP token is bound to exactly one workspace.

## 1.3 Entity

```ts
export interface Entity {
  id: UUID;
  workspaceId: UUID;
  kind: EntityKind;
  type: string;
  title: string;
  status: EntityStatus;
  attributes: JsonObject;
  notes: string | null;
  tags: string[];
  createdBy: UUID;
  updatedBy: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  version: number;
}
```

**Committed:** one `entity` table for all five kinds; `kind` is constrained to the five allowed values; `(kind,type)` uses a type template; attributes are JSONB; `version` supports optimistic locking; archive is a status, not physical deletion.

**Proposed defaults:**
- `kind` is immutable after creation.
- `type` can change only if the destination template exists and the complete resulting attributes validate against it.
- `version` starts at `1` and increments by exactly one for each successful entity mutation (including status and tag changes).
- `title` is trimmed and must not be empty. Proposed maximum: 300 Unicode characters.
- `type` and tag values are trimmed. Tags are case-insensitive for uniqueness and are stored in normalized lowercase form.
- `createdBy` and `updatedBy` always refer to the effective human user, including for token writes; token identity is retained separately in the audit record.
- `archived` is terminal in v1: no unarchive/restore operation is exposed.

## 1.4 Relation

```ts
export interface Relation {
  id: UUID;
  workspaceId: UUID;
  fromId: UUID;
  toId: UUID;
  predicate: string;
  attributes: JsonObject;
  validFrom: ISODateTime | null;
  validTo: ISODateTime | null;
  createdBy: UUID;
  updatedBy: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  version: number;
}
```

**Committed:** both endpoints are real foreign keys to `entity`; self-links are forbidden; predicate legality is registry-validated transactionally; `(from_id,predicate,to_id)` is unique; relation validity is temporal metadata.

**Proposed defaults:**
- One stored row per `(workspaceId, fromId, predicate, toId)` triple. A validity period is updated on that row; repeated historical episodes for the same triple are not represented as multiple rows in v1.
- `validTo > validFrom` when both are present.
- `directed: false` means the relationship is semantically traversable in either direction while remaining one stored row. The stored `fromId`/`toId` orientation remains the canonical display orientation.
- `symmetricHelper` is vocabulary/UX metadata only; it does not automatically create a reciprocal relation.
- Relation `version` and `updatedAt/updatedBy` are proposed refinements to make relation updates auditable and safe under concurrent editing.
- Relation endpoint and predicate changes are not supported by update; delete and recreate instead.

## 1.5 Type templates

```ts
export type TemplateFieldType =
  | "text" | "number" | "date" | "select" | "multiselect" | "entity_ref";

export interface TemplateField {
  name: string;
  dataType: TemplateFieldType;
  required?: boolean;
  options?: string[];
  default?: JsonValue;
  entityRefKind?: EntityKind;
}

export interface TypeTemplate {
  workspaceId: UUID;
  kind: EntityKind;
  type: string;
  version: number;
  fields: TemplateField[];
  updatedBy: UUID;
  updatedAt: ISODateTime;
}
```

Validation rules:

| Field type | Stored JSON value | Rule |
|---|---|---|
| `text` | string | No implicit coercion. |
| `number` | finite number | No numeric strings. |
| `date` | string | Must parse as a real calendar date in `YYYY-MM-DD` form. |
| `select` | string | Exact match to one configured option. |
| `multiselect` | string array | Every value must be an option; duplicates are rejected. |
| `entity_ref` | UUID string | Referenced entity must exist in the same workspace; optional `entityRefKind` must match its kind. |

Further rules:
- Field names are unique within a template and use a stable key format such as `snake_case`.
- `options` are permitted only for `select`/`multiselect`, must be non-empty, and must contain unique values.
- `default`, when present, must pass the field's own data-type validation.
- Missing required fields fail validation. A field explicitly present with `null` fails unless null support is deliberately added later.
- Unknown attribute keys are rejected (strict object schema).
- Defaults are applied on entity creation before validation. Existing records are not silently rewritten when a template changes.
- Template changes increment `version` and are audited. A change is rejected if it would make any existing entity of that `(kind,type)` invalid. This avoids introducing a data-migration subsystem in v1 while preventing schema drift.

## 1.6 Predicate definition

```ts
export interface PredicateDefinition {
  workspaceId: UUID;
  name: string;
  fromKinds: EntityKind[];
  toKinds: EntityKind[];
  directed: boolean;
  symmetricHelper: string | null;
  description: string;
  version: number;
  createdBy: UUID;
  updatedBy: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

- Predicate `name` is unique within a workspace.
- `fromKinds` and `toKinds` must each contain at least one valid `EntityKind`.
- `description` is included in MCP tool/resource descriptions so agents learn the workspace vocabulary.
- Predicate creation/update is admin-only. New predicates start at version 1; updates require `expectedVersion` and increment version exactly once.
- A predicate referenced by existing relations cannot be deleted.
- Updating kind compatibility is rejected if it would make any existing relation illegal.
- `symmetricHelper` must refer to another predicate in the same workspace when non-null; it is descriptive metadata, not an automatic write rule.

## 1.7 API token

```ts
export interface ApiTokenSummary {
  id: UUID;
  workspaceId: UUID;
  userId: UUID;       // effective user represented by this token
  label: string;
  prefix: string;     // non-secret identifier returned by authorized credential metadata tools
  scopes: TokenScope[];
  createdBy: UUID;    // admin who issued it
  createdAt: ISODateTime;
  lastUsedAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  revokedAt: ISODateTime | null;
}
```

The raw token is returned exactly once at issuance and is never stored, logged, audited, or shown again. The token is bound to one user and one workspace.

## 1.8 Audit entry

```ts
export interface AuditEntry {
  id: UUID;
  workspaceId: UUID;
  at: ISODateTime;
  actorType: ActorType;
  actorId: UUID | null;
  effectiveUserId: UUID | null;
  source: RequestSource;
  requestId: string;
  action: string;
  targetType: string | null;
  targetId: UUID | null;
  outcome: "success" | "failure";
  before: JsonValue | null;
  after: JsonValue | null;
  metadata: JsonObject;
}
```

Successful data mutations include before/after snapshots and are written atomically with the mutation. Every authenticated MCP call is audited: authenticated MCP tool calls, resource reads, and protocol operations (including discovery/list operations) therefore create an audit event with token identity, action, outcome, and request ID. Read/protocol events have null before/after snapshots. Invalid-token attempts, where no actor can be established, go to a separate security-event log and never include the submitted token.

---

# 2. Persistence contract

## 2.1 Tables

The SQL migrations must implement at least the following tables. Supabase Auth owns auth.users and sessions; do not duplicate those tables in application code.

| Table | Purpose / key columns |
|---|---|
| `workspace` | `id`, `name`, unique `slug`, `stale_process_kind_days`, timestamps |
| `workspace_member` | composite PK `(workspace_id,user_id)`, `role`, timestamps |
| `workspace_invitation` | workspace, email, role, hashed invite token, invited by, expiry, accepted/revoked timestamps |
| `entity` | all fields in §1.3; `UNIQUE(workspace_id,id)` for composite FKs |
| `process_kind_version` | Immutable published Process Kind standards; see §14. |
| `process` | Operational execution instances, not Registry entities; see §14. |
| `relation` | all fields in §1.4; unique triple and `UNIQUE(workspace_id,id)` |
| `predicate_registry` | all fields in §1.6; PK `(workspace_id,name)` |
| `type_templates` | workspace, kind, type, version, fields JSONB, updated metadata; PK `(workspace_id,kind,type)` |
| `api_token` | token hash, prefix, workspace/user, scopes, issuer, last-used, expiry, revocation |
| `audit_log` | append-only audit events in §1.8 |
| `security_event_log` | unauthenticated/security events that cannot be attributed to a known actor |
| `saved_view` | workspace/user, name, visibility, entity kind, validated search query JSONB, timestamps |
| `import_job` | dry-run/commit staging, source hash, validation report, staged payload or durable staging reference, expiry, state |
| `api_rate_bucket` | shared per-token rate-limit bucket/counter if rate limiting is implemented in PostgreSQL |

## 2.2 Required relational constraints

- `entity.kind` CHECK: `person`, `object`, `process_kind`, `agent`, `app`.
- `entity.status` CHECK: `active`, `inactive`, `archived`.
- `entity.version >= 1`.
- `UNIQUE(entity.workspace_id, entity.id)`.
- `relation` has composite FKs `(workspace_id,from_id)` and `(workspace_id,to_id)` to `entity(workspace_id,id)`; this prevents cross-workspace edges.
- `relation` has composite FK `(workspace_id,predicate)` to `predicate_registry(workspace_id,name)`.
- `UNIQUE(relation.workspace_id, relation.from_id, relation.predicate, relation.to_id)`.
- `CHECK(relation.from_id <> relation.to_id)`.
- `CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_to > valid_from)`.
- `UNIQUE(workspace_id,kind,type)` on the current template row.
- `predicate_registry.version >= 1`; update requires compare-and-swap against the current version.
- `api_token` references `(workspace_id,user_id)` in `workspace_member`; a removed member's tokens are revoked transactionally.
- `workspace_member.role` CHECK: `owner`, `admin`, `editor`, `viewer`.
- `api_token.scopes` contains `read`, optional `write`, and optional `manage`. `read` is mandatory; `manage` requires `write`, explicit issuance for a current owner/admin, and current owner/admin role at execution. Existing credentials never inherit it. `manage` currently permits only create-only template and predicate operations in the custom MCP.
- `saved_view` visibility CHECK: `personal` or `workspace`; includes `version >= 1`.
- `workspace_invitation` stores only a hash of the single-use invitation secret and has a unique active invitation per workspace/email.
- `import_job` states are `uploaded`, `previewed`, `committed`, `failed`, or `expired`; upload/preview ownership is `(workspace_id,user_id)`.
- `security_event_log` records `at`, nullable workspace/user/token references, request ID, event type, outcome, and safe metadata (never raw secrets).
- Audit rows are append-only for application roles: no UPDATE/DELETE grants on `audit_log`.

Kind/predicate compatibility requires a transaction because it spans entity rows and registry arrays. During relation creation, lock the predicate row `FOR SHARE` and read both endpoints in the same transaction. Predicate updates lock the predicate row `FOR UPDATE` and validate existing relations before commit. Since entity kind is immutable, endpoint-kind races are eliminated.

## 2.3 Index contract

At minimum:
- B-tree `(workspace_id, kind, status, updated_at DESC, id)` for entity lists.
- Partial indexes by `kind` for people, objects, process kinds, agents, and apps.
- B-tree `(workspace_id, type)` and `(workspace_id, status)` where query plans justify them.
- GIN on `entity.search_vector` for full-text search.
- GIN on `entity.attributes` (JSONB) for structured JSONB filters.
- GIN on `entity.tags` for tag filtering.
- B-tree `(workspace_id, from_id, predicate)` and `(workspace_id, to_id, predicate)` for relation panels/traversal.
- B-tree on `audit_log(workspace_id, target_type, target_id, at DESC)` and `(workspace_id, at DESC)`.
- Unique index on `api_token.token_hash`; indexes for workspace/user/revocation lookup.
- Rate-bucket index on `(token_id, window_start)`.

Use SQL views `people`, `objects`, `process_kinds`, `agents`, and `apps`; make them workspace-aware exposing only the corresponding kind, but continue to route application queries through the shared repositories/services.

## 2.4 Search vector

**Committed:** full-text search over title, notes, and attributes using a stored `tsvector` and GIN index; all list views and global search share one `searchService`.

**Proposed default:** use PostgreSQL `simple` text configuration for mixed-language content without assuming a single language's stemming rules. Weight title above notes above string values extracted from JSONB attributes. Keep the expression dependent only on the entity row (for example, title + notes + `jsonb_to_tsvector` over string values); do not query templates from a generated column. Also maintain a separate GIN JSONB index for structured filters.

---

# 3. Validation contract (SQL constraints and RPC validation; optional Zod v4 at adapters)

## 3.1 Shared schema modules

```text
supabase/functions/mcp/
  common.ts          // UUID, ISODateTime, JsonObject, pagination
  workspace.ts       // workspace/member/invitation inputs
  entity.ts          // Entity, create/update/bulk inputs
  relation.ts        // Relation inputs and validity
  template.ts        // template fields and attributes
  predicate.ts       // predicate definitions
  search.ts          // EntityListQuery, filters, sort, cursor
  traversal.ts       // traversal and path reports
  token.ts           // token issue/revoke inputs; never raw token persistence
  audit.ts           // read-only audit DTOs
  saved-view.ts      // saved query DTOs
  import-export.ts   // import/export contracts
  errors.ts          // ServiceError and ErrorEnvelope
```

MCP and authenticated application adapters may share transport shape schemas; authoritative validation is in SQL RPCs and constraints, including dynamic template checks. Generated database types do not replace validation.

## 3.2 Input normalization

- Trim title, type, predicate name, template field names, tag values, and user-facing labels.
- Reject blank strings after trimming.
- Normalize tags to lowercase, deduplicate them, and preserve deterministic sort order.
- Reject unknown object keys except where a schema explicitly uses passthrough metadata.
- Validate UUIDs and ISO timestamps strictly.
- Do not silently coerce strings to numbers, date strings to timestamps, or booleans to strings.
- Apply template defaults only on entity creation; on update, omitted fields retain existing values.

## 3.3 Validation order for writes

1. Authenticate and resolve workspace-scoped principal.
2. Check operation permission.
3. Parse transport input with static transport schema.
4. Load the current template/predicate and current entity state.
5. Build the complete resulting entity/relation state.
6. Validate dynamic template/predicate rules and cross-record references.
7. Check expected version and relational uniqueness.
8. Persist mutation and audit event in one transaction.

No adapter may skip steps 4–8.

---

# 4. Principal, errors, and result contracts

## 4.1 Principal

```ts
export interface Principal {
  workspaceId: UUID;
  actorType: "user" | "token";
  actorId: UUID;           // user ID for direct session; credential/client ID for MCP
  userId: UUID;            // effective user represented by the request
  role: WorkspaceRole;
  tokenScopes?: TokenScope[]; // only present for token principals
  requestId: string;
  source: RequestSource;
}
```

The principal is created by trusted auth middleware. Clients cannot provide their own role, scopes, `userId`, or actor ID.

## 4.2 Page and result types

```ts
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type ServiceResult<T> = T; // service failures throw ServiceError
```

Cursor tokens are opaque, signed or otherwise integrity-protected, bound to the workspace and normalized query, and include a deterministic tie-breaker. They expire after a configurable period (proposed default: 30 minutes).

## 4.3 Error codes

```ts
export type ServiceErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "ARCHIVED_ENTITY"
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_IN_USE"
  | "INVALID_PREDICATE"
  | "RELATION_KIND_MISMATCH"
  | "RELATION_ALREADY_EXISTS"
  | "INVALID_VALIDITY_RANGE"
  | "LAST_OWNER"
  | "INVITATION_EXPIRED"
  | "TOKEN_REVOKED"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "IMPORT_VALIDATION_FAILED"
  | "CURSOR_INVALID"
  | "INTERNAL_ERROR";

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  details?: JsonObject;
  retryable?: boolean;
}

export interface ErrorEnvelope {
  error: {
    code: ServiceErrorCode;
    message: string;
    details?: JsonObject;
    retryable?: boolean;
    requestId: string;
  };
}
```

Do not expose stack traces, SQL, token material, raw invitation values, secrets, or internal host/config details. `NOT_FOUND` should be used for both nonexistent and out-of-workspace records to avoid cross-workspace existence disclosure.

---

# 5. Core service contracts

All service methods take a trusted `Principal` except authentication/bootstrap methods. Public DTOs do not expose raw database rows or internal fields. The initial SQL RPCs return typed rows; the future adapter maps them to these DTOs.

## 5.1 Entity service

```ts
export interface CreateEntityInput {
  kind: EntityKind;
  type: string;
  title: string;
  status?: "active" | "inactive"; // defaults to active
  attributes?: JsonObject;
  notes?: string | null;
  tags?: string[];
}

export interface UpdateEntityInput {
  id: UUID;
  expectedVersion: number;
  type?: string;
  title?: string;
  status?: "active" | "inactive";
  attributes?: JsonObject; // complete replacement of attributes when supplied
  notes?: string | null;
  tags?: string[];
}

export interface EntityService {
  create(p: Principal, input: CreateEntityInput): Promise<Entity>;
  getById(p: Principal, id: UUID): Promise<Entity>;
  update(p: Principal, input: UpdateEntityInput): Promise<Entity>;
  archive(p: Principal, id: UUID, expectedVersion: number): Promise<Entity>;
}
```

Behavior:
- `create`: require registered template; apply defaults; validate attributes and entity refs; create version 1; set creator/updater; audit in same transaction.
- `getById`: return only a record in the principal's workspace; archived entities remain retrievable.
- `update`: PATCH semantics for top-level fields; when `attributes` is present it replaces the attributes object as a whole; validate the complete resulting record against its current template; require `expectedVersion`; increment version exactly once.
- `archive`: transition any non-archived entity to archived; reject stale version; keep relations intact; do not physically delete; audit in same transaction.
- Ordinary update cannot change `kind` or transition to `archived`; use `archive` for that transition.
- Archived entities cannot be edited. V1 has no restore operation.

## 5.2 Relation service

```ts
export interface CreateRelationInput {
  fromId: UUID;
  toId: UUID;
  predicate: string;
  attributes?: JsonObject;
  validFrom?: ISODateTime | null;
  validTo?: ISODateTime | null;
}

export interface UpdateRelationInput {
  id: UUID;
  expectedVersion: number;
  attributes?: JsonObject;
  validFrom?: ISODateTime | null;
  validTo?: ISODateTime | null;
}

export interface RelationService {
  create(p: Principal, input: CreateRelationInput): Promise<Relation>;
  update(p: Principal, input: UpdateRelationInput): Promise<Relation>;
  delete(p: Principal, id: UUID): Promise<void>;
  listForEntity(p: Principal, entityId: UUID): Promise<{
    outgoing: Relation[];
    incoming: Relation[];
  }>;
}
```

Behavior:
- Create requires both endpoints in the same workspace, rejects self-links, validates the predicate's allowed kinds in the same transaction, rejects archived endpoints, validates validity range, and enforces the unique triple.
- `directed:false` does not create a second row. Traversal treats the edge as traversable in both directions.
- Update permits only attributes and validity changes; it requires `expectedVersion` and increments relation version.
- Delete physically removes only the relation row, but writes a deletion audit event with the deleted row in `before`.
- Listing returns distinct incoming and outgoing rows without collapsing predicate/direction. A symmetric predicate may be surfaced as traversable from either side by traversal, but list orientation remains the persisted orientation.

## 5.3 Template service

```ts
export interface UpsertTemplateInput {
  kind: EntityKind;
  type: string;
  expectedVersion?: number; // absent only when creating the first version
  fields: TemplateField[];
}

export interface TemplateService {
  list(p: Principal, kind?: EntityKind): Promise<TypeTemplate[]>;
  get(p: Principal, kind: EntityKind, type: string): Promise<TypeTemplate>;
  upsert(p: Principal, input: UpsertTemplateInput): Promise<TypeTemplate>;
}
```

`upsert` is owner/admin only. Existing template updates require `expectedVersion`; it validates all existing entities of that `(kind,type)` against the candidate template before activation. Any invalidation fails with `CONFLICT` and a bounded list of entity IDs/field errors. Template deletion is not offered in v1; unused templates can be retained or marked deprecated in a later addition.

## 5.4 Predicate service

```ts
export interface UpsertPredicateInput {
  name: string;
  expectedVersion?: number; // absent only when creating the first version
  fromKinds: EntityKind[];
  toKinds: EntityKind[];
  directed: boolean;
  symmetricHelper?: string | null;
  description: string;
}

export interface PredicateService {
  list(p: Principal): Promise<PredicateDefinition[]>;
  get(p: Principal, name: string): Promise<PredicateDefinition>;
  upsert(p: Principal, input: UpsertPredicateInput): Promise<PredicateDefinition>;
  delete(p: Principal, name: string): Promise<void>;
}
```

`upsert` and `delete` are owner/admin only. New predicates start at version 1; every update requires `expectedVersion` and increments the version. An update that invalidates an existing edge is rejected. Delete is rejected while any relation uses the predicate. No implicit reciprocal edge creation is permitted.

## 5.5 Search/list service

```ts
export type AttributeOperator = "eq" | "contains" | "gt" | "gte" | "lt" | "lte";

export interface AttributeFilter {
  key: string;
  operator: AttributeOperator;
  value: JsonValue;
}

export interface EntityListQuery {
  q?: string;
  kind?: EntityKind;
  type?: string;
  status?: EntityStatus[];
  tagsAny?: string[];
  attributeFilters?: AttributeFilter[];
  limit?: number;
  cursor?: string;
  sort?: { field: "title" | "createdAt" | "updatedAt"; direction: "asc" | "desc" };
}

export interface SearchService {
  search(p: Principal, query: EntityListQuery): Promise<Page<Entity>>;
}
```

Search semantics:
- All filters are combined with AND, except `tagsAny`, whose values are ORed with each other.
- `q` performs PostgreSQL full-text search over title, notes, and string values in attributes.
- `eq` performs JSONB equality against the attribute value.
- `contains` means case-insensitive substring for string attributes, or element containment for JSON array attributes. It is invalid for numbers/objects.
- `gt/gte/lt/lte` require numeric JSON values on both sides.
- Unsupported attribute key/operator/value combinations return `VALIDATION_ERROR`, not a silent empty result.
- The default status set is `active` and `inactive`; archived records are included only when explicitly requested.
- Without `q`, default order is `updatedAt DESC, id DESC`. With `q`, default order is relevance DESC, then `updatedAt DESC, id DESC`.
- Cursors encode the final sort tuple and are invalid if reused with a different workspace/query/sort.
- Default limit 25, maximum 100. Counts are omitted from regular pages to avoid forcing expensive count queries.

## 5.6 Traversal and path reports

```ts
export interface TraverseInput {
  startId: UUID;
  predicates?: string[];
  direction?: "outgoing" | "incoming" | "both";
  depth: 1 | 2 | 3;
  maxNodes?: number;
}

export interface TraversalResult {
  start: Entity;
  nodes: Array<{ entity: Entity; depth: number }>;
  relations: Relation[];
  truncated: boolean;
}

export interface TraversalService {
  traverse(p: Principal, input: TraverseInput): Promise<TraversalResult>;
}
```

- Depth is 1–3; MCP cannot exceed 3. Named path report presets use 1–2.
- The start entity is returned separately and is not counted against the node cap.
- Nodes are unique by entity ID and retain their minimum discovered depth. Relations include the traversed edges; duplicate edges are removed by relation ID.
- `maxNodes` is clamped to 500. Reaching the limit sets `truncated: true`.
- `directed:false` predicates may be followed from either endpoint. Directed predicates respect the requested direction.
- Archived entities are not traversed by default; the start entity may be archived for inspection, but archived adjacent nodes are excluded.
- Every query is workspace-scoped and subject to read authorization.

The three named application path reports are query presets over this traversal contract, not a separate graph engine: “Process Kinds requiring this object”, “People owning objects required by this Process Kind”, and “Everything this person manages”. Their actual path pattern is resolved from the workspace's predicate definitions; if the necessary predicate is absent, the panel reports that it is not configured rather than guessing.

For ordered multi-hop reports, use a path-pattern query rather than treating the `predicates` filter as an ordered sequence:

```ts
export interface PathStep {
  predicate: string;
  direction: "outgoing" | "incoming" | "either";
}
export interface PathPatternInput {
  startId: UUID;
  steps: PathStep[]; // 1 or 2 steps for the named path report
  maxResults?: number;
}
export interface PathReportService {
  run(p: Principal, input: PathPatternInput): Promise<Array<{ entities: Entity[]; relations: Relation[] }>>;
}
```

The report preset defines an ordered sequence of predicate+direction steps. The service verifies that every predicate exists and that each step's endpoint kinds are legal. This preserves the named path reports without introducing a visual graph editor.

## 5.7 Audit service

```ts
export interface AuditQuery {
  targetType?: string;
  targetId?: UUID;
  actorUserId?: UUID;
  source?: RequestSource;
  actionPrefix?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditService {
  listForEntity(p: Principal, entityId: UUID, query?: Omit<AuditQuery, "targetId">): Promise<Page<AuditEntry>>;
  listRecent(p: Principal, query: AuditQuery): Promise<Page<AuditEntry>>;
}
```

Audit insertion is an internal repository operation that receives the active transaction from the mutation/request coordinator; it is not exposed as an arbitrary public service method. `listForEntity` powers History; `listRecent` powers dashboard activity. Audit rows are immutable.

## 5.8 Workspace and member services

```ts
export interface InvitationDeliveryPort {
  sendInvitation(input: { email: string; workspaceName: string; invitationUrl: string; expiresAt: ISODateTime }): Promise<void>;
}

export interface MemberService {
  list(p: Principal): Promise<WorkspaceMember[]>;
  invite(p: Principal, input: { email: string; role: "admin" | "editor" | "viewer" }): Promise<{ invitationId: UUID; expiresAt: ISODateTime }>;
  updateRole(p: Principal, input: { userId: UUID; role: Exclude<WorkspaceRole, "owner"> }): Promise<WorkspaceMember>;
  remove(p: Principal, userId: UUID): Promise<void>;
  transferOwnership(p: Principal, newOwnerUserId: UUID): Promise<void>;
  acceptInvitation(userId: UUID, invitationToken: string): Promise<WorkspaceMember>;
}

export interface WorkspaceService {
  createForUser(userId: UUID, input: { name: string; slug: string }): Promise<Workspace>;
  listForUser(userId: UUID): Promise<Workspace[]>;
  get(p: Principal): Promise<Workspace>;
  update(p: Principal, input: { name?: string; slug?: string; staleProcessKindDays?: number }): Promise<Workspace>;
}
```

- Only owner/admin may invite, change non-owner roles, or remove non-owner members.
- Only owner may transfer ownership. The existing owner becomes admin after successful transfer.
- An owner cannot be removed/demoted except through transfer; the workspace must always retain exactly one owner.
- Admin cannot assign the owner role.
- Removing a member revokes all their workspace tokens in the same transaction.
- Invitations are email-bound, single-use, stored hashed, expire after 7 days (proposed default), and are accepted only by an authenticated account with the matching email.
- The email delivery provider is not selected; implement an `InvitationDeliveryPort` and choose its concrete provider during deployment setup.

`WorkspaceService.get/update` supports workspace name, slug, and `staleProcessKindDays`. Owner/admin may update workspace settings. `staleProcessKindDays` defaults to 90 days (proposed default) and must be a positive integer. `createForUser` is the first-workspace bootstrap operation: it creates the workspace and its first `owner` membership atomically. Slugs are globally unique.

## 5.9 API token service

```ts
export interface TokenService {
  list(p: Principal, userId?: UUID): Promise<ApiTokenSummary[]>;
  issue(p: Principal, input: { userId: UUID; label: string; scopes: TokenScope[]; expiresAt?: ISODateTime | null }): Promise<{ token: string; summary: ApiTokenSummary }>;
  revoke(p: Principal, tokenId: UUID): Promise<void>;
}
```

- Only owner/admin may issue/revoke workspace tokens. An issued token belongs to a workspace member and represents that member's role.
- Every token includes `read`; `write` is optional. The opt-in `manage` scope requires `write` and is restricted to current owners/admins for create-only ontology setup. Effective permission is always the intersection of current member role and token scopes.
- Token value is generated with at least 256 bits of cryptographic randomness and shown once. Store only a one-way hash and a short public prefix.
- Authentication checks revoked/expiry state on each request so revocation is immediate. Do not rely on a long-lived token-auth cache.
- `lastUsedAt` updates on authenticated requests, throttled to at most once per minute per token.
- Revocation is idempotent.

## 5.10 Dashboard service

```ts
export interface DashboardSummary {
  countsByKind: Record<EntityKind, number>;
  recentActivity: AuditEntry[];
  orphanCountsByKind: Record<EntityKind, number>;
  staleProcessKinds: Entity[]; // oldest 20 by updatedAt; list is separately pageable if needed
  staleProcessKindDays: number;
}

export interface DashboardService {
  getSummary(p: Principal): Promise<DashboardSummary>;
}
```

Definitions:
- Counts include active and inactive entities, excluding archived.
- An orphan is a non-archived entity with no incoming or outgoing relations.
- A stale Process Kind definition is an active `process_kind` entity whose `updatedAt` is older than workspace `staleProcessKindDays`.
- Recent activity is successful data mutations plus any MCP events shown in the activity feed; Application reports may default-filter reads from the activity feed.
- Queries must be bounded and indexed; counts may be cached briefly only if freshness is documented. Default freshness target: 60 seconds.

## 5.11 Bulk entity operations

Support bulk tag and archive through bounded selection and server-validated confirmation. Expose these native RPC capabilities through the expanded application MCP after the reviewed preview/commit contract passes.

```ts
export interface BulkTagInput {
  items: Array<{ id: UUID; expectedVersion: number }>;
  mode: "add" | "remove" | "replace";
  tags: string[];
}

export interface BulkArchiveInput {
  items: Array<{ id: UUID; expectedVersion: number }>;
}

export interface BulkMutationResult {
  updated: Entity[];
}

export interface BulkEntityService {
  updateTags(p: Principal, input: BulkTagInput): Promise<BulkMutationResult>;
  archive(p: Principal, input: BulkArchiveInput): Promise<BulkMutationResult>;
}
```

Proposed limits/behavior: maximum 100 entities per request; operation is all-or-nothing; every item must be in the workspace and match its expected version for both tag and archive operations; lock rows in stable ID order; one audit row per entity changed. A stale/missing item fails the entire transaction and returns item-level error details.

## 5.12 Saved views (M4)

```ts
export interface SavedView {
  id: UUID;
  version: number;
  workspaceId: UUID;
  ownerUserId: UUID;
  name: string;
  visibility: "personal" | "workspace";
  kind: EntityKind | null;
  query: EntityListQuery;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

A saved view stores only a validated `EntityListQuery`; it never stores raw SQL. Expiring page cursors are not persisted. Personal view audit records are visible only to the actor who owns the view, preserving personal-view privacy. Personal views are visible to their owner. Workspace views are visible to all members. For personal views, only the ownerUserId may read/update/delete. For workspace views, all members may read; the creator may update/delete their own view, and owner/admin may manage any workspace view. Saved-view query execution always re-applies the caller's workspace and permissions. Updates require `expectedVersion` and increment `version`.

```ts
export interface SavedViewService {
  list(p: Principal, kind?: EntityKind): Promise<SavedView[]>;
  create(p: Principal, input: { name: string; visibility: "personal" | "workspace"; kind: EntityKind | null; query: EntityListQuery }): Promise<SavedView>;
  update(p: Principal, input: { id: UUID; expectedVersion: number; name?: string; visibility?: "personal" | "workspace"; query?: EntityListQuery }): Promise<SavedView>;
  delete(p: Principal, id: UUID): Promise<void>;
}
```

## 5.13 CSV import/export (M4)

**Proposed format:** a ZIP package containing `entities.csv`, `relations.csv`, and `manifest.json`. The manifest contains `formatVersion`, `exportedAt`, source workspace ID (informational only), row counts, and SHA-256 checksums.

`entities.csv` columns: `id,kind,type,title,status,attributes_json,notes,tags_json`. `relations.csv` columns: `id,from_id,to_id,predicate,attributes_json,valid_from,valid_to`. JSON-valued cells contain compact JSON. Actor IDs and timestamps are not imported; new rows are attributed to the importing user and server time. Templates and predicates are not included: they must already exist and be compatible in the destination workspace. Import never silently overwrites a same-ID record; an existing ID is a conflict, even if its payload appears identical. If users later require a single-file CSV, define a separate format version rather than overloading this one.

```ts
export interface ImportPreview {
  previewId: UUID;
  sourceHash: string;
  expiresAt: ISODateTime;
  entityRows: number;
  relationRows: number;
  validRows: number;
  errors: Array<{ file: string; row: number; field?: string; code: string; message: string }>;
  warnings: Array<{ file: string; row: number; message: string }>;
}

export interface UploadService {
  stageImportPackage(p: Principal, file: Uint8Array): Promise<{ uploadId: UUID; sha256: string; sizeBytes: number }>;
}

export interface ImportService {
  preview(p: Principal, uploadId: UUID): Promise<ImportPreview>;
  commit(p: Principal, previewId: UUID): Promise<{ entitiesCreated: number; relationsCreated: number }>;
}

export interface ExportService {
  create(p: Principal, input: { kinds?: EntityKind[]; includeArchived?: boolean }): Promise<{ exportId: UUID; expiresAt: ISODateTime }>;
  readDownload(p: Principal, exportId: UUID): Promise<Uint8Array>;
}
```

Because Data API/RPC is JSON-oriented, binary transfer uses authenticated Supabase Edge Functions rather than putting file bytes in JSON procedure inputs/outputs:

| Route | Contract |
|---|---|
| `POST /api/imports/upload` | Authenticated multipart upload; workspace membership + editor role required; returns `{ uploadId, sha256, sizeBytes }`; enforces file cap before parsing. |
| `GET /api/exports/{exportId}` | Authenticated download; export ID is workspace-bound and expires; streams the ZIP package. |

The upload route delegates to `UploadService.stageImportPackage`; Data API/RPC then calls `ImportService.preview` with the returned `uploadId`. `export.create` delegates to `ExportService.create`; the browser downloads the resulting export through the GET route. The Data API/RPC map therefore exposes metadata/control operations only and never base64-encodes large uploads or exports.

- Preview is side-effect free with respect to domain tables; it parses, validates templates, validates references, checks predicate compatibility, and reports duplicate/conflicting IDs.
- Commit accepts only a valid, unexpired preview created by the same workspace/user. It revalidates immediately before writing and is atomic in v1. Upload/preview records are single-use, expire after 30 minutes (proposed default), and are removed by a scheduled cleanup job.
- Import-created entities/relations use source `import` and are audited individually.
- Export includes only the caller's workspace. Archived entities are excluded by default.
- Proposed upload limit: 20 MiB; proposed row limit: 10,000 combined. Both are configurable and tested.

---

# 6. Authorization contract

## 6.1 Role matrix

Use workspace roles only (no per-entity ACL). The following action matrix makes those roles executable.

| Capability | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| Read entities, relations, templates, predicates, audit | Yes | Yes | Yes | Yes |
| Create/update/archive entities | Yes | Yes | Yes | No |
| Create/update/delete relations | Yes | Yes | Yes | No |
| Bulk tag/archive | Yes | Yes | Yes | No |
| Manage templates and predicates | Yes | Yes | No | No |
| Invite/manage non-owner members | Yes | Yes | No | No |
| Transfer ownership | Yes | No | No | No |
| Issue/revoke API tokens | Yes | Yes | No | No |
| Update workspace settings | Yes | Yes | No | No |
| Manage workspace-shared saved views | Yes | Yes | Yes (create/update own) | Read |
| View personal saved views | Own | Own | Own | Own |

## 6.2 Token permission intersection

- Direct human session: effective permission is workspace membership role. OAuth-delegated session: current membership role AND approved client/user/workspace grant AND operation capability; deny by default.
- Token request: effective permission is membership role AND token scopes.
- `read` scope permits reads only.
- `write` scope permits mutation only if the represented user's role is owner/admin/editor for that action.
- A viewer's `write` token remains read-only.
- Token permissions cannot exceed the represented user's current membership role. Role changes and member removal take effect on the next request.

## 6.3 Workspace isolation

Every repository query includes `workspace_id = principal.workspaceId`. Composite foreign keys prevent cross-workspace relations. Service tests must verify that guessing another workspace's UUID never reveals record existence. No per-entity ACL is implemented in v1.

---

# 7. Authentication and session contracts

- Supabase Auth handles human login, email magic links, passkeys, native OAuth/OIDC and session lifecycle. Google OAuth is optional; no provider enabled without review.
- The application auth adapter obtains the verified session user ID; it does not accept a user ID from request payload as proof of identity.
- Workspace context is selected by workspace slug/route or explicit active-workspace selection; membership and current role are revalidated on each request. Do not use an uninvalidated role cache.
- The authenticated Data API and SQL boundary resolve `Principal` from the authenticated session and selected workspace.
- MCP authentication supports the existing opaque bearer API token (workspace-bound; no tool argument can override it) and the planned native OAuth access-token path. OAuth workspace selection must be explicitly authorized and validated on each request.
- OAuth delegated MCP is required for production v0; verify access token issuer, audience/resource binding, expiry, client and session state. Do not accept ID tokens or bypass current grants. Dynamic client registration/CIMD and exact compatibility remain gated.
- Account deletion, account merge, Google identity conflict resolution, and email-provider choice beyond Supabase Auth requirements are deployment/product decisions.

---

# 8. Data API / RPC and application interface contracts

Procedure names below are the proposed stable API namespace. SQL constraints and RPC validation are authoritative; optional Zod v4 transport schemas may live under `supabase/functions/mcp/`. Every mutation calls a service in §5.

## 8.1 Procedure map

| Procedure | Input | Output | Permission / service |
|---|---|---|---|
| `workspace.create` | `{ name, slug }` | `Workspace` | Authenticated user; creates first owner membership |
| `workspace.listMine` | `{}` | `Workspace[]` | Authenticated; membership lookup |
| `workspace.getCurrent` | `{}` | `Workspace` | Any member |
| `workspace.update` | `{ name?, slug?, staleProcessKindDays? }` | `Workspace` | Owner/admin; workspace service |
| `member.list` | `{}` | `WorkspaceMember[]` | Owner/admin |
| `member.invite` | `{ email, role }` | `{ invitationId, expiresAt }` | Owner/admin |
| `member.updateRole` | `{ userId, role }` | `WorkspaceMember` | Owner/admin; cannot assign owner |
| `member.remove` | `{ userId }` | `{ success: true }` | Owner/admin; cannot remove owner |
| `member.transferOwnership` | `{ newOwnerUserId }` | `WorkspaceMember[]` | Owner only |
| `member.acceptInvitation` | `{ token }` | `WorkspaceMember` | Authenticated matching email |
| `token.list` | `{ userId? }` | `ApiTokenSummary[]` | Owner/admin |
| `token.issue` | `{ userId, label, scopes, expiresAt? }` | `{ token, summary }` | Owner/admin; token shown once |
| `token.revoke` | `{ tokenId }` | `{ success: true }` | Owner/admin |
| `entity.search` | `EntityListQuery` | `Page<Entity>` | Any member; search service |
| `entity.get` | `{ id }` | `{ entity, relations:{incoming,outgoing} }` | Any member |
| `entity.create` | `CreateEntityInput` | `Entity` | Owner/admin/editor |
| `entity.update` | `UpdateEntityInput` | `Entity` | Owner/admin/editor |
| `entity.archive` | `{ id, expectedVersion }` | `Entity` | Owner/admin/editor |
| `entity.bulkTag` | `BulkTagInput` | `BulkMutationResult` | Owner/admin/editor |
| `entity.bulkArchive` | `BulkArchiveInput` | `BulkMutationResult` | Owner/admin/editor |
| `relation.create` | `CreateRelationInput` | `Relation` | Owner/admin/editor |
| `relation.update` | `UpdateRelationInput` | `Relation` | Owner/admin/editor |
| `relation.delete` | `{ id }` | `{ success:true }` | Owner/admin/editor |
| `relation.listForEntity` | `{ entityId }` | `{ incoming, outgoing }` | Any member |
| `template.list` | `{ kind? }` | `TypeTemplate[]` | Any member |
| `template.get` | `{ kind, type }` | `TypeTemplate` | Any member |
| `template.upsert` | `UpsertTemplateInput` | `TypeTemplate` | Owner/admin |
| `predicate.list` | `{}` | `PredicateDefinition[]` | Any member |
| `predicate.get` | `{ name }` | `PredicateDefinition` | Any member |
| `predicate.upsert` | `UpsertPredicateInput` | `PredicateDefinition` | Owner/admin |
| `predicate.delete` | `{ name }` | `{ success:true }` | Owner/admin; only if unused |
| `traversal.run` | `TraverseInput` | `TraversalResult` | Any member |
| `dashboard.getSummary` | `{}` | `DashboardSummary` | Any member |
| `audit.forEntity` | `{ id, limit?, cursor? }` | `Page<AuditEntry>` | Any member |
| `audit.recent` | `AuditQuery` | `Page<AuditEntry>` | Any member for workspace activity; owner/admin for broader administrative filters |
| `savedView.list` | `{ kind? }` | `SavedView[]` | Any member |
| `savedView.create` | `{ name, visibility, kind, query }` | `SavedView` | Any member; ownerUserId is set from Principal |
| `savedView.update` | `{ id, expectedVersion, ...changes }` | `SavedView` | Creator or owner/admin |
| `savedView.delete` | `{ id }` | `{ success:true }` | Creator or owner/admin |
| `import.preview` | `{ uploadId }` | `ImportPreview` | Owner/admin/editor; M4; upload bytes arrive via route |
| `import.commit` | `{ previewId }` | import counts | Owner/admin/editor; M4 |
| `export.create` | `{ kinds?, includeArchived? }` | `{ exportId, expiresAt }` | Any member; M4; download via route |

Implementation note: the exact Data API/RPC file/router nesting may differ, but public procedure names and behavior must remain consistent. Use Data API/RPC's native error shape mapped from `ServiceError`; do not create a second business error model.

The current native binding for the procedure catalog is maintained in the [native API reference](NATIVE_API.md#native-api-binding-contracts-81). Clients consume native PostgREST reads or the named PostgreSQL RPC; no separate domain service in the frontend. Implementation presence and validation status are tracked in [VALIDATION](../VALIDATION.md).

## 8.2 Mini app, shared identity and MCP workflows

The Registry, Authority and Workspace surfaces are optional browser entry points for the same application. The custom MCP supports the authorized business flows independently. Shared login, enrollment, recovery and sign-out use native Supabase Auth. OAuth consent is hosted separately from login and both are independent of the mini apps. The current `apps/identity` package serves both authentication and consent routes. Stable production origins are open. Browser code uses publishable credentials only.

Registry provides records, ontology and relations. Workspace provides active workspace selection, saved views and role-aware administration. Authority presents pending actions for human decision. The operation-specific signature, expiry and signer policy must be approved before enabling these actions. The MCP may link to the human decision and read the outcome.

Dashboard, list, detail, administration, global search, saved views and exchange remain functional requirements. Preserve five-kind search, template-defined properties, status/type/tag/attribute filters, pagination, bulk operations, record detail, notes, related records and history, ordered path presets, workspace and ontology management, saved queries, import preview/commit and export. LLM output may render a useful report in its host; it is not a separate EntityGraph management frontend. Scope and permissions are unchanged. Use the native SQL/RPC implementations and the approved expanded tool contracts below.
### Authority signatures

Authority approval requires a WebAuthn assertion with user verification. The server issues a different challenge for each approval attempt. For the archive intent, the challenge binds the operation, request ID, workspace, target, expected version, signer, session, origin, nonce and expiry. The server derives those values from the authenticated session and stored request. The actor reviews the action before invoking WebAuthn in the top-level approval page. The verifier checks the challenge, origin, relying-party ID, registered credential and user verification.

The verifier returns the assertion and the fields needed to reconstruct the signed challenge. Before enabling an action, its execution transaction must lock the pending request, confirm the signer is still eligible and the registered credential is current, recheck the target version, consume the challenge once, execute the named operation and record the signature and result. A credential may have a zero sign counter, so request consumption is mandatory even when the verifier accepts a counterless assertion. Retain the public credential and the signed evidence needed for audit. Supabase login establishes the session. Its login challenge is separate from the Authority challenge.

The verifier in `apps/identity/lib/authority-signature.mjs` covers the archive intent. The request ledger and credential enrollment must be integrated and reviewed before enabling the signed workflow in Registry or MCP.

References: [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion), [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server/), [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html).

---

# 9. MCP contract

## 9.1 Protocol and transport

**Committed:** stateless HTTP endpoint at `/functions/v1/mcp` (custom-domain alias `/api/mcp` optional); MCP protocol revision `2026-07-28`; `server/discover`; cacheable `tools/list`; nine compatibility tools and three compatibility resources; reviewed expanded application catalog; bearer tokens; per-token rate limit default 60 requests/minute; payload caps; no session state.

Implementation contract:
- Use the official MCP TypeScript SDK v2 modern HTTP entry point (`createMcpHandler`) rather than hand-writing JSON-RPC/header dispatch.
- Pin the SDK version that supports `2026-07-28` and lock it in the package manager.
- Use modern-only mode (`legacy: "reject"`) unless backward compatibility with 2025-era clients is explicitly approved.
- SDK handles protocol framing and validation of the `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` headers against the request body. Do not duplicate that parser in the Edge handler.
- Modern requests are self-describing; no `initialize` handshake and no `Mcp-Session-Id` state. The request envelope is per-request `_meta`; client identity metadata is a SHOULD in the current SDK documentation, not an application authentication credential.
- Implement `server/discover` and advertise only capabilities actually implemented.
- `tools/list` and other cacheable list responses include `ttlMs` and `cacheScope`. Proposed `tools/list` cache hint: `ttlMs: 30000`, `cacheScope: "private"`. Backend services always revalidate; cached tool schemas are never authorization or data-validation boundaries.
- Apply Host/Origin validation at the HTTP edge when using a fetch-native handler. Never rely on CORS as authentication.
- Authenticate with `Authorization: Bearer <token>` on every MCP request, including list/discovery/resource requests,.
- Do not use sticky sessions or protocol-level session storage.

## 9.2 Authentication and request flow

```text
HTTP request
  -> Host/Origin + body-size checks
  -> SDK protocol/header validation
  -> opaque token lookup + hash verification OR verified OAuth access token with audience/session/client validation
  -> current scoped application grant for delegated requests
  -> resolve workspace member + current role + token scopes or client/user/workspace grant
  -> shared rate limit
  -> dispatch to core service / resource reader
  -> audit MCP request (including reads and protocol operations)
  -> SDK response
```

Invalid/missing/revoked/expired token: reject before service dispatch; write a security event without token value. No write is attempted.

## 9.3 Nine compatibility tools and expanded application catalog

The nine existing tools remain supported. Production v0 explicitly supersedes the former exactly-nine restriction. The additional groups in §9.8 are required at launch where in scope; exact tool signatures and allowlists must pass review and tests before deployment.

| Tool | Input contract | Output contract | Core service |
|---|---|---|---|
| `search_entities` | `EntityListQuery` | `Page<Entity>` | `SearchService.search` |
| `get_entity` | `{ id: UUID }` | `{ entity, relations:{incoming,outgoing} }` | entity + relation services |
| `create_entity` | `CreateEntityInput` | `{ entity: Entity }` | `EntityService.create` |
| `update_entity` | `UpdateEntityInput` incl. `expectedVersion` | `{ entity: Entity }` | `EntityService.update` |
| `archive_entity` | `{ id, expectedVersion }` | `{ entity: Entity }` | `EntityService.archive` |
| `create_relation` | `CreateRelationInput` | `{ relation: Relation }` | `RelationService.create` |
| `update_relation` | `UpdateRelationInput` incl. `expectedVersion` | `{ relation: Relation }` | `RelationService.update` |
| `delete_relation` | `{ id: UUID }` | `{ success: true }` | `RelationService.delete` |
| `traverse` | `TraverseInput` | `TraversalResult` | `TraversalService.traverse` |

Tool rules:
- `create_entity`/`update_entity` tool schemas may be enriched from current templates, but service-side validation remains authoritative.
- `update_entity` version conflict returns `VERSION_CONFLICT` and explicitly tells the agent to call `get_entity` again; never auto-retry or overwrite.
- `update_relation` uses `expectedVersion` (proposed consistency refinement).
- `traverse` rejects depth >3 and clamps node count to 500.
- Bulk tools may be added only through bounded existing atomic RPCs with preview/commit, exact versions, reauthorization and approved confirmation policy. No arbitrary batch or SQL bypass.
- A token with `read` only cannot call mutating tools; role and token scopes are intersected.

## 9.4 Three resources

| URI | Content | Authorization/audit |
|---|---|---|
| `entitygraph://entities/{id}` | Entity plus incoming/outgoing relations, same DTO as `get_entity` | Workspace read access; audited resource read |
| `entitygraph://predicates` | Current workspace predicate registry | Workspace read access; audited resource read |
| `entitygraph://templates/{kind}/{type}` | Current template fields/version | Workspace read access; audited resource read |

## 9.5 MCP audit rule

Every authenticated MCP RPC request creates exactly one audit event, including tool calls, resource reads, `server/discover`, `tools/list`, resource listing, and other implemented protocol methods. The event records the token ID as `actorId`, its owner as `effectiveUserId`, workspace ID, action/method, tool/resource name where relevant, request ID, outcome, and before/after snapshots for successful mutations. For a successful mutating tool call, the service's mutation audit row is the one request audit event; the adapter must not add a duplicate request-only event. Read/protocol requests are audited by the adapter. A failed tool call is audited as an outcome=`failure` event after any mutation transaction rolls back. Invalid authentication attempts are recorded in `security_event_log` because no verified token actor exists.

## 9.6 MCP security/rate limits

- Default: 60 requests per token per rolling minute.
- Rate limiting must be shared across application instances; do not use process-local counters in production. PostgreSQL atomic buckets are acceptable for v1; a managed shared limiter may replace them later.
- Proposed default maximum request body: 1 MiB, environment-configurable.
- `last_used_at` is updated at most once per minute.
- No raw tokens or Authorization headers in logs/traces/errors.
- Resource and tool results are workspace-scoped and permission-checked on every request.

## 9.7 Explicit MCP non-goals

Autonomous proposal/approval workflows, arbitrary batch-write bypass, Roots, Sampling, protocol-level Logging, unreviewed Dynamic Client Registration/CIMD, legacy HTTP+SSE, Tasks and MCP Apps are deferred. Native delegated OAuth is now in scope, with deny-by-default grants. Supabase management MCP, arbitrary SQL, generic RPC forwarding and infrastructure administration are never application tools.

## 9.8 Production v0 application tool expansion and LLM UX

The active catalog backlog is in [PRODUCTION_V0](PRODUCTION_V0.md#d-custom-mcp--application-tool-catalog). Map domain tools for context, entity lookup/changes, relationships, ontology, workspaces/members, identity, reports, audit, saved views, controlled bulk and file exchange, Process Kind standards and credential management to native RPCs or explicit authorized reads. Add only missing native operations. The nine compatibility tools and three resources above are already implemented; do not advertise proposed tools before they exist. Process execution tools remain independently gated.

Each tool must have a distinct business intent, descriptive name/title, strict input/output schema, examples and accurate annotations. Return bounded structured results, stable identifiers, versions, cursors and actionable validation/conflict errors. Resolve ambiguous names by returning candidates, never guessing IDs. Describe safe follow-up calls. Server validates roles, grant, input and versions on every call regardless of cached descriptions. Bind previews to actor/workspace/operation/exact inputs/expiry; high-impact confirmation must not be a model-supplied boolean. Keep raw secrets, SQL internals and unbounded records out of tool results. Treat imported and stored text as data, never instructions. Test with real LLM-client workflows and an independent SDK harness.

---

Development release v6 includes seven reviewed read-only application operations in addition to the nine compatibility tools: `get_context`, `list_templates`, `get_template`, `list_predicates`, `get_dashboard`, `run_path_report`, `list_saved_views`. See [MCP_APPLICATION](MCP_APPLICATION.md) for their bounded schemas and permissions. The three additional Golden Path tools are `create_template`, `create_predicate` and `get_entity_history`. The first two use native optimistic template/predicate RPCs with null expected version (creation only), require explicit `manage` plus `write`, and reject existing definitions. Entity history is bounded, workspace-scoped, read-only, uses the native signed audit cursor and returns event metadata/versions rather than raw snapshots. No existing credential gains new write privileges; delegated OAuth and worker access remain disabled.

# 10. Transaction, concurrency, and idempotency contracts

## 10.1 Entity transaction

In one PostgreSQL transaction:
1. Confirm the principal is still a workspace member and has permission.
2. Load/lock the relevant entity/template rows.
3. Validate input and resulting full entity state.
4. Compare `expectedVersion` when updating/archiving.
5. Insert/update entity and increment version.
6. Insert the audit event with before/after snapshots.
7. Commit.

If any step fails, neither entity nor successful-mutation audit row commits. For an authenticated MCP request that fails after token authentication, the adapter records the required `outcome: "failure"` MCP request audit event in a separate transaction after the mutation transaction has rolled back; this does not create a false successful mutation event.

## 10.2 Relation creation transaction

In one transaction:
1. Verify workspace permission.
2. Load both endpoints and predicate using workspace-qualified keys.
3. Lock predicate row for share and validate endpoint kinds.
4. Reject self-link, archived endpoints, invalid validity range, duplicate triple.
5. Insert relation and audit event.
6. Commit.

## 10.3 Relation update/delete transaction

- Update locks relation, compares `expectedVersion`, applies permitted fields, validates interval, increments version, and audits before/after atomically.
- Delete locks relation, deletes it, and audits the deleted record as `before` in the same transaction.

## 10.4 Bulk transaction

Bulk tag/archive is capped at 100 items, locks rows in deterministic ID order, validates every item, and is all-or-nothing. Each changed entity gets one audit record. No partial success response is permitted in v1.

## 10.5 Template/predicate administration transaction

Template upsert validates all current entities against the proposed field definition before activation. Predicate update validates all existing relations against the proposed allowed-kind arrays before activation. Registry changes and their audit entries commit atomically.

## 10.6 Optimistic concurrency

- Entity mutations require `expectedVersion`.
- Relation updates require `expectedVersion` (proposed refinement); delete retains the source ID-only contract and locks the row.
- A mismatch returns `VERSION_CONFLICT` and leaves rows/audit unchanged.
- Saved-view update also uses a version or `updatedAt` precondition; use `version` in the SQL migrations for consistency.
- Template and predicate updates use `expectedVersion`.

## 10.7 Idempotency

- Create operations are not inherently idempotent. The unique relation triple prevents duplicate edges; entity creation can accept an optional idempotency key through Data API/RPC/import if retry duplication becomes a concern.
- MCP tools do not expose batch writes. A network retry after an uncertain `create_entity` outcome may create a duplicate entity; document this behavior and consider an optional idempotency key only if client retry patterns require it.
- Token revocation and relation deletion are idempotent where possible (`NOT_FOUND`/success semantics must be consistent; recommended: deletion of an already absent relation returns `NOT_FOUND`).

---

# 11. Logging, security, and operations contracts

- Application logs contain request IDs, action names, workspace IDs, durations, and outcome; never include tokens, credentials, full Authorization headers, or secret invitation URLs.
- `audit_log` is append-only; ordinary application DB roles have INSERT/SELECT only, with restricted access to snapshots.
- Security-event logs cover invalid-token attempts, rate-limit violations, suspicious cross-workspace access, and authorization failures that need operational monitoring.
- All database connections use TLS in production; managed Postgres encryption-at-rest settings must be enabled.
- Validate Host/Origin for MCP endpoint requests; apply CSRF protections to cookie-authenticated Data API/RPC mutations.
- Use secure, HttpOnly, SameSite cookies as appropriate to Supabase Auth's supported configuration.
- Tokens are high-entropy random secrets, hash-only at rest, workspace-bound, scope-limited, expirable, and instantly revocable.
- Backups must have a tested restore drill. The app must have a documented migration rollback/forward strategy.
- All destructive changes (member removal, token revocation, relation deletion, bulk archive) require an explicit user decision through an approved Authority flow. The backend must verify that the decision binds the exact action. A model-generated confirmation flag cannot grant approval.
- Audit retention, privacy erasure obligations, and retention of archived entity data require a product/legal policy; this policy remains open. Do not silently purge audit data.

---

# 12. Error mapping

| Service error | Data API/RPC behavior | MCP behavior |
|---|---|---|
| `VALIDATION_ERROR` | BAD_REQUEST with field details | Tool-level error with stable code/details |
| `UNAUTHENTICATED` | UNAUTHORIZED | HTTP/auth rejection according to SDK/server integration |
| `FORBIDDEN` | FORBIDDEN | Tool-level error; no data disclosure |
| `NOT_FOUND` | NOT_FOUND | Tool/resource error; do not reveal cross-workspace existence |
| `VERSION_CONFLICT` | CONFLICT | Tool error instructing caller to re-read |
| `ARCHIVED_ENTITY` | CONFLICT | Tool error; archived records are read-only |
| `TEMPLATE_NOT_FOUND` | BAD_REQUEST/NOT_FOUND | Tool error; fetch templates |
| `TEMPLATE_IN_USE` | CONFLICT | Tool error; preserve referenced template |
| `INVALID_VALIDITY_RANGE` | BAD_REQUEST | Tool error; correct validity interval |
| `LAST_OWNER` | FORBIDDEN/CONFLICT | Tool error; transfer ownership first |
| `INVITATION_EXPIRED` | BAD_REQUEST | Not exposed through MCP |
| `TOKEN_REVOKED` | UNAUTHORIZED | Authentication rejection |
| `CURSOR_INVALID` | BAD_REQUEST | Tool error; restart search without cursor |
| `INVALID_PREDICATE` | BAD_REQUEST | Tool error; fetch predicate resource |
| `RELATION_KIND_MISMATCH` | BAD_REQUEST | Tool error; choose compatible endpoints/predicate |
| `RELATION_ALREADY_EXISTS` | CONFLICT | Tool error; fetch existing edge/update it |
| `RATE_LIMITED` | TOO_MANY_REQUESTS | Protocol/HTTP rate-limit response with retry hint where supported |
| `PAYLOAD_TOO_LARGE` | PAYLOAD_TOO_LARGE | HTTP payload rejection |
| `IMPORT_VALIDATION_FAILED` | BAD_REQUEST with preview report | Not exposed through MCP |
| `INTERNAL_ERROR` | INTERNAL_SERVER_ERROR | Internal error; stable request ID, no stack trace |

MCP adapter uses SDK-supported tool result/error conventions. Do not leak the Data API/RPC error object or internal exception into MCP content.

---

# 14. Process Kind publication and operational execution

A Process Kind is the Center's reusable standard, analogous to a versioned skill package. It is an entity of kind `process_kind`. A Process is an individual instantiation executed by an Edge. Many Processes can use the same standard; no Process is an entity, predicate endpoint, template reference target, Registry search result, export row or MCP Registry resource. No execution graph, workflow DAG or orchestration engine in scope now.

## 14.1 Storage contract

`process_kind_version` is keyed by `(workspace_id, process_kind_id, version)` and references a same-workspace entity whose kind is `process_kind`. It stores a private package path, SHA-256 digest, JSON specification, publication timestamp and publishing user. A published row is immutable, including deletion. The entity's ordinary version is not the standard's publication version. Publication will validate the package, ensure its stored bytes cannot be replaced under an existing version, and audit the action. A draft definition may be edited; existing executions never silently change standards.

`process` stores `id`, `workspace_id`, `process_kind_id`, `process_kind_version`, `requested_by`, `requested_by_kind`, optional `assigned_agent_id`, fixed `assigned_agent_kind`, optional `assigned_edge_id`, `status`, `priority`, `inputs`, `outputs`, `progress`, `attempt_count`, `max_attempts`, `idempotency_key`, `created_at`, `scheduled_at`, `started_at`, `heartbeat_at`, `completed_at`, `updated_at`, `error`, and optimistic `version`. Requester refers to a same-workspace person, agent or app; assignment refers to a same-workspace agent. An Edge identifier is opaque metadata until its identity/authorization contract is approved. Process standard, requester, identity and creation timestamp cannot change. Idempotency key is unique per workspace. Process IDs are not inserted into Registry entity rows. The two operational tables use RLS with no client policies or grants until audited authorization exists. The service-only publication RPC and disabled Edge adapter are now prepared and tested at the SQL/type-check level; client publication and execution table access remain denied.

## 14.2 Proposed execution behavior (not activated)

Statuses: created, queued, running, retry_waiting, succeeded, failed, cancelled. Priority 0–100 and progress 0–100; attempts nonnegative and bounded. Terminal states require completion timestamp; running, retry_waiting, succeeded and failed require a start timestamp and at least one attempt. Successful completion reports 100% progress. Retry waiting requires remaining attempts. These are structural checks; state transition RPCs and terminal-state invariants must be independently designed and tested before any worker access. Proposed sequence: created → queued → running → succeeded/failed/cancelled, or running → retry_waiting → queued for a further attempt of the same Process ID. Cancellation before start must also be supported. Failure is terminal after retries are exhausted; a failed attempt is not the same as a terminal failed Process. No automatic retries until approved.

After Registry completion, use Supabase Queues as a candidate transport carrying Process IDs, not authoritative status. Claim and state changes must be atomic or reconciled; add leases, fencing tokens, attempt history, crash recovery, duplicate-message handling and idempotent completion. Queue messages must not contain secrets or unrestricted payloads. Edge identity, authorization, artifact storage, retry/backoff and lease rules remain open; no actual workers, public execution endpoints or execution graph are activated. The installed private native PGMQ migration implements state/queue primitives and attempt history; activation remains subject to independent review. Separate execution APIs and views must be authorized, bounded and audited, not mixed into Registry MCP tools. Operational activity does not change Registry counts or definition review timestamps.

## 14.3 Prepared implementation (review candidate; not activated)

`process_kind_publish` and `process_kind_publications` are service-role-only publication RPCs. The disabled publication Edge adapter attests a validated archive's exact digest after a no-upsert Storage upload, passes a verified Auth principal, and does not overwrite/delete existing package bytes on replay or an ambiguous RPC result. The SQL layer serializes publication, checks current owner/admin membership and expected definition/publication revisions, and audits each new published version once. Generic archive safety validation is implemented; the Center's semantic package specification, authorized download/digest verification, orphan reconciliation and full Storage integration remain open.

The installed private migration `supabase/migrations/20261124202221_process_execution_private.sql` implements private state/queue primitives against native PGMQ: creation, dispatch, claim, heartbeat, finish, expire, cancel, reconcile. Private `process_request`, `process_delivery`, `process_attempt` and `process_event` preserve the original request digest, current queue message mapping, fenced lease history and operational audit. The candidate consumes the mapped native message atomically at claim, with a durable Process/attempt lease as the authoritative execution record; a crash is handled by explicit expiration/recovery, not automatic retry. Queue messages carry Process IDs only. Claims require a specific Process and opaque Edge label; they do not authenticate the Edge. Internal Center mutations check owner/admin membership; requester binding to the authenticated identity, worker credentials, routing/priority selection, lease bounds (candidate 1–3600 seconds), assignment/reassignment, package semantics and retry/backoff scheduling still require owner review. No application role (including service_role) can invoke these private operations or read their operational tables. No external worker, execution API, scheduler, artifact download or execution graph is activated. The deployed Registry's nine MCP tools and three resources remain the compatibility core; execution is not exposed.
