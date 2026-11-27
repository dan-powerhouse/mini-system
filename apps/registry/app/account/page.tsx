"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Frame } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { useRegistry } from "@/lib/registry";
import { messageOf } from "@/lib/format";
import { useBusy } from "@/lib/use-busy";
import { toast } from "sonner";
import { FullscreenNote, recipes } from "@/components/kit";

export default function AccountPage() {
  const { session, ready, signOut, identityUrl, mode } = useRegistry();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [busy, run] = useBusy();
  // Redirect after render; navigating during render is not allowed in React.
  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);
  if (!ready) return <FullscreenNote>Opening your account…</FullscreenNote>;
  if (!session) return null;
  return (
    <Frame title="Account" backHref="/">
      <div className={recipes.join("max-w-lg", recipes.panel.lg)}>
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="mt-1 text-xl font-semibold tracking-tight">{session.email}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {mode === "preview" ? "You’re using a preview account." : "Manage the appearance of Registry and your current session."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Appearance">
          {(["light", "dark", "system"] as const).map((value) => (
            <Button key={value} variant={theme === value ? "default" : "secondary"} className="rounded-full capitalize" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value}</Button>
          ))}
        </div>
        {identityUrl && <a className="mt-5 inline-block text-sm text-primary" href={identityUrl}>Open Identity</a>}
        <div className="mt-6">
          <Button variant="ghost" className={recipes.pill.bare} disabled={busy} onClick={() => void run(async () => {
            try {
              await signOut();
              router.replace("/");
            } catch (error) {
              toast.error(messageOf(error));
            }
          })}>Sign out</Button>
        </div>
      </div>
    </Frame>
  );
}
