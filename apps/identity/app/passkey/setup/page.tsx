import { IdentityLoginHost } from "../../../components/IdentityLoginHost";
import { pendingAuthorization, type AuthPageProps } from "../../../lib/pending-request";

export const metadata = { title: "Set up a passkey" };

export default async function Page({ searchParams }: AuthPageProps) {
  const query = await searchParams;
  const authorizationId = await pendingAuthorization(query.authorization_id);
  return <IdentityLoginHost key={authorizationId} screen="setup" authorizationId={authorizationId} />;
}
