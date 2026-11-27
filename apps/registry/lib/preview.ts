import {
  asEntity,
  type AuditEvent,
  type Dashboard,
  type Entity,
  type EntityDetail,
  type Kind,
  type Member,
  type Page,
  type Predicate,
  type Relation,
  type Role,
  type SavedView,
  type SearchQuery,
  type SessionUser,
  type Status,
  type Template,
  type TokenSummary,
  type Workspace,
  KINDS,
  type WorkspacePatch,
  type PathRow,
  type PathStep,
} from "./model";
import { attributesFit, hasErrors, validateTemplate } from "./templates";
import { validateWorkspace } from "./workspace";

const ME = "11111111-1111-4111-8111-111111111111";
const HARBOR = "22222222-2222-4222-8222-222222222222";
const NORTH = "33333333-3333-4333-8333-333333333333";
const ADA = "44444444-4444-4444-8444-444444444441";
const JONAH = "44444444-4444-4444-8444-444444444442";
const PRESS = "44444444-4444-4444-8444-444444444443";
const BINDER = "44444444-4444-4444-8444-444444444444";
const REVIEW = "44444444-4444-4444-8444-444444444445";
const LUMEN = "44444444-4444-4444-8444-444444444446";
const ATLAS = "44444444-4444-4444-8444-444444444447";
const ROBOT = "44444444-4444-4444-8444-444444444448";
const SCOUT = "44444444-4444-4444-8444-444444444449";

const now = "2026-11-20T15:04:00.000Z";
const earlier = "2026-11-02T09:12:00.000Z";

function stamp(id: string, extra: Partial<Entity> & Pick<Entity, "kind" | "type" | "title">): Entity {
  return {
    id,
    workspace_id: HARBOR,
    status: "active",
    attributes: {},
    notes: null,
    tags: [],
    version: 1,
    created_at: earlier,
    updated_at: now,
    created_by: ME,
    updated_by: ME,
    ...extra,
  };
}

