/**
 * Class recipes: the single place where the registry's recurring looks are composed
 * from design tokens (app/globals.css). Screens use these through the kit components,
 * or directly when a look must sit on a different element (a Link styled as a row,
 * a native <select>, …). Change a look here and it changes everywhere.
 *
 * Recipes are plain strings joined with spaces, never merged, so every element keeps
 * exactly the classes it is given.
 */

export const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* Surfaces */
export const panel = {
  md: "rounded-panel border bg-card p-5 shadow-panel",
  lg: "rounded-panel border bg-card p-5 shadow-panel sm:p-6",
  raised: "rounded-panel border bg-raised p-5 shadow-raised sm:p-6",
};
export const row = {
  /** A whole-row link with a gentle lift on hover. */
  link: "flex min-w-0 items-center gap-3 rounded-row border bg-card px-3 py-3 shadow-panel transition-shadow hover:bg-raised hover:shadow-raised focus-visible:outline-2 focus-visible:outline-ring",
  /** A static row of content. */
  item: "rounded-row border bg-card px-4 py-3 shadow-panel",
  /** A static row with content on the left and an action on the right. */
  split: "flex items-center justify-between rounded-row border bg-card px-4 py-3 shadow-panel",
  /** Main line of a row. */
  title: "block truncate font-medium",
  /** Secondary line of a row holding a pill and details. */
  meta: "mt-0.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground",
};
export const emptyState = "rounded-panel border border-dashed border-border px-6 py-12 text-center";
export const floatCard = "rounded-panel border border-border bg-card px-7 py-8 shadow-float";

/* Text */
export const text = {
  intro: "max-w-prose text-sm leading-6 text-muted-foreground",
  muted: "text-sm text-muted-foreground",
  display: "text-[2rem] leading-none font-semibold tracking-tight",
  brand: "text-center text-sm font-medium tracking-wide text-primary",
  link: "text-foreground underline-offset-4 hover:underline",
  error: "text-sm text-destructive",
  /** "Loading…" line under a list. */
  loading: "mt-6 text-sm text-muted-foreground",
};
export const notice = {
  error: "rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive",
};

/* Controls */
export const field = {
  md: "h-11 rounded-full px-4",
  lg: "h-12 rounded-full px-4",
};
export const select = {
  sm: "h-9 rounded-full border border-input bg-transparent px-3",
  md: "h-11 rounded-full border border-input bg-transparent px-3",
  wide: "h-11 rounded-full border border-input bg-transparent px-4",
};
export const pill = {
  /** Pill-shaped Button sizes (combined with Button variants). */
  sm: "h-9 rounded-full px-4",
  md: "h-11 rounded-full",
  lg: "h-12 rounded-full",
  bare: "rounded-full",
};
/** Large call-to-action, usable on a Link or a button. */
export const cta = {
  primary: "inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-medium text-primary-foreground",
  secondary: "inline-flex h-12 items-center justify-center rounded-full bg-secondary px-6 text-base font-medium",
  /** Primary look for a Link sized by a pill recipe. */
  inline: "inline-flex items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground",
};
/** Dialog shape; arbitrary-value form so it overrides the dialog's base radius. */
export const dialog = {
  form: "max-h-[85svh] overflow-y-auto rounded-[var(--panel-radius)] shadow-overlay sm:max-w-md",
  confirm: "rounded-[var(--panel-radius)] shadow-overlay sm:max-w-sm",
};
export const picker = {
  list: "grid min-w-0 gap-0.5 rounded-2xl border bg-popover p-1 shadow-raised",
  option: "flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm data-highlighted:bg-accent",
};
/** A compact row inside a panel that links somewhere. */
export const listLink = "flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm transition-colors hover:bg-secondary";
export const navLink = "rounded-full px-3 py-2 text-sm text-muted-foreground hover:bg-card";
export const tag = "rounded-full bg-secondary px-3 py-1 text-xs";

/**
 * Toggle chips. `tone` is the selected look, `surface` the unselected background,
 * `size` the padding and type scale.
 */
export function chip({
  on,
  tone = "primary",
  surface = "card",
  size = "md",
  animated = false,
}: {
  on: boolean;
  tone?: "primary" | "ink";
  surface?: "card" | "secondary";
  size?: "sm" | "md" | "tall";
  animated?: boolean;
}) {
  const sizes = { sm: "px-3 py-1 text-xs", md: "px-3 py-1.5 text-sm", tall: "px-3 py-2 text-sm" };
  const selected = tone === "primary" ? "bg-primary text-primary-foreground" : "bg-foreground text-background";
  const idle = surface === "card" ? "bg-card text-muted-foreground" : "bg-secondary";
  return join("rounded-full", sizes[size], animated && "transition-colors", on ? selected : idle);
}

/* Loading placeholders: same shape as the content they stand in for. Motion only for
   people who have not asked their system for reduced motion. */
export const skeleton = {
  base: "bg-card motion-safe:animate-pulse",
  /** Height of a row.link (48px avatar + py-3). */
  linkRow: "h-[72px] rounded-row",
  /** Height of a two-line row.item or row.split. */
  itemRow: "h-16 rounded-row",
  line: "h-3 rounded-full bg-secondary motion-safe:animate-pulse",
};

/* Identity */
export const avatar = {
  md: "grid size-11 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary",
  lg: "grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary",
};
