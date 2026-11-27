import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "../../../components/AuthCard";
import { RevokeAppForm } from "../../../components/RevokeAppForm";
import { readConnectedApps, revokeConnectedApp } from "../../../lib/connected-apps";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { oauthScopeLabel } from "../../../lib/oauth-scopes";
import { authConfigured } from "../../../lib/ui-routes";

export const metadata = { title: "Connected apps" };
const path = "/account/connected-apps";

async function revoke(clientId: string, _state: null, _form: FormData): Promise<null> {
  "use server";

  if (!authConfigured()) redirect(path);
  const status = await revokeConnectedApp(await getSupabaseServerClient(), clientId);
  if (status === "sign-in") redirect("/login");
  redirect(`${path}?result=${status}`);
}

export default async function ConnectedApps({ searchParams }: {
  searchParams: Promise<{ result?: string | string[] }>;
}) {
  const { result } = await searchParams;
  const access = authConfigured()
    ? await readConnectedApps(await getSupabaseServerClient())
    : { status: "unavailable" } as const;

  if (access.status === "sign-in") redirect("/login");

  return (
    <AuthCard icon="shield" title="Connected apps" description="Review apps you’ve allowed to use your Identity account."
      footer={<Link href="/login">Back to Identity</Link>}>
      {access.status === "unavailable" ? (
        <div className="controls">
          <p className="notice error" role="alert">Connected apps are unavailable. Try again shortly.</p>
          {authConfigured() && <Link className="button secondary" href={path}>Try again</Link>}
        </div>
      ) : (
        <>
          {result === "revoked" && <p className="notice" role="status">App access revoked.</p>}
          {result === "missing" && <p className="notice" role="status">This app is no longer connected.</p>}
          {result === "unavailable" && <p className="notice error" role="alert">Couldn’t revoke app access. Try again.</p>}
          {access.grants.length === 0 ? <p className="notice">You don’t have any connected apps.</p> : (
            <ul className="scope-list connected-apps">
              {access.grants.map(grant => {
                const name = grant.client.name || "Unnamed app";
                return (
                  <li key={grant.client.id}>
                    <strong>{name}</strong>
                    {grant.scopes.length > 0 && <p>{grant.scopes.map(oauthScopeLabel).join(" · ")}</p>}
                    <RevokeAppForm name={name} revokeAction={revoke.bind(null, grant.client.id)} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </AuthCard>
  );
}
