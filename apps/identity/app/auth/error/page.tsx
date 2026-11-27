import Link from "next/link";
import { AuthCard, Icon } from "../../../components/AuthCard";
import { pendingAuthorization, type AuthPageProps } from "../../../lib/pending-request";
import { withAuthorization } from "../../../lib/ui-routes";

export const metadata = { title: "Authentication error" };

export default async function Page({ searchParams }: AuthPageProps) {
  const query = await searchParams;
  const id = await pendingAuthorization(query.authorization_id);
  const signOut = query.reason === "sign-out";
  const unavailable = query.reason === "configuration";
  const title = signOut ? "Couldn’t sign out" : unavailable ? "Authentication unavailable" : "Link couldn’t be verified";
  const description = signOut ? "Your session may still be active. Try signing out again."
    : unavailable ? "The identity provider hasn’t been configured."
    : "The sign-in link may have expired or already been used.";
  return (
    <AuthCard icon="alert" title={title} description={description}>
      <Link className="button primary" href={signOut ? "/sign-out" : withAuthorization("/login", id)}>
        {signOut ? "Try again" : unavailable ? "Back to sign in" : "Request a new link"} <Icon name="arrow" />
      </Link>
    </AuthCard>
  );
}
