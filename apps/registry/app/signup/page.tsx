"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { useRegistry } from "@/lib/registry";

export default function SignUpPage() {
  const { ready, session } = useRegistry();
  const router = useRouter();
  useEffect(() => {
    if (ready && session) router.replace("/");
  }, [ready, session, router]);
  if (!ready) return null;
  if (session) return null;
  return <AuthScreen mode="sign-up" />;
}
