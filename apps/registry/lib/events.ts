/** Browser events that let one screen tell another its data changed. */

const WORKSPACES_CHANGED = "registry:workspaces-changed";

/** Call after creating, renaming or leaving a workspace. */
export function notifyWorkspacesChanged() {
  window.dispatchEvent(new Event(WORKSPACES_CHANGED));
}

/** Subscribe; returns the unsubscribe function. */
export function onWorkspacesChanged(handler: () => void) {
  window.addEventListener(WORKSPACES_CHANGED, handler);
  return () => window.removeEventListener(WORKSPACES_CHANGED, handler);
}
