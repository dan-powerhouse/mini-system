import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { publicConfig } from "./config";
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
  type Template,
  type TokenSummary,
  type Workspace,
  type WorkspacePatch,
  type PathRow,
  type PathStep,
  type ImportPreview,
} from "./model";

export type RegistryClient = SupabaseClient<Database>;

let browserClient: RegistryClient | undefined;

export function getBrowserClient() {
  const { url, key, configured } = publicConfig();
  if (!configured) throw new Error("Supabase is not configured");
  browserClient ??= createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

function page<T>(data: unknown): Page<T> {
  const body = (data ?? {}) as { items?: T[]; nextCursor?: string | null };
  return { items: body.items ?? [], nextCursor: body.nextCursor ?? null };
}

export const live = {
  async workspaces(client: RegistryClient) {
    const { data, error } = await client.from("workspace").select("*").order("name");
    fail(error);
    return (data ?? []) as Workspace[];
  },
  async membership(client: RegistryClient, workspaceId: string, userId: string) {
    const { data, error } = await client
      .from("workspace_member")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    fail(error);
    return (data as Member | null) ?? null;
  },
  async members(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.from("workspace_member").select("*").eq("workspace_id", workspaceId);
    fail(error);
    return (data ?? []) as Member[];
  },
  async createWorkspace(client: RegistryClient, name: string, slug: string) {
    const { data, error } = await client.rpc("workspace_create", { p_name: name, p_slug: slug });
    fail(error);
    return data as Workspace;
  },
  async updateWorkspace(client: RegistryClient, workspaceId: string, patch: WorkspacePatch) {
    const { data, error } = await client.rpc("workspace_update", { p_workspace_id: workspaceId, p_patch: patch as Json });
    fail(error);
    return data as Workspace;
  },
  async invite(client: RegistryClient, workspaceId: string, email: string, role: Role) {
    const { data, error } = await client.rpc("member_invite", { p_workspace_id: workspaceId, p_email: email, p_role: role });
    fail(error);
    return data as { invitationId: string; expiresAt: string; token: string };
  },
  async acceptInvitation(client: RegistryClient, token: string) {
    const { data, error } = await client.rpc("member_accept_invitation", { p_token: token });
    fail(error);
    return data as Member;
  },
  async updateRole(client: RegistryClient, workspaceId: string, userId: string, role: Role) {
    const { data, error } = await client.rpc("member_update_role", { p_workspace_id: workspaceId, p_user_id: userId, p_role: role });
    fail(error);
    return data as Member;
  },
  async removeMember(client: RegistryClient, workspaceId: string, userId: string) {
    const { error } = await client.rpc("member_remove", { p_workspace_id: workspaceId, p_user_id: userId });
    fail(error);
  },
  async transferOwner(client: RegistryClient, workspaceId: string, userId: string) {
    const { error } = await client.rpc("member_transfer_owner", { p_workspace_id: workspaceId, p_new_owner: userId });
    fail(error);
  },
  async search(client: RegistryClient, workspaceId: string, query: SearchQuery) {
    const { data, error } = await client.rpc("entity_search", {
      p_workspace_id: workspaceId,
      p_query: query as Json,
    });
    fail(error);
    const result = page<Entity>(data);
    return { items: result.items.map(asEntity), nextCursor: result.nextCursor };
  },
  async getEntity(client: RegistryClient, workspaceId: string, id: string): Promise<EntityDetail> {
    const { data, error } = await client.rpc("entity_get", { p_workspace_id: workspaceId, p_id: id });
    fail(error);
    const body = data as { entity: Entity; relations: { incoming: Relation[]; outgoing: Relation[] } };
    return { entity: asEntity(body.entity), relations: body.relations };
  },
  async createEntity(client: RegistryClient, workspaceId: string, input: Record<string, unknown>) {
    const { data, error } = await client.rpc("entity_create", { p_workspace_id: workspaceId, p_input: input as Json });
    fail(error);
    return asEntity(data);
  },
  async updateEntity(client: RegistryClient, workspaceId: string, id: string, version: number, patch: Record<string, unknown>) {
    const { data, error } = await client.rpc("entity_update", {
      p_workspace_id: workspaceId,
      p_id: id,
      p_expected_version: version,
      p_patch: patch as Json,
    });
    fail(error);
    return asEntity(data);
  },
  async archiveEntity(client: RegistryClient, workspaceId: string, id: string, version: number) {
    const { data, error } = await client.rpc("entity_archive", {
      p_workspace_id: workspaceId,
      p_id: id,
      p_expected_version: version,
    });
    fail(error);
    return asEntity(data);
  },
  async templates(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.from("type_templates").select("*").eq("workspace_id", workspaceId).order("kind");
    fail(error);
    return (data ?? []) as unknown as Template[];
  },
  async upsertTemplate(client: RegistryClient, workspaceId: string, kind: Kind, type: string, fields: unknown, expected?: number) {
    const { data, error } = await client.rpc("template_upsert", {
      p_workspace_id: workspaceId,
      p_kind: kind,
      p_type: type,
      p_fields: fields as Json,
      p_expected_version: expected,
    });
    fail(error);
    return data as unknown as Template;
  },
  async predicates(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.from("predicate_registry").select("*").eq("workspace_id", workspaceId).order("name");
    fail(error);
    return (data ?? []) as Predicate[];
  },
  async upsertPredicate(
    client: RegistryClient,
    input: {
      workspace_id: string;
      name: string;
      description: string;
      directed: boolean;
      from_kinds: Kind[];
      to_kinds: Kind[];
      symmetric_helper?: string | null;
      expected?: number;
    },
  ) {
    const { data, error } = await client.rpc("predicate_upsert", {
      p_workspace_id: input.workspace_id,
      p_name: input.name,
      p_description: input.description,
      p_directed: input.directed,
      p_from_kinds: input.from_kinds,
      p_to_kinds: input.to_kinds,
      p_symmetric_helper: input.symmetric_helper ?? undefined,
      p_expected_version: input.expected,
    });
    fail(error);
    return data as Predicate;
  },
  async deletePredicate(client: RegistryClient, workspaceId: string, name: string) {
    const { error } = await client.rpc("predicate_delete", { p_workspace_id: workspaceId, p_name: name });
    fail(error);
  },
  async createRelation(client: RegistryClient, workspaceId: string, fromId: string, toId: string, predicate: string, attributes: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc("relation_create", {
      p_workspace_id: workspaceId,
      p_from_id: fromId,
      p_to_id: toId,
      p_predicate: predicate,
      p_attributes: attributes as Json,
    });
    fail(error);
    return data as Relation;
  },
  async deleteRelation(client: RegistryClient, workspaceId: string, id: string) {
    const { error } = await client.rpc("relation_delete", { p_workspace_id: workspaceId, p_id: id });
    fail(error);
  },
  async dashboard(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.rpc("dashboard_summary", { p_workspace_id: workspaceId });
    fail(error);
    const body = data as Dashboard;
    return { ...body, staleProcessKinds: (body.staleProcessKinds ?? []).map(asEntity) };
  },
  async auditRecent(client: RegistryClient, workspaceId: string, query: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc("audit_recent", { p_workspace_id: workspaceId, p_query: query as Json });
    fail(error);
    return page<AuditEvent>(data);
  },
  async savedViews(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.from("saved_view").select("*").eq("workspace_id", workspaceId).order("name");
    fail(error);
    return (data ?? []) as SavedView[];
  },
  async createSavedView(client: RegistryClient, workspaceId: string, name: string, visibility: string, kind: Kind | null, query: Record<string, unknown>) {
    const { data, error } = await client.rpc("saved_view_create", {
      p_workspace_id: workspaceId,
      p_name: name,
      p_visibility: visibility,
      p_kind: kind as Kind,
      p_query: query as Json,
    });
    fail(error);
    return data as SavedView;
  },
  async deleteSavedView(client: RegistryClient, workspaceId: string, id: string) {
    const { error } = await client.rpc("saved_view_delete", { p_workspace_id: workspaceId, p_id: id });
    fail(error);
  },
  async traverse(client: RegistryClient, workspaceId: string, startId: string, depth: number, direction = "both", predicates?: string[]) {
    const { data, error } = await client.rpc("registry_traverse", {
      p_workspace_id: workspaceId,
      p_start_id: startId,
      p_depth: depth,
      p_direction: direction,
      p_predicates: predicates,
    });
    fail(error);
    const body = data as { start: Entity; nodes: { entity: Entity; depth: number }[]; relations: Relation[]; truncated: boolean };
    return {
      start: asEntity(body.start),
      nodes: body.nodes.map((node) => ({ ...node, entity: asEntity(node.entity) })),
      relations: body.relations,
      truncated: body.truncated,
    };
  },
  async pathReport(client: RegistryClient, workspaceId: string, startId: string, steps: PathStep[], maxResults = 25): Promise<PathRow[]> {
    const { data, error } = await client.rpc("registry_path_report", {
      p_workspace_id: workspaceId,
      p_start_id: startId,
      p_steps: steps as unknown as Json,
      p_max_results: maxResults,
    });
    fail(error);
    // The RPC returns an array of { entities, relations }, both in path order.
    return ((data ?? []) as PathRow[]).map((row) => ({ entities: row.entities.map(asEntity), relations: row.relations }));
  },
  async exportCreate(client: RegistryClient, workspaceId: string, kinds?: Kind[] | null, includeArchived = false) {
    const { data, error } = await client.rpc("export_create", {
      p_workspace_id: workspaceId,
      p_kinds: kinds && kinds.length ? kinds : undefined,
      p_include_archived: includeArchived,
    });
    fail(error);
    return data as { exportId: string; expiresAt: string };
  },
  async downloadExport(client: RegistryClient, exportId: string) {
    const { url, key } = publicConfig();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("UNAUTHENTICATED");
    const response = await fetch(`${url}/functions/v1/export/${exportId}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ code: response.statusText }));
      throw new Error(body.code || "Export delivery failed. The export edge function is disabled until enabled in supabase/config.toml.");
    }
    return response.blob();
  },
  async importZip(client: RegistryClient, workspaceId: string, file: File) {
    const { url, key } = publicConfig();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("UNAUTHENTICATED");
    const form = new FormData();
    form.set("workspaceId", workspaceId);
    form.set("file", file);
    const response = await fetch(`${url}/functions/v1/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: key },
      body: form,
    });
    const body = await response.json().catch(() => ({ code: "INVALID_PACKAGE" }));
    if (!response.ok) throw new Error(body.code || "Import function is disabled in supabase/config.toml.");
    return body as { uploadId?: string; id?: string };
  },
  async importPreview(client: RegistryClient, workspaceId: string, uploadId: string) {
    const { data, error } = await client.rpc("import_preview", { p_workspace_id: workspaceId, p_upload_id: uploadId });
    fail(error);
    return data as ImportPreview;
  },
  async importCommit(client: RegistryClient, workspaceId: string, previewId: string) {
    const { data, error } = await client.rpc("import_commit", { p_workspace_id: workspaceId, p_preview_id: previewId });
    fail(error);
    return data as { entitiesCreated: number; relationsCreated: number };
  },
  async tokens(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.rpc("token_list", { p_workspace_id: workspaceId });
    fail(error);
    return (data ?? []) as TokenSummary[];
  },
  async issueToken(client: RegistryClient, workspaceId: string, userId: string, label: string, scopes: string[]) {
    const { data, error } = await client.rpc("token_issue", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_label: label,
      p_scopes: scopes,
    });
    fail(error);
    return data as { token: string; summary: TokenSummary };
  },
  async revokeToken(client: RegistryClient, workspaceId: string, tokenId: string) {
    const { error } = await client.rpc("token_revoke", { p_workspace_id: workspaceId, p_token_id: tokenId });
    fail(error);
  },
  async currentPerson(client: RegistryClient, workspaceId: string) {
    const { data, error } = await client.rpc("identity_current_person", { p_workspace_id: workspaceId });
    fail(error);
    if (!data || typeof data !== "object") return null;
    const body = data as { personId?: string } | null;
    const personId = body?.personId;
    if (!personId) return null;
    const detail = await live.getEntity(client, workspaceId, personId).catch(() => null);
    return detail?.entity ?? null;
  },
  async linkPerson(client: RegistryClient, workspaceId: string, userId: string, personId: string) {
    const { data, error } = await client.rpc("identity_link_person", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_person_id: personId,
    });
    fail(error);
    return data;
  },
};
