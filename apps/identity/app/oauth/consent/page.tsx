import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Icon } from "../../../components/AuthCard";
import { ConsentForm } from "../../../components/ConsentForm";
import { resumeAuthorizationId } from "../../../lib/auth-flow.mjs";
import { oauthScopeLabel } from "../../../lib/oauth-scopes";
import { decideOAuth } from "../../../lib/oauth-decision";
import { safeIssuerRedirect } from "../../../lib/redirect.mjs";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { authConfigured, withAuthorization } from "../../../lib/ui-routes";

export const metadata = { title: "Authorize application" };

async function verifiedContext(id: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const { user } = data;
  if (error || !user || user.is_anonymous || !(user.email_confirmed_at || user.phone_confirmed_at)) {
    redirect(withAuthorization("/login", id));
  }
  const response = await supabase.auth.oauth.getAuthorizationDetails(id);
  return { supabase, user, details: response.error ? null : response.data };
}

async function decision(_state: null, form: FormData): Promise<null> {
  "use server";

  const id = resumeAuthorizationId(form.get("authorization_id"));
  const choice = form.get("decision");
  if (!id || (choice !== "approve" && choice !== "deny") || !authConfigured()) {
    redirect("/oauth/consent");
  }

  const { supabase, details } = await verifiedContext(id);
  if (!details || !("authorization_id" in details) || details.authorization_id !== id) {
    redirect("/oauth/consent");
  }

  let target: string;
  try {
    target = safeIssuerRedirect(await decideOAuth(supabase, id, choice));
  } catch {
    redirect(withAuthorization("/oauth/consent", id, { result: "retry" }));
  }
  redirect(target);
}

function Unavailable({ configured = true }: { configured?: boolean }) {
  return (
    <AuthCard icon="alert" title="Authorization unavailable"
      description={configured ? "This request is missing or expired. Start a new request from your application." : "The identity provider hasn’t been configured."}>
      <Link className="button secondary" href="/login">Back to sign in</Link>
    </AuthCard>
  );
}

export default async function Consent({ searchParams }: {
  searchParams: Promise<{ authorization_id?: string | string[]; result?: string | string[] }>;
}) {
  const query = await searchParams;
  const id = resumeAuthorizationId(query.authorization_id);
  if (!id) return <Unavailable />;
  if (!authConfigured()) return <Unavailable configured={false} />;
  const { user, details } = await verifiedContext(id);
  if (!details) return <Unavailable />;

  if (!("authorization_id" in details)) {
    let target: string;
    try {
      target = safeIssuerRedirect(details.redirect_url);
    } catch {
      return <Unavailable />;
    }
    redirect(target);
  }
  if (details.authorization_id !== id) return <Unavailable />;

  const scopes = [...new Set(details.scope.split(/\s+/).filter(Boolean))];
  return (
    <AuthCard title="Authorize application" icon="shield"
      description={<><strong>{details.client.name}</strong> is requesting access to your identity.</>}>
      <dl className="details">
        <div><dt>Signed in as</dt><dd>{user.email ?? user.phone ?? "Verified account"}</dd></div>
        <div><dt>Return address</dt><dd>{details.redirect_uri}</dd></div>
      </dl>
      {scopes.length > 0 && (
        <ul className="scope-list" aria-label="Requested permissions">
          {scopes.map((scope) => <li key={scope}><Icon name="check" />{oauthScopeLabel(scope)}</li>)}
        </ul>
      )}
      <p className="subtle">Access to workspace data is approved separately in the application.</p>
      {query.result === "retry" && <p role="alert" className="notice error">We couldn’t submit your decision. Try again.</p>}
      <ConsentForm authorizationId={details.authorization_id} decideAction={decision} />
    </AuthCard>
  );
}
