"use client";

import { Fragment } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { useRegistry } from "@/lib/registry";
import { FullscreenNote } from "@/components/kit";

export function Gate({ children }: { children: React.ReactNode }) {
  const { ready, session } = useRegistry();
  if (!ready) {
    return <FullscreenNote>Opening the registry…</FullscreenNote>;
  }
  if (!session) return <AuthScreen mode="sign-in" />;
  return <Fragment key={session.id}>{children}</Fragment>;
}
