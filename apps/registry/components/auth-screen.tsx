"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegistry } from "@/lib/registry";
import { useBusy } from "@/lib/use-busy";
import { DisplayTitle, FloatingCard, recipes } from "@/components/kit";

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" | "recover" }) {
  const { signIn, signUp, recover, sessionStatus, retrySession, mode: dataMode } = useRegistry();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [busy, run] = useBusy();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      setFeedback(undefined);
      try {
        if (mode === "recover") {
          await recover(email);
          setFeedback({ text: dataMode === "preview" ? "Preview does not send email." : "If the account exists, a recovery link is on its way." });
          return;
        }
        if (mode === "sign-up") {
          const note = await signUp(email, password);
          setFeedback({ text: note });
          if (dataMode === "preview" || note === "Account created.") router.push("/");
          return;
        }
        // The session gate reveals the current route, including any saved view in its URL.
        await signIn(email, password);
      } catch {
        const text = mode === "sign-in" ? "Couldn’t sign in. Check your email and password, then try again."
          : mode === "recover" ? "Couldn’t request a recovery link. Try again shortly."
            : "Couldn’t create your account. Check the details and try again.";
        setFeedback({ text, error: true });
      }
    });
  }

  if (sessionStatus === "unavailable") {
    return (
      <FloatingCard centered>
        <DisplayTitle>Couldn’t verify your session</DisplayTitle>
        <p className="mt-3 text-sm text-muted-foreground">Check your connection and try again.</p>
        <button type="button" className={recipes.join("mt-6", recipes.cta.primary)} onClick={retrySession}>Retry</button>
      </FloatingCard>
    );
  }

  const title = mode === "sign-up" ? "Create an account" : mode === "recover" ? "Recover access" : "Sign in";
  const copy =
    mode === "sign-up"
      ? "Use your email address to create a Registry account."
      : mode === "recover"
        ? "Enter your account email to request a recovery link."
        : "Sign in to open your Registry workspaces.";

  return (
    <FloatingCard
      after={dataMode === "preview" && (
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Harbor uses sample records. Changes stay in this browser tab.
        </p>
      )}
    >
      <DisplayTitle className="text-center">{title}</DisplayTitle>
      <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">{copy}</p>
      {mode === "sign-in" && sessionStatus === "ineligible" && (
        <p role="status" className={recipes.join("mt-4", recipes.notice.error)}>
          This session can’t open Registry. Sign in here to access your workspaces.
        </p>
      )}
      <form className="mt-8 grid gap-4" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={recipes.field.lg} />
        </div>
        {mode !== "recover" && (
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className={recipes.field.lg} />
          </div>
        )}
        <Button type="submit" disabled={busy} className={recipes.join("mt-2", recipes.pill.lg, "text-base")}>
          {busy ? "Working…" : mode === "sign-up" ? "Create account" : mode === "recover" ? "Send link" : "Continue"}
        </Button>
      </form>
      {feedback && <p role={feedback.error ? "alert" : "status"} className={recipes.join("mt-4", feedback.error ? recipes.notice.error : recipes.text.muted)}>{feedback.text}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {mode !== "sign-in" && <Link className={recipes.text.link} href="/">Sign in</Link>}
        {mode !== "sign-up" && <Link className={recipes.text.link} href="/signup">Create account</Link>}
        {mode !== "recover" && <Link className={recipes.text.link} href="/recover">Recover access</Link>}
      </div>
    </FloatingCard>
  );
}
