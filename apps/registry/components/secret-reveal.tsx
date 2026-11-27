"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recipes } from "@/components/kit";

/** Shows a one-time secret with a copy button. "Done" removes it from the screen. */
export function SecretReveal({ secret, what, onDone }: { secret: string; what: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed. Select the text and copy it by hand.");
    }
  }

  return (
    <div role="status" className="rounded-2xl border border-primary/30 bg-secondary p-3">
      <p className="text-sm font-medium">Copy this {what} now</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">It is shown only once. After you leave this screen it cannot be recovered; you would need to issue a new one.</p>
      <p className="mt-2 rounded-xl bg-background/70 p-2 font-mono text-xs break-all select-all" data-testid="secret-value">{secret}</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" className={recipes.pill.sm} onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
        <Button type="button" variant="ghost" className={recipes.pill.sm} onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
