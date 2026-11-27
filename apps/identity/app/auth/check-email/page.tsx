import { IdentityLoginHost } from "../../../components/IdentityLoginHost";
import { pendingAuthorization, type AuthPageProps } from "../../../lib/pending-request";

export const metadata = { title: "Check your email" };

export default async function Page({ searchParams }: AuthPageProps) {
  const query = await searchParams;
  const authorizationId = await pendingAuthorization(query.authorization_id);
  return <IdentityLoginHost key={authorizationId} screen="check-email" authorizationId={authorizationId} intent={typeof query.intent === "string" ? query.intent : undefined} />;
}
