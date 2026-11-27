/**
 * The registry's UI kit: small components built on the recipes in ./recipes and the
 * tokens in app/globals.css. Import from "@/components/kit".
 */
import { join, avatar, emptyState, floatCard, notice, panel, skeleton, text } from "./recipes";

export * as recipes from "./recipes";
export { join } from "./recipes";

/** A card surface. `size` sets the padding. */
export function Panel({ size = "lg", className, ...props }: React.ComponentProps<"section"> & { size?: "md" | "lg" }) {
  return <section className={join(className, panel[size])} {...props} />;
}

/** The short explanatory paragraph at the top of a screen. */
export function PageIntro({ className = "mb-4", ...props }: React.ComponentProps<"p">) {
  return <p className={join(className, text.intro)} {...props} />;
}

/** An error banner. */
export function ErrorNotice({ className = "mb-4", ...props }: React.ComponentProps<"p">) {
  return <p className={join(className, notice.error)} {...props} />;
}

/** A dashed placeholder shown when a list is empty. `action` sits under the text. */
export function EmptyState({ title, children, action, className = "mt-8" }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={join(className, emptyState)}>
      <p className="text-lg font-medium">{title}</p>
      {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Placeholder rows while a list loads. Announced once to screen readers. */
export function RowSkeletons({ count = 4, shape = "link", label = "Loading" }: { count?: number; shape?: "link" | "item"; label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden className={join(skeleton.base, shape === "link" ? skeleton.linkRow : skeleton.itemRow)} />
      ))}
    </div>
  );
}

/** Placeholder card with a few text lines while a panel loads. */
export function PanelSkeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className={join(panel.lg, "grid gap-3")}>
      <div aria-hidden className={join(skeleton.line, "h-4 w-1/3")} />
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} aria-hidden className={join(skeleton.line, index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Placeholder text lines (for compact lists inside a card). */
export function LineSkeletons({ count = 3, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden className={join(skeleton.line, index % 2 ? "w-1/2" : "w-3/4")} />
      ))}
    </div>
  );
}

/** The round initial shown beside a workspace or record. */
export function Initial({ label, size = "lg" }: { label: string; size?: "md" | "lg" }) {
  return <span className={avatar[size]}>{label.slice(0, 1)}</span>;
}

/** A calm, centered status line that fills the screen (loading, redirects). */
export function FullscreenNote({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-svh place-items-center text-sm text-muted-foreground"><p role="status">{children}</p></main>;
}

/** The floating card used by sign-in, recovery and error pages. */
export function FloatingCard({ children, after, centered = false }: { children: React.ReactNode; after?: React.ReactNode; centered?: boolean }) {
  return (
    <main className="grid min-h-svh place-items-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <p className={join("mb-3", text.brand)}>mini system</p>
        <section className={join(floatCard, centered && "text-center")}>{children}</section>
        {after}
      </div>
    </main>
  );
}

/** Large heading inside a FloatingCard. */
export function DisplayTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 className={join(className, text.display)} {...props} />;
}
