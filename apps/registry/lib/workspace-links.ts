import type { SavedView } from "./model";

export function registryHref(workspaceId: string, viewId?: string) {
  const base = `/w/${encodeURIComponent(workspaceId)}`;
  return viewId ? `${base}?${new URLSearchParams({ view: viewId })}` : base;
}

export function workspaceOverviewHref(workspaceId: string) {
  return `${registryHref(workspaceId)}/workspace`;
}

export function findWorkspaceView(views: SavedView[], workspaceId: string, viewId: string) {
  return views.find((view) => view.workspace_id === workspaceId && view.id === viewId);
}
