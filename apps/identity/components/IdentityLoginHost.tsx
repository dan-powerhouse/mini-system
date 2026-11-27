"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { authorizationRoute } from "../lib/auth-flow.mjs";
import { createIdentityAdapter } from "../lib/identity-adapter.mjs";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import { authConfigured, withAuthorization } from "../lib/ui-routes";
import { AuthCard, Icon } from "./AuthCard";

type Screen = "login" | "recover" | "signup" | "check-email" | "setup" | "sign-out";
type Entry = "login" | "recover" | "signup";
const entry = {
  login: { path: "/login", title: "Sign in", description: "Authenticate to continue to your application.", action: "Continue with email" },
  recover: { path: "/recover", title: "Recover access", description: "Use a sign-in link if you can’t use your passkey.", action: "Send sign-in link" },
  signup: { path: "/signup", title: "Create an account", description: "Verify your email address to get started.", action: "Send verification link" },
} as const;

function screenEntry(intent?: string): Entry {
  return intent === "recover" || intent === "signup" ? intent : "login";
}

function canUsePasskey() {
  return window.isSecureContext && "PublicKeyCredential" in window && Boolean(navigator.credentials);
}

export function IdentityLoginHost({
  authorizationId,
  screen = "login",
  intent,
}: {
  authorizationId?: string;
  screen?: Screen;
  intent?: string;
}) {
  const router = useRouter();
  const running = useRef(false);
  const [pending, setPending] = useState<"email" | "passkey" | null>(null);
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [passkeyCreated, setPasskeyCreated] = useState(false);
  const busy = pending !== null;
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<"loading" | "signed-in" | "signed-out" | "error">("loading");
  const [hasPasskey, setHasPasskey] = useState(false);
  const configured = authConfigured();
  const mode = screen === "check-email" ? screenEntry(intent) : screenEntry(screen);
  const emailKey = `identity:email:${mode}:${authorizationId ?? ""}`;
  const login = withAuthorization("/login", authorizationId);
  const continuation = authorizationId ? authorizationRoute(authorizationId) : "/login";
  const client = useMemo(() => configured
    ? getSupabaseBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    : null, [configured]);

  useEffect(() => {
    if (screen === "login" || screen === "setup") setPasskeySupported(canUsePasskey());
  }, [screen]);

  useEffect(() => {
    if (screen !== "check-email") return;
    try { setEmail(sessionStorage.getItem(emailKey) ?? ""); } catch { /* Browser storage is optional. */ }
  }, [screen, emailKey]);

  useEffect(() => {
    if (!client || (screen !== "login" && screen !== "setup")) return;
    let active = true;
    const adapter = createIdentityAdapter({
      client,
      callbackUrl: process.env.NEXT_PUBLIC_IDENTITY_BASE_URL || window.location.origin,
    });
    adapter.inspectSession().then((details) => {
      if (!active) return;
      setHasPasskey(details.hasPasskey);
      setSession(details.authenticated && details.confirmed && !details.anonymous ? "signed-in" : "signed-out");
    }).catch(() => {
      if (active) setSession("error");
    });
    return () => { active = false; };
  }, [client, screen]);

  async function perform(kind: NonNullable<typeof pending>, action: (auth: NonNullable<typeof client>) => Promise<void>) {
    if (running.current) return;
    if (!client) {
      setNotice({ text: "Sign-in is unavailable right now. Try again later.", error: true });
      return;
    }
    running.current = true;
    setPending(kind);
    setNotice(undefined);
    try {
      await action(client);
    } catch {
      setNotice({ text: "Something went wrong. Try again.", error: true });
    } finally {
      setPending(null);
      running.current = false;
    }
  }

  function requestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendLink();
  }

  async function sendLink() {
    await perform("email", async (auth) => {
      const address = email.trim();
      const adapter = createIdentityAdapter({
        client: auth,
        callbackUrl: process.env.NEXT_PUBLIC_IDENTITY_BASE_URL || window.location.origin,
        authorizationId,
      });
      const result = await adapter.requestMagicLink(address, mode === "signup" ? "sign-up" : "sign-in");
      if (!result.ok) {
        setNotice({ text: result.message ?? "Unable to request a link. Try again.", error: true });
        return;
      }
      if (screen === "check-email") {
        setNotice({ text: "If the address is eligible, a new link will arrive shortly." });
        return;
      }
      try { sessionStorage.setItem(emailKey, address); } catch { /* Check email still works without storage. */ }
      router.push(withAuthorization("/auth/check-email", authorizationId, { intent: mode }));
    });
  }

  async function runPasskey() {
    await perform("passkey", async (auth) => {
      const adapter = createIdentityAdapter({
        client: auth,
        callbackUrl: process.env.NEXT_PUBLIC_IDENTITY_BASE_URL || window.location.origin,
        passkeyAvailable: canUsePasskey(),
      });
      const result = screen === "setup" ? await adapter.registerPasskey() : await adapter.signInWithPasskey();
      if (!result.ok) {
        if (result.kind === "unavailable") setPasskeySupported(false);
        setNotice({
          text: result.message ?? "Passkey unavailable. Try signing in with email.",
          error: result.kind !== "cancelled" && result.kind !== "interrupted",
        });
        return;
      }
      if (screen === "setup") {
        setHasPasskey(true);
        setPasskeyCreated(true);
        return;
      }
      const verified = await adapter.inspectSession();
      if (!verified.confirmed || !verified.authenticated || verified.anonymous) {
        setNotice({ text: "Your session could not be verified. Try signing in with email.", error: true });
        return;
      }
      setSession("signed-in");
      setHasPasskey(verified.hasPasskey);
      if (authorizationId) router.replace(continuation);
    });
  }

  const feedback = notice && (
    <p className={notice.error ? "notice error" : "notice"} role={notice.error ? "alert" : "status"}>{notice.text}</p>
  );

  if (screen === "check-email") {
    const changeEmail = withAuthorization(entry[mode].path, authorizationId);
    return (
      <AuthCard title="Check your email" icon="mail" description="If the address is eligible, you’ll receive a link to continue."
        busy={busy} footer={<>{email && <button className="text-button" disabled={busy} onClick={() => void sendLink()}>{busy ? "Sending…" : "Resend link"}</button>}<Link href={changeEmail}>Use a different email</Link></>}>
        <p className="notice">{email && <>Email address: <strong>{email}</strong><br /></>}Open the link in the browser where you requested it. If it has expired, request a new one.</p>
        {feedback}
      </AuthCard>
    );
  }

  if (screen === "sign-out") {
    return (
      <AuthCard title="Sign out" description="End your Identity session in this browser. Sign out of connected applications from those applications." icon="exit" busy={busy}>
        <form className="controls" action="/sign-out/confirm" method="post">
          <button className="button primary" type="submit">Sign out</button>
          <Link className="button secondary" href="/login">Cancel</Link>
        </form>
      </AuthCard>
    );
  }

  if (screen === "setup") {
    return (
      <AuthCard title="Set up a passkey" icon="key" description="Sign in next time with your fingerprint, face, or device PIN." busy={busy}>
        {session === "signed-in" ? (
          <div className="controls">
            {passkeyCreated ? (
              <p className="notice" role="status">Passkey created. You can use it the next time you sign in.</p>
            ) : passkeySupported ? (
              <button type="button" className="button primary" disabled={busy} onClick={() => void runPasskey()}>
                <Icon name="key" />{busy ? "Waiting for your device…" : "Create passkey"}
              </button>
            ) : (
              <p className="notice">Passkeys are unavailable in this browser. You can still use email.</p>
            )}
            <Link className={passkeyCreated || !passkeySupported ? "button primary" : "button secondary"} href={continuation} prefetch={false}>
              {hasPasskey ? "Continue" : "Skip for now"}
            </Link>
          </div>
        ) : configured && session === "loading" ? (
          <p className="notice" role="status">Verifying your session…</p>
        ) : (
          <>
            {session === "error" && <p role="alert" className="notice error">Your session couldn’t be verified.</p>}
            <Link className="button primary" href={login}>Back to sign in</Link>
          </>
        )}
        {feedback}
      </AuthCard>
    );
  }

  if (screen === "login" && session === "signed-in") {
    return (
      <AuthCard title="You’re signed in" icon="check" description={authorizationId ? "Continue to review the application’s request." : "Your Identity session is active in this browser."}>
        <div className="controls">
          {authorizationId && <Link className="button primary" href={continuation} prefetch={false}>Review access request <Icon name="arrow" /></Link>}
          {!hasPasskey && <Link className="button secondary" href={withAuthorization("/passkey/setup", authorizationId)}><Icon name="key" />Set up a passkey</Link>}
          <Link className="button secondary" href="/account/connected-apps">Connected apps</Link>
          <Link className="button secondary" href="/sign-out"><Icon name="exit" />Sign out</Link>
        </div>
      </AuthCard>
    );
  }

  const copy = entry[mode];
  const showPasskey = screen === "login" && configured;
  return (
    <AuthCard title={copy.title} description={copy.description} icon={mode === "recover" ? "mail" : "lock"} busy={busy}
      footer={mode === "login" ? (
        <><Link href={withAuthorization("/recover", authorizationId)}>Need help signing in?</Link><Link href={withAuthorization("/signup", authorizationId)}>Create an account</Link></>
      ) : <Link href={login}>Back to sign in</Link>}>
      {showPasskey && (
        <>
          <button type="button" className="button primary" disabled={busy || passkeySupported !== true} onClick={() => void runPasskey()}>
            <Icon name="key" />{pending === "passkey" ? "Waiting for your device…" : "Sign in with a passkey"}
          </button>
          <div className="divider"><span>{passkeySupported === false ? "Use email on this device" : "or"}</span></div>
        </>
      )}
      <form className="email-form" onSubmit={requestEmail}>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <Icon name="mail" />
          <input id="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required
            value={email} onChange={(event) => setEmail(event.target.value)} readOnly={busy} />
        </div>
        <button className={showPasskey && passkeySupported !== false ? "button secondary" : "button primary"} type="submit" disabled={busy}>
          {pending === "email" ? "Sending…" : copy.action}<Icon name="arrow" />
        </button>
      </form>
      {feedback ?? (session === "error" && <p className="notice" role="status">Your session couldn’t be checked. You can sign in again.</p>)}
    </AuthCard>
  );
}
