export function when(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/** Date and time, for audit events: "Nov 27, 14:05". */
export function whenFull(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

// Error codes raised by the registry RPCs and edge functions, in plain language.
const FRIENDLY: Record<string, string> = {
  VERSION_CONFLICT: "Someone else changed this first. Reload to see the latest version.",
  NOT_FOUND: "Not found, or you no longer have access to it.",
  FORBIDDEN: "Your role in this workspace does not allow that.",
  UNAUTHENTICATED: "Your session ended. Sign in again.",
  ARCHIVED_ENTITY: "This record is archived and can no longer be changed.",
  TEMPLATE_NOT_FOUND: "There is no template for that kind and type.",
  INVALID_ATTRIBUTES: "Some fields do not match the template.",
  RELATION_KIND_MISMATCH: "That predicate cannot connect these two kinds of record.",
  INVALID_ENDPOINT: "One end of that relation is missing or archived.",
  INVALID_VALIDITY: "The validity dates are not in order.",
  RESULT_TOO_LARGE: "Too many results. Narrow the query.",
  PAYLOAD_TOO_LARGE: "That file is too large.",
  IMPORT_VALIDATION_FAILED: "The import has errors. Fix the file and preview it again.",
  IDENTITY_LINK_CONFLICT: "Your login is already linked to another person record.",
  INVALID_PACKAGE: "That file is not a valid registry package.",
};

function rawText(error: unknown) {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return text.replace(/^P0001:\s*/, "").replace(/\n[\s\S]*$/, "").trim();
}

/** The leading upper-case code of a registry error, such as VERSION_CONFLICT. */
export function errorCode(error: unknown) {
  return /^([A-Z][A-Z_]+)(?::|$)/.exec(rawText(error))?.[1] ?? null;
}

export function messageOf(error: unknown) {
  const text = rawText(error);
  if (!text) return "Something went wrong";
  if (/failed to fetch|networkerror|load failed/i.test(text)) return "Cannot reach the server. Check your connection and try again.";
  const match = /^([A-Z][A-Z_]+)(?::\s*(.*))?$/.exec(text);
  if (!match) return text;
  const [, code, detail] = match;
  if (code === "VALIDATION_ERROR") return detail ? `Check the input: ${detail}.` : "Check the input and try again.";
  if (code === "CONFLICT") return detail ? `Already exists or still in use: ${detail}.` : "That conflicts with something that already exists.";
  return FRIENDLY[code] ?? text;
}
