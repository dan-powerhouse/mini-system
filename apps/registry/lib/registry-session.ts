import type { RegistryClient } from "./live";
import type { SessionUser } from "./model";

export type RegistrySessionState =
  | { status: "checking" | "signed-out" | "ineligible" | "unavailable"; user: null }
  | { status: "signed-in"; user: SessionUser };

export async function checkRegistrySession(client: RegistryClient, token: string): Promise<RegistrySessionState> {
  const auth = await client.auth.getUser(token);
  if (auth.error) {
    const { status, name } = auth.error;
    return {
      status: status === 401 || status === 403 || name === "AuthSessionMissingError" ? "signed-out" : "unavailable",
      user: null,
    };
  }
  if (!auth.data.user) return { status: "signed-out", user: null };

  // The issuer and the Registry SQL predicate must see the same access token.
  const direct = await client.rpc("registry_direct_session").setHeader("Authorization", `Bearer ${token}`);
  if (direct.error || typeof direct.data !== "boolean") return { status: "unavailable", user: null };
  if (!direct.data) return { status: "ineligible", user: null };
  return { status: "signed-in", user: { id: auth.data.user.id, email: auth.data.user.email ?? "" } };
}

export function watchRegistrySession(client: RegistryClient, publish: (state: RegistrySessionState) => void) {
  let revision = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let latestToken: string | undefined;
  let verifiedUser: SessionUser | null = null;

  const { data } = client.auth.onAuthStateChange((event, session) => {
    const token = session?.access_token;
    if (token && token === latestToken && event !== "USER_UPDATED") return;

    latestToken = token;
    clearTimeout(pending);
    const current = ++revision;

    if (!token) {
      verifiedUser = null;
      publish({ status: "signed-out", user: null });
      return;
    }

    // Keep the current view during normal refreshes so form drafts stay mounted.
    const refreshing = event === "TOKEN_REFRESHED" && verifiedUser?.id === session?.user.id;
    if (!refreshing) {
      verifiedUser = null;
      publish({ status: "checking", user: null });
    }

    // Dispatch SDK calls after the auth-state callback has released the SDK lock.
    pending = setTimeout(async () => {
      let state: RegistrySessionState;
      try {
        state = await checkRegistrySession(client, token);
      } catch {
        state = { status: "unavailable", user: null };
      }
      if (current !== revision) return;
      verifiedUser = state.user;
      publish(state);
    }, 0);
  });

  return () => {
    revision++;
    clearTimeout(pending);
    data.subscription.unsubscribe();
  };
}
