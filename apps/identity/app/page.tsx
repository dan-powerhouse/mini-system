import { redirect } from "next/navigation";
import { resumeAuthorizationId } from "../lib/auth-flow.mjs";
import type { AuthPageProps } from "../lib/pending-request";
import { withAuthorization } from "../lib/ui-routes";

export default async function IdentityHome({ searchParams }: AuthPageProps) {
  const { code, error, authorization_id } = await searchParams;
  const id = resumeAuthorizationId(authorization_id);
  // Supabase can fall back to the Site URL when the configured callback is unavailable.
  if (typeof code === "string" && code) redirect(withAuthorization("/auth/callback", id, { code }));
  if (typeof error === "string" && error) redirect(withAuthorization("/auth/error", id, { reason: "link" }));
  redirect(withAuthorization("/login", id));
}