export function createPreviewDb() {
  const user: SessionUser = { id: ME, email: "ada@harbor.invalid" };
  const workspaces: Workspace[] = [
    {
      id: HARBOR,
      name: "Harbor",
      slug: "harbor",
      stale_process_kind_days: 90,
      created_at: earlier,
      updated_at: now,
    },
    {
      id: NORTH,
      name: "North line",
      slug: "north-line",
      stale_process_kind_days: 60,
      created_at: earlier,
      updated_at: earlier,
    },
  ];
  const members: Member[] = [
    { workspace_id: HARBOR, user_id: ME, role: "owner", created_at: earlier, updated_at: now, email: user.email },
    { workspace_id: NORTH, user_id: ME, role: "editor", created_at: earlier, updated_at: earlier, email: user.email },
    // A second sample member so the members screen has someone an owner can manage.
    { workspace_id: HARBOR, user_id: "11111111-1111-4111-8111-111111111112", role: "editor", created_at: earlier, updated_at: earlier, email: "jonah@harbor.invalid" },
  ];
  const templates: Template[] = [
    template("person", "employee", [{ name: "department", dataType: "text", required: true }, { name: "email", dataType: "text" }]),
    template("object", "equipment", [{ name: "serial_number", dataType: "text", required: true }, { name: "manufacturer", dataType: "text" }]),
    template("object", "document", [{ name: "format", dataType: "select", options: ["pdf", "markdown"], default: "markdown" }]),
    template("process_kind", "code_review", [{ name: "purpose", dataType: "text", required: true }]),
    template("agent", "research_agent", [{ name: "provider", dataType: "text", required: true }, { name: "model", dataType: "text" }]),
    // Agent subdivisions: LLM agents (internal, external) and machines.
    template("agent", "internal", [{ name: "team", dataType: "text" }, { name: "model", dataType: "text" }, { name: "skills", dataType: "multiselect", options: ["research", "writing", "coding", "review"] }]),
    template("agent", "external", [{ name: "provider", dataType: "text", required: true }, { name: "contract_end", dataType: "date" }]),
    template("agent", "machine", [
      { name: "serial_number", dataType: "text", required: true },
      { name: "manufacturer", dataType: "text" },
      { name: "location", dataType: "text" },
      { name: "capacity_per_hour", dataType: "number" },
      { name: "operator", dataType: "entity_ref", entityRefKind: "person" },
      { name: "last_service", dataType: "date" },
      { name: "mode", dataType: "select", options: ["manual", "assisted", "autonomous"], default: "assisted" },
    ]),
    template("app", "api", [{ name: "endpoint", dataType: "text" }, { name: "authentication_type", dataType: "select", options: ["none", "oauth", "key"] }]),
  ];
  const predicates: Predicate[] = [
    predicate("owns", "Custody of a thing.", true, ["person"], ["object", "app"]),
    predicate("uses", "Relies on a tool or record.", true, ["agent", "process_kind"], ["app", "object"]),
    predicate("requires", "A standard needs this.", true, ["process_kind"], ["object", "app"]),
    predicate("reports_to", "Reporting line.", true, ["person", "agent"], ["person"]),
  ];
  const entities: Entity[] = [
    stamp(ADA, { kind: "person", type: "employee", title: "Ada Meridian", attributes: { department: "Registry", email: "ada@harbor.invalid" }, tags: ["center"], notes: "Keeps the Harbor ontology honest." }),
    stamp(JONAH, { kind: "person", type: "employee", title: "Jonah Hale", attributes: { department: "Field", email: "jonah@harbor.invalid" }, tags: ["field"] }),
    stamp(PRESS, { kind: "object", type: "equipment", title: "Cedar press", attributes: { serial_number: "CD-204", manufacturer: "Cedar" }, tags: ["shop"] }),
    stamp(BINDER, { kind: "object", type: "document", title: "Spec binder", attributes: { format: "markdown" }, tags: ["spec"] }),
    stamp(REVIEW, { kind: "process_kind", type: "code_review", title: "Release review", attributes: { purpose: "Check a release before it leaves the shop." }, tags: ["standard"] }),
    stamp(ROBOT, { kind: "agent", type: "machine", title: "Line robot 7", attributes: { serial_number: "LR7-0091", manufacturer: "Kestrel", location: "Shop floor" }, tags: ["shop"], notes: "Packs finished orders. A machine that does work, not a tool on a shelf." }),
    stamp(SCOUT, { kind: "agent", type: "external", title: "Scout", attributes: { provider: "Vendor Co" }, tags: ["assistant"] }),
    stamp(LUMEN, { kind: "agent", type: "research_agent", title: "Lumen", attributes: { provider: "Example", model: "lumen-1" }, tags: ["assistant"], notes: "Describes research. It is not a login." }),
    stamp(ATLAS, { kind: "app", type: "api", title: "Atlas API", attributes: { endpoint: "https://atlas.invalid", authentication_type: "oauth" }, tags: ["platform"] }),
  ];
  const relations: Relation[] = [
    edge("55555555-5555-4555-8555-555555555551", ADA, PRESS, "owns"),
    edge("55555555-5555-4555-8555-555555555552", LUMEN, ATLAS, "uses"),
    edge("55555555-5555-4555-8555-555555555553", REVIEW, ATLAS, "requires"),
    edge("55555555-5555-4555-8555-555555555554", JONAH, ADA, "reports_to"),
  ];
  const audits: AuditEvent[] = [
    audit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "entity.create", ADA, "Ada Meridian"),
    audit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "relation.create", PRESS, "owns"),
    audit("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "entity.update", LUMEN, "Lumen"),
  ];
  const views: SavedView[] = [
    {
      id: "66666666-6666-4666-8666-666666666661",
      workspace_id: HARBOR,
      owner_user_id: ME,
      name: "Active people",
      visibility: "workspace",
      kind: "person",
      query: { kind: "person", status: ["active"] },
      version: 1,
      created_at: earlier,
      updated_at: now,
    },
  ];
  const tokens: TokenSummary[] = [
    {
      id: "77777777-7777-4777-8777-777777777771",
      workspace_id: HARBOR,
      user_id: ME,
      label: "Desk reader",
      prefix: "egt_a1b2c3d4",
      scopes: ["read"],
      created_at: earlier,
      expires_at: null,
      revoked_at: null,
      last_used_at: now,
    },
  ];
  const links: { id: string; workspace_id: string; user_id: string; person_id: string }[] = [
    { id: "88888888-8888-4888-8888-888888888881", workspace_id: HARBOR, user_id: ME, person_id: ADA },
  ];
  return { user, workspaces, members, templates, predicates, entities, relations, audits, views, tokens, links };
}

type DB = ReturnType<typeof createPreviewDb>;

