"use client";

import { AuthScreen } from "@/components/auth-screen";
import { Frame } from "@/components/frame";
import { useRegistry } from "@/lib/registry";
import { FullscreenNote } from "@/components/kit";

export default function HomePage() {
  const { ready, session, mode } = useRegistry();
  if (!ready) return <FullscreenNote>Opening the registry…</FullscreenNote>;
  if (!session) return <AuthScreen mode="sign-in" />;
  return (
    <Frame>
      <div className="hidden h-full flex-col justify-center md:flex">
        <p className="text-sm font-medium text-primary">Choose a workspace</p>
        <h2 className="mt-2 max-w-md text-4xl font-semibold tracking-tight">People, objects, standards, agents, and apps.</h2>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
          {mode === "preview"
            ? "Explore Harbor with sample records. Changes stay in this browser tab."
            : "Open a workspace to find records, see how they connect, and pick up where you left off."}
        </p>
      </div>
    </Frame>
  );
}
