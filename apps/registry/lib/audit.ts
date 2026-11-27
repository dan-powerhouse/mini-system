/**
 * Human wording for audit events. Actions are the ones the database records
 * (private.audit_mutation calls); an action not listed here is shown as recorded.
 */
import type { AuditEvent } from "./model";
import { humanize } from "./schema";

const ACTION_LABELS: Record<string, string> = {
  "workspace.create": "Workspace created",
  "workspace.update": "Settings changed",
  "entity.create": "Record created",
  "entity.update": "Record updated",
  "entity.archive": "Record archived",
  "relation.create": "Relation added",
  "relation.update": "Relation updated",
  "relation.delete": "Relation removed",
  "template.upsert": "Template saved",
  "predicate.upsert": "Predicate saved",
  "predicate.delete": "Predicate deleted",
  "member.invite": "Member invited",
  "member.accept": "Invitation accepted",
  "member.role": "Role changed",
  "member.remove": "Member removed",
  "member.transfer_owner": "Ownership transferred",
  "token.issue": "Token issued",
  "token.revoke": "Token revoked",
  "oauth_grant.issue": "App access granted",
  "oauth_grant.revoke": "App access revoked",
  "oauth_grant.supersede": "App access replaced",
  "saved_view.create": "View saved",
  "saved_view.update": "View updated",
  "saved_view.delete": "View removed",
  "identity.link": "Login linked to a person",
  "identity.unlink": "Login unlinked from a person",
  "process_kind.publish": "Process kind published",
  "mcp.rate_limit": "MCP rate limit reached",
};

/** Filter groups, each an audit_recent actionPrefix. */
export const AUDIT_GROUPS: { id: string; label: string; prefix?: string }[] = [
  { id: "all", label: "All" },
  { id: "records", label: "Records", prefix: "entity." },
  { id: "relations", label: "Relations", prefix: "relation." },
  { id: "templates", label: "Templates", prefix: "template." },
  { id: "predicates", label: "Predicates", prefix: "predicate." },
  { id: "members", label: "Members", prefix: "member." },
  { id: "tokens", label: "Tokens", prefix: "token." },
  { id: "settings", label: "Settings", prefix: "workspace." },
];

export function actionLabel(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // MCP tool calls and future actions: "mcp.search_entities" → "Mcp: search entities".
  const [area, ...rest] = action.split(".");
  return rest.length ? `${humanize(area)}: ${rest.join(" ").replace(/_/g, " ")}` : humanize(action);
}

const pick = (value: unknown, key: string) =>
  value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string" ? ((value as Record<string, unknown>)[key] as string) : null;

/** A short name for what the event touched, from its before/after snapshots. */
export function targetName(event: AuditEvent) {
  const snapshot = event.after ?? event.before;
  if (event.target_type === "entity") return pick(snapshot, "title");
  if (event.target_type === "type_templates" || event.action.startsWith("template.")) {
    const kind = pick(snapshot, "kind");
    const type = pick(snapshot, "type");
    return kind && type ? `${humanize(kind)} · ${type}` : type;
  }
  if (event.target_type === "predicate_registry" || event.action.startsWith("predicate.")) return pick(snapshot, "name");
  if (event.action.startsWith("relation.")) return pick(snapshot, "predicate");
  if (event.action === "member.role") {
    const before = pick(event.before, "role");
    const after = pick(event.after, "role");
    return before && after ? `${before} → ${after}` : after;
  }
  if (event.action.startsWith("saved_view.")) return pick(snapshot, "name");
  if (event.action.startsWith("token.")) return pick(snapshot, "label");
  if (event.action === "workspace.update" || event.action === "workspace.create") return pick(snapshot, "name");
  if (event.action === "member.invite") return pick(snapshot, "email");
  return pick(snapshot, "title") ?? pick(snapshot, "name");
}

/**
 * Where the change came from, when it was not a person using the registry directly
 * (source "rpc"): an agent over MCP, a CSV import, a token, or the system.
 */
export function originLabel(event: AuditEvent) {
  if (event.source === "mcp") return "via MCP";
  if (event.source === "import") return "via import";
  if (event.actor_type === "system") return "system";
  if (event.actor_type === "token") return "via token";
  if (event.source && event.source !== "rpc" && event.source !== "registry") return `via ${event.source}`;
  return null;
}