export class PreviewRegistry {
  db: DB;
  constructor(db: DB = createPreviewDb()) {
    this.db = db;
  }

  workspaces() {
    return [...this.db.workspaces].sort((a, b) => a.name.localeCompare(b.name));
  }

  membership(workspaceId: string, _userId?: string) {
    return this.db.members.find((member) => member.workspace_id === workspaceId && member.user_id === this.db.user.id) ?? null;
  }

  acceptInvitation(_token: string): never {
    throw new Error("NOT_FOUND");
  }

  downloadExport(_exportId: string): never {
    throw new Error("The export edge function is disabled in preview.");
  }

  importZip(_workspaceId: string, _file: File): never {
    throw new Error("The import edge function is disabled in preview.");
  }

  importPreview(_workspaceId: string, _uploadId: string): never {
    throw new Error("NOT_FOUND");
  }

  importCommit(_workspaceId: string, _previewId: string): never {
    throw new Error("NOT_FOUND");
  }

  members(workspaceId: string) {
    const role = this.membership(workspaceId)?.role;
    const rows = this.db.members.filter((member) => member.workspace_id === workspaceId);
    if (role === "owner" || role === "admin") return rows;
    return rows.filter((member) => member.user_id === this.db.user.id);
  }

  createWorkspace(name: string, slug: string) {
    this.requireSession();
    const clean = slug.trim().toLowerCase();
    if (name.trim().length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
      throw new Error("VALIDATION_ERROR: workspace");
    }
    if (this.db.workspaces.some((workspace) => workspace.slug === clean)) throw new Error("CONFLICT: slug");
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: name.trim(),
      slug: clean,
      stale_process_kind_days: 90,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.db.workspaces.unshift(workspace);
    this.db.members.push({
      workspace_id: workspace.id,
      user_id: this.db.user.id,
      role: "owner",
      email: this.db.user.email,
      created_at: workspace.created_at,
      updated_at: workspace.updated_at,
    });
    return workspace;
  }

  updateWorkspace(workspaceId: string, patch: WorkspacePatch) {
    this.requireAdmin(workspaceId);
    const workspace = this.mustWorkspace(workspaceId);
    // Same rules as workspace_update and the workspace table checks.
    const problems = validateWorkspace({ name: patch.name ?? workspace.name, slug: patch.slug ?? workspace.slug, days: patch.staleProcessKindDays ?? workspace.stale_process_kind_days });
    if (Object.keys(problems).length) throw new Error("VALIDATION_ERROR: workspace");
    if (patch.slug && this.db.workspaces.some((row) => row.id !== workspaceId && row.slug === patch.slug!.trim())) throw new Error("CONFLICT: slug");
    if (patch.name !== undefined) workspace.name = patch.name.trim();
    if (patch.slug !== undefined) workspace.slug = patch.slug.trim();
    if (patch.staleProcessKindDays !== undefined) workspace.stale_process_kind_days = patch.staleProcessKindDays;
    workspace.updated_at = new Date().toISOString();
    return workspace;
  }

