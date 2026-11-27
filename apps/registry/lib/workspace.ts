import { messageOf } from "./format";

/** Workspace rules, mirroring the workspace table checks and workspace_update. */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_STALE_DAYS = 9999;

export function validateWorkspace(input: { name: string; slug: string; days: number }) {
  const errors: Partial<Record<"name" | "slug" | "days", string>> = {};
  const name = input.name.trim();
  if (name.length < 1 || name.length > 300) errors.name = "Between 1 and 300 characters";
  if (!SLUG_PATTERN.test(input.slug.trim())) errors.slug = "Lowercase letters and digits, words joined by single hyphens";
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_STALE_DAYS) errors.days = `A whole number of days from 1 to ${MAX_STALE_DAYS}`;
  return errors;
}

/** A slug that fits SLUG_PATTERN: "Oficina Central!" → "oficina-central". */
export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Message for a failed create or update: a taken slug, or the general error. */
export function workspaceErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  // CONFLICT from the preview; a unique violation from Postgres.
  return /CONFLICT: slug|duplicate key|workspace_slug/i.test(text) ? "Another workspace already uses that slug." : messageOf(error);
}
