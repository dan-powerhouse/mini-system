/**
 * Workspace screens, in menu order, with the least role that can use each one.
 * Roles mirror the RPC checks (token_list/issue/revoke require owner or admin; the
 * others are open to every member). Hiding a link is a courtesy; the database still
 * enforces access on every call.
 */
import { roleAtLeast, type Role } from "./schema";

export type Section = { path: string; label: string; minRole: Role };

export const SECTIONS: Section[] = [
  { path: "workforce", label: "Workforce", minRole: "viewer" },
  { path: "ontology", label: "Ontology", minRole: "viewer" },
  { path: "audit", label: "Audit", minRole: "viewer" },
  { path: "members", label: "People", minRole: "viewer" },
  { path: "exchange", label: "Exchange", minRole: "viewer" },
  { path: "tokens", label: "Tokens", minRole: "admin" },
  { path: "settings", label: "Settings", minRole: "admin" },
];

export function sectionsFor(role: Role | null | undefined) {
  return SECTIONS.filter((section) => roleAtLeast(role, section.minRole));
}

/** The template editor for a kind and type, or for a new template when omitted. */
export function templateHref(workspaceId: string, kind?: string, type?: string) {
  const base = `/w/${workspaceId}/ontology/template`;
  return kind && type ? `${base}?kind=${encodeURIComponent(kind)}&type=${encodeURIComponent(type)}` : base;
}