  invite(workspaceId: string, email: string, role: Role) {
    this.requireAdmin(workspaceId);
    if (role === "owner" || !email.includes("@")) throw new Error("VALIDATION_ERROR: invitation");
    return { invitationId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), token: `egi_${"ab".repeat(32)}` };
  }

  updateRole(workspaceId: string, userId: string, role: Role) {
    this.requireAdmin(workspaceId);
    const member = this.db.members.find((row) => row.workspace_id === workspaceId && row.user_id === userId);
    if (!member) throw new Error("NOT_FOUND");
    if (member.role === "owner" || role === "owner") throw new Error("FORBIDDEN");
    member.role = role;
    member.updated_at = new Date().toISOString();
    return member;
  }

  removeMember(workspaceId: string, userId: string) {
    this.requireAdmin(workspaceId);
    const index = this.db.members.findIndex((row) => row.workspace_id === workspaceId && row.user_id === userId);
    if (index < 0) throw new Error("NOT_FOUND");
    if (this.db.members[index].role === "owner") throw new Error("FORBIDDEN");
    // Like member_remove: the member's tokens for this workspace are revoked too.
    for (const token of this.db.tokens) if (token.workspace_id === workspaceId && token.user_id === userId && !token.revoked_at) token.revoked_at = new Date().toISOString();
    this.db.members.splice(index, 1);
  }

  /** Like member_transfer_owner: only the owner may transfer; the old owner becomes an admin. */
  transferOwner(workspaceId: string, userId: string) {
    this.requireAdmin(workspaceId);
    const me = this.db.members.find((row) => row.workspace_id === workspaceId && row.user_id === this.db.user.id);
    if (me?.role !== "owner") throw new Error("FORBIDDEN");
    const next = this.db.members.find((row) => row.workspace_id === workspaceId && row.user_id === userId);
    if (!next) throw new Error("NOT_FOUND");
    if (userId === this.db.user.id) return;
    const at = new Date().toISOString();
    me.role = "admin";
    me.updated_at = at;
    next.role = "owner";
    next.updated_at = at;
    this.pushAudit(workspaceId, "member.transfer_owner", userId, "workspace_member", { owner: userId });
  }

  search(workspaceId: string, query: SearchQuery): Page<Entity> {
    this.mustMember(workspaceId);
    const limit = query.limit ?? 25;
    const offset = query.cursor ? Number(query.cursor) : 0;
    let rows = this.db.entities.filter((entity) => entity.workspace_id === workspaceId);
    if (query.kind) rows = rows.filter((entity) => entity.kind === query.kind);
    if (query.type) rows = rows.filter((entity) => entity.type === query.type);
    if (query.status?.length) rows = rows.filter((entity) => query.status!.includes(entity.status));
    if (query.q) {
      const q = query.q.toLowerCase();
      rows = rows.filter((entity) => entity.title.toLowerCase().includes(q) || entity.tags.some((tag) => tag.includes(q)) || (entity.notes ?? "").toLowerCase().includes(q));
    }
    if (query.tagsAny?.length) rows = rows.filter((entity) => query.tagsAny!.some((tag) => entity.tags.includes(tag.toLowerCase())));
    const field = query.sort?.field ?? "updatedAt";
    const dir = query.sort?.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const left = field === "title" ? a.title : field === "createdAt" ? a.created_at : a.updated_at;
      const right = field === "title" ? b.title : field === "createdAt" ? b.created_at : b.updated_at;
      return left < right ? -dir : left > right ? dir : 0;
    });
    const slice = rows.slice(offset, offset + limit);
    const next = offset + limit < rows.length ? String(offset + limit) : null;
    return { items: slice.map(asEntity), nextCursor: next };
  }

  getEntity(workspaceId: string, id: string): EntityDetail {
    this.mustMember(workspaceId);
    const entity = this.db.entities.find((row) => row.workspace_id === workspaceId && row.id === id);
    if (!entity) throw new Error("NOT_FOUND");
    return {
      entity: asEntity(entity),
      relations: {
        incoming: this.db.relations.filter((relation) => relation.workspace_id === workspaceId && relation.to_id === id),
        outgoing: this.db.relations.filter((relation) => relation.workspace_id === workspaceId && relation.from_id === id),
      },
    };
  }

  createEntity(workspaceId: string, input: Record<string, unknown>) {
    this.requireWrite(workspaceId);
    const kind = String(input.kind ?? "") as Kind;
    const type = String(input.type ?? "").trim();
    const title = String(input.title ?? "").trim();
    const tmpl = this.db.templates.find((row) => row.workspace_id === workspaceId && row.kind === kind && row.type === type);
    if (!tmpl || !title) throw new Error("VALIDATION_ERROR: entity input");
    const attributes = { ...(input.attributes as Record<string, unknown> | undefined) };
    for (const field of tmpl.fields) {
      if (attributes[field.name] == null && field.default != null) attributes[field.name] = field.default;
      if (field.required && (attributes[field.name] == null || attributes[field.name] === "")) {
        throw new Error(`VALIDATION_ERROR: missing ${field.name}`);
      }
    }
    const entity = stamp(crypto.randomUUID(), {
      workspace_id: workspaceId,
      kind,
      type,
      title,
      status: (input.status as Status) || "active",
      attributes,
      notes: (input.notes as string | null) ?? null,
      tags: normalizeTags(input.tags),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this.db.entities.unshift(entity);
    this.pushAudit(workspaceId, "entity.create", entity.id, "entity", { title: entity.title });
    return entity;
  }

  updateEntity(workspaceId: string, id: string, version: number, patch: Record<string, unknown>) {
    this.requireWrite(workspaceId);
    const entity = this.mustEntity(workspaceId, id);
    if (entity.status === "archived") throw new Error("ARCHIVED_ENTITY");
    if (entity.version !== version) throw new Error("VERSION_CONFLICT");
    if (typeof patch.title === "string") entity.title = patch.title.trim();
    if (typeof patch.type === "string") entity.type = patch.type;
    if (typeof patch.status === "string") entity.status = patch.status as Status;
    if (patch.notes === null || typeof patch.notes === "string") entity.notes = patch.notes as string | null;
    // Like entity_update: the patch's attributes replace the stored ones.
    if (patch.attributes && typeof patch.attributes === "object") entity.attributes = { ...(patch.attributes as Record<string, unknown>) };
    if (patch.tags) entity.tags = normalizeTags(patch.tags);
    entity.version += 1;
    entity.updated_at = new Date().toISOString();
    this.pushAudit(workspaceId, "entity.update", entity.id, "entity", { title: entity.title, version: entity.version });
    return asEntity(entity);
  }

  archiveEntity(workspaceId: string, id: string, version: number) {
    this.requireWrite(workspaceId);
    const row = this.mustEntity(workspaceId, id);
    if (row.status === "archived") throw new Error("ARCHIVED_ENTITY");
    if (row.version !== version) throw new Error("VERSION_CONFLICT");
    row.status = "archived";
    row.version += 1;
    row.updated_at = new Date().toISOString();
    this.pushAudit(workspaceId, "entity.archive", row.id, "entity", { title: row.title, version: row.version });
    return asEntity(row);
  }

  templates(workspaceId: string) {
    this.mustMember(workspaceId);
    return this.db.templates.filter((row) => row.workspace_id === workspaceId);
  }

  upsertTemplate(workspaceId: string, kind: Kind, type: string, fields: unknown, expected?: number) {
    this.requireAdmin(workspaceId);
    const existing = this.db.templates.find((row) => row.workspace_id === workspaceId && row.kind === kind && row.type === type);
    // Same rules as template_upsert: valid fields, exact expected version, no stranded records.
    const list = fields as Template["fields"];
    if (hasErrors(validateTemplate(type, list))) throw new Error("VALIDATION_ERROR: invalid template fields");
    if (existing && expected !== existing.version) throw new Error("VERSION_CONFLICT");
    if (!existing && expected != null) throw new Error("VERSION_CONFLICT");
    if (existing && this.db.entities.some((row) => row.workspace_id === workspaceId && row.kind === kind && row.type === type && !attributesFit(list, row.attributes))) {
      throw new Error("CONFLICT: template would invalidate existing entity");
    }
    if (existing) {
      existing.fields = fields as Template["fields"];
      existing.version += 1;
      existing.updated_at = new Date().toISOString();
      return existing;
    }
    const created = template(kind, type, fields as Template["fields"], workspaceId);
    this.db.templates.push(created);
    return created;
  }

  predicates(workspaceId: string) {
    this.mustMember(workspaceId);
    return this.db.predicates.filter((row) => row.workspace_id === workspaceId);
  }

  upsertPredicate(input: Omit<Predicate, "created_at" | "updated_at" | "created_by" | "updated_by" | "version" | "symmetric_helper"> & { symmetric_helper?: string | null; expected?: number }) {
    this.requireAdmin(input.workspace_id);
    const existing = this.db.predicates.find((row) => row.workspace_id === input.workspace_id && row.name === input.name);
    if (existing && input.expected != null && existing.version !== input.expected) throw new Error("VERSION_CONFLICT");
    if (existing) {
      Object.assign(existing, input, { version: existing.version + 1, updated_at: new Date().toISOString() });
      return existing;
    }
    const created = predicate(input.name, input.description, input.directed, input.from_kinds, input.to_kinds, input.workspace_id);
    this.db.predicates.push(created);
    return created;
  }

  deletePredicate(workspaceId: string, name: string) {
    this.requireAdmin(workspaceId);
    if (this.db.relations.some((relation) => relation.workspace_id === workspaceId && relation.predicate === name)) {
      throw new Error("CONFLICT: predicate in use");
    }
    this.db.predicates = this.db.predicates.filter((row) => !(row.workspace_id === workspaceId && row.name === name));
  }

  createRelation(workspaceId: string, fromId: string, toId: string, predicateName: string, attributes: Record<string, unknown> = {}) {
    this.requireWrite(workspaceId);
    const pred = this.db.predicates.find((row) => row.workspace_id === workspaceId && row.name === predicateName);
    const from = this.mustEntity(workspaceId, fromId);
    const to = this.mustEntity(workspaceId, toId);
    if (!pred) throw new Error("VALIDATION_ERROR: predicate");
    if (fromId === toId) throw new Error("VALIDATION_ERROR: self-link");
    if (!pred.from_kinds.includes(from.kind) || !pred.to_kinds.includes(to.kind)) throw new Error("RELATION_KIND_MISMATCH");
    const relation = edge(crypto.randomUUID(), fromId, toId, predicateName, workspaceId);
    relation.attributes = attributes;
    this.db.relations.push(relation);
    this.pushAudit(workspaceId, "relation.create", relation.id, "relation", { predicate: predicateName });
    return relation;
  }

  deleteRelation(workspaceId: string, id: string) {
    this.requireWrite(workspaceId);
    const before = this.db.relations.length;
    this.db.relations = this.db.relations.filter((relation) => !(relation.workspace_id === workspaceId && relation.id === id));
    if (this.db.relations.length === before) throw new Error("NOT_FOUND");
  }

  dashboard(workspaceId: string): Dashboard {
    this.mustMember(workspaceId);
    const entities = this.db.entities.filter((entity) => entity.workspace_id === workspaceId && entity.status !== "archived");
    const countsByKind: Record<string, number> = {};
    const orphanCountsByKind: Record<string, number> = {};
    for (const kind of KINDS) {
      const rows = entities.filter((entity) => entity.kind === kind.id);
      countsByKind[kind.id] = rows.length;
      orphanCountsByKind[kind.id] = rows.filter((entity) => !this.db.relations.some((relation) => relation.from_id === entity.id || relation.to_id === entity.id)).length;
    }
    const days = this.mustWorkspace(workspaceId).stale_process_kind_days;
    const cutoff = Date.now() - days * 864e5;
    return {
      countsByKind,
      orphanCountsByKind,
      recentActivity: this.db.audits.filter((event) => event.workspace_id === workspaceId).slice(0, 20),
      staleProcessKinds: entities.filter((entity) => entity.kind === "process_kind" && Date.parse(entity.updated_at) < cutoff),
      staleProcessKindDays: days,
    };
  }

  auditRecent(workspaceId: string, query: { targetType?: string; targetId?: string; actionPrefix?: string; limit?: number; cursor?: string } = {}): Page<AuditEvent> {
    this.mustMember(workspaceId);
    let rows = this.db.audits.filter((event) => event.workspace_id === workspaceId);
    if (query.actionPrefix) rows = rows.filter((event) => event.action.startsWith(query.actionPrefix!));
    if (query.targetType) rows = rows.filter((event) => event.target_type === query.targetType);
    if (query.targetId) rows = rows.filter((event) => event.target_id === query.targetId);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const limit = query.limit ?? 25;
    return { items: rows.slice(offset, offset + limit), nextCursor: offset + limit < rows.length ? String(offset + limit) : null };
  }

  savedViews(workspaceId: string) {
    this.mustMember(workspaceId);
    return this.db.views.filter((view) => view.workspace_id === workspaceId && (view.visibility === "workspace" || view.owner_user_id === this.db.user.id));
  }

  createSavedView(workspaceId: string, name: string, visibility: "personal" | "workspace", kind: Kind | null, query: Record<string, unknown>) {
    this.requireWrite(workspaceId);
    const view: SavedView = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      owner_user_id: this.db.user.id,
      name: name.trim(),
      visibility,
      kind,
      query,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.db.views.unshift(view);
    return view;
  }

  deleteSavedView(workspaceId: string, id: string) {
    this.requireWrite(workspaceId);
    this.db.views = this.db.views.filter((view) => !(view.workspace_id === workspaceId && view.id === id));
  }

  traverse(workspaceId: string, startId: string, depth: number, direction = "both", predicates?: string[]) {
    this.mustMember(workspaceId);
    const start = this.mustEntity(workspaceId, startId);
    const seen = new Set<string>([startId]);
    const nodes: { entity: Entity; depth: number }[] = [];
    const rels: Relation[] = [];
    let frontier = [startId];
    for (let hop = 1; hop <= depth; hop += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const relation of this.db.relations.filter((row) => row.workspace_id === workspaceId)) {
          if (predicates?.length && !predicates.includes(relation.predicate)) continue;
          const outgoing = relation.from_id === id;
          const incoming = relation.to_id === id;
          if (direction === "outgoing" && !outgoing) continue;
          if (direction === "incoming" && !incoming) continue;
          if (!outgoing && !incoming) continue;
          const other = outgoing ? relation.to_id : relation.from_id;
          rels.push(relation);
          if (!seen.has(other)) {
            seen.add(other);
            const entity = this.db.entities.find((row) => row.id === other);
            if (entity && entity.status !== "archived") {
              nodes.push({ entity: asEntity(entity), depth: hop });
              next.push(other);
            }
          }
        }
      }
      frontier = next;
    }
    return { start: asEntity(start), nodes, relations: rels, truncated: false };
  }

  /** Like registry_path_report: 1–2 ordered steps, predicate direction respected, archived records skipped. */
  pathReport(workspaceId: string, startId: string, steps: PathStep[], maxResults = 25): PathRow[] {
    this.mustMember(workspaceId);
    const start = this.mustEntity(workspaceId, startId);
    if (steps.length < 1 || steps.length > 2 || maxResults < 1) throw new Error("VALIDATION_ERROR: path bounds");
    let possible: Kind[] = [start.kind];
    for (const step of steps) {
      const pred = this.db.predicates.find((row) => row.workspace_id === workspaceId && row.name === step.predicate);
      if (!pred || !["incoming", "outgoing", "either"].includes(step.direction)) throw new Error(pred ? "VALIDATION_ERROR: path step" : "PATH_NOT_CONFIGURED");
      const next: Kind[] = [];
      if (possible.some((kind) => pred.from_kinds.includes(kind)) && (!pred.directed || step.direction !== "incoming")) next.push(...pred.to_kinds);
      if (possible.some((kind) => pred.to_kinds.includes(kind)) && (!pred.directed || step.direction !== "outgoing")) next.push(...pred.from_kinds);
      if (next.length === 0) throw new Error("PATH_NOT_CONFIGURED");
      possible = next;
    }
    let paths: PathRow[] = [{ entities: [asEntity(start)], relations: [] }];
    for (const step of steps) {
      const pred = this.db.predicates.find((row) => row.workspace_id === workspaceId && row.name === step.predicate)!;
      const grown: PathRow[] = [];
      for (const path of paths) {
        const here = path.entities[path.entities.length - 1].id;
        for (const relation of this.db.relations) {
          if (relation.workspace_id !== workspaceId || relation.predicate !== step.predicate || path.relations.some((row) => row.id === relation.id)) continue;
          const forward = relation.from_id === here && (!pred.directed || step.direction !== "incoming");
          const backward = relation.to_id === here && (!pred.directed || step.direction !== "outgoing");
          for (const otherId of [forward ? relation.to_id : null, backward ? relation.from_id : null]) {
            const other = otherId && this.db.entities.find((row) => row.workspace_id === workspaceId && row.id === otherId && row.status !== "archived");
            if (other) grown.push({ entities: [...path.entities, asEntity(other)], relations: [...path.relations, relation] });
          }
        }
      }
      paths = grown;
    }
    return paths.slice(0, Math.min(maxResults, 500));
  }

  exportCreate(workspaceId: string, kinds?: Kind[] | null, includeArchived = false) {
    this.mustMember(workspaceId);
    const entities = this.db.entities.filter((entity) => entity.workspace_id === workspaceId && (includeArchived || entity.status !== "archived") && (!kinds?.length || kinds.includes(entity.kind)));
    const ids = new Set(entities.map((entity) => entity.id));
    const relations = this.db.relations.filter((relation) => ids.has(relation.from_id) && ids.has(relation.to_id));
    const id = crypto.randomUUID();
    this.pushAudit(workspaceId, "export.create", id, "export", { entities: entities.length });
    return { exportId: id, expiresAt: new Date(Date.now() + 864e5).toISOString(), snapshot: { entities, relations } };
  }

  tokens(workspaceId: string) {
    this.requireAdmin(workspaceId);
    return this.db.tokens.filter((token) => token.workspace_id === workspaceId);
  }

  issueToken(workspaceId: string, userId: string, label: string, scopes: string[]) {
    this.requireAdmin(workspaceId);
    if (!scopes.includes("read")) throw new Error("VALIDATION_ERROR: token");
    const token = `egt_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 68);
    const summary: TokenSummary = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      user_id: userId,
      label: label.trim(),
      prefix: token.slice(0, 12),
      scopes,
      created_at: new Date().toISOString(),
      expires_at: null,
      revoked_at: null,
      last_used_at: null,
    };
    this.db.tokens.unshift(summary);
    return { token, summary };
  }

  revokeToken(workspaceId: string, tokenId: string) {
    this.requireAdmin(workspaceId);
    const token = this.db.tokens.find((row) => row.workspace_id === workspaceId && row.id === tokenId);
    if (!token) throw new Error("NOT_FOUND");
    token.revoked_at = new Date().toISOString();
  }

  currentPerson(workspaceId: string) {
    this.mustMember(workspaceId);
    const link = this.db.links.find((row) => row.workspace_id === workspaceId && row.user_id === this.db.user.id);
    if (!link) return null;
    return this.db.entities.find((entity) => entity.id === link.person_id) ?? null;
  }

  linkPerson(workspaceId: string, userId: string, personId: string) {
    this.requireAdmin(workspaceId);
    this.mustEntity(workspaceId, personId);
    const existing = this.db.links.find((row) => row.workspace_id === workspaceId && row.user_id === userId);
    if (existing && existing.person_id !== personId) throw new Error("IDENTITY_LINK_CONFLICT");
    if (!existing) this.db.links.push({ id: crypto.randomUUID(), workspace_id: workspaceId, user_id: userId, person_id: personId });
    return { workspace_id: workspaceId, user_id: userId, person_id: personId };
  }

  private requireSession() {
    return this.db.user;
  }

  private mustWorkspace(id: string) {
    const workspace = this.db.workspaces.find((row) => row.id === id);
    if (!workspace) throw new Error("NOT_FOUND");
    return workspace;
  }

  private mustMember(workspaceId: string) {
    const member = this.membership(workspaceId);
    if (!member) throw new Error("NOT_FOUND");
    return member;
  }

  private requireWrite(workspaceId: string) {
    const member = this.mustMember(workspaceId);
    if (member.role === "viewer") throw new Error("FORBIDDEN");
    return member;
  }

  private requireAdmin(workspaceId: string) {
    const member = this.mustMember(workspaceId);
    if (member.role !== "owner" && member.role !== "admin") throw new Error("FORBIDDEN");
    return member;
  }

  private mustEntity(workspaceId: string, id: string) {
    const entity = this.db.entities.find((row) => row.workspace_id === workspaceId && row.id === id);
    if (!entity) throw new Error("NOT_FOUND");
    return entity;
  }

  private pushAudit(workspaceId: string, action: string, targetId: string, targetType: string, after: unknown) {
    this.db.audits.unshift({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      action,
      actor_type: "user",
      outcome: "success",
      source: "rpc",
      target_id: targetId,
      target_type: targetType,
      at: new Date().toISOString(),
      after,
      request_id: crypto.randomUUID(),
      effective_user_id: this.db.user.id,
    });
  }
}

function template(kind: Kind, type: string, fields: Template["fields"], workspaceId = HARBOR): Template {
  return { workspace_id: workspaceId, kind, type, fields, version: 1, updated_at: now, updated_by: ME };
}

function predicate(name: string, description: string, directed: boolean, from: Kind[], to: Kind[], workspaceId = HARBOR): Predicate {
  return {
    workspace_id: workspaceId,
    name,
    description,
    directed,
    from_kinds: from,
    to_kinds: to,
    symmetric_helper: null,
    version: 1,
    created_at: earlier,
    updated_at: now,
    created_by: ME,
    updated_by: ME,
  };
}

function edge(id: string, from: string, to: string, predicateName: string, workspaceId = HARBOR): Relation {
  return {
    id,
    workspace_id: workspaceId,
    from_id: from,
    to_id: to,
    predicate: predicateName,
    attributes: {},
    valid_from: null,
    valid_to: null,
    version: 1,
    created_at: earlier,
    updated_at: now,
    created_by: ME,
    updated_by: ME,
  };
}

function audit(id: string, action: string, target: string, title: string): AuditEvent {
  return {
    id,
    workspace_id: HARBOR,
    action,
    actor_type: "user",
    outcome: "success",
    source: "rpc",
    target_id: target,
    target_type: action.startsWith("relation") ? "relation" : "entity",
    at: now,
    after: action.startsWith("relation") ? { predicate: title } : { title },
    request_id: "99999999-9999-4999-8999-999999999999",
    effective_user_id: ME,
  };
}

function normalizeTags(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
}
