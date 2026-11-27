import type { SupabaseClient } from "@supabase/supabase-js";

export async function readConnectedApps(client: SupabaseClient) {
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError" && authError.status !== 401 && authError.status !== 403) {
    return { status: "unavailable" } as const;
  }
  if (authError || !user || user.is_anonymous || !(user.email_confirmed_at || user.phone_confirmed_at)) {
    return { status: "sign-in" } as const;
  }

  const { data, error } = await client.auth.oauth.listGrants();
  if (error || !data) return { status: "unavailable" } as const;
  return { status: "ready", grants: data } as const;
}

export async function revokeConnectedApp(client: SupabaseClient, clientId: string) {
  const result = await readConnectedApps(client);
  if (result.status !== "ready") return result.status;
  if (!result.grants.some(grant => grant.client.id === clientId)) return "missing";

  const { error } = await client.auth.oauth.revokeGrant({ clientId });
  return error ? "unavailable" : "revoked";
}
