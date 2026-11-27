"use client";

import { AuthScreen } from "@/components/auth-screen";
import { useRegistry } from "@/lib/registry";

export default function RecoverPage() {
  const { ready, session } = useRegistry();
  if (!ready || session) return null;
  return <AuthScreen mode="recover" />;
}
