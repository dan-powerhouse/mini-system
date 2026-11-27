"use client";

import Link from "next/link";
import { useEffect } from "react";
import { DisplayTitle, FloatingCard, recipes } from "@/components/kit";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <FloatingCard centered>
      <DisplayTitle>Something broke</DisplayTitle>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        This screen hit an unexpected error. Try again, or go back to your workspaces.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">Reference {error.digest}</p>}
      <div className="mt-8 grid gap-2">
        <button type="button" onClick={reset} className={recipes.cta.primary}>
          Try again
        </button>
        <Link href="/" className={recipes.cta.secondary}>
          Back to workspaces
        </Link>
      </div>
    </FloatingCard>
  );
}
