import { redirect } from "next/navigation";
import { authorizationRoute } from "../../lib/auth-flow.mjs";
import { withAuthorization } from "../../lib/ui-routes";
import { IdentityLoginHost } from "../../components/IdentityLoginHost";
import { pendingAuthorization, type AuthPageProps } from "../../lib/pending-request";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: AuthPageProps) {
  const query = await searchParams;
  const authorizationId = await pendingAuthorization(query.authorization_id);
  if (query.result === "expired") redirect(withAuthorization("/auth/error", authorizationId, { reason: "link" }));
  if (query.result === "complete" && authorizationId) redirect(authorizationRoute(authorizationId));
  if (query.setup === "passkey") redirect(withAuthorization("/passkey/setup", authorizationId));
  return <IdentityLoginHost key={authorizationId} screen="login" authorizationId={authorizationId} />;
}
