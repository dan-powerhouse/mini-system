import { cookies } from "next/headers";
import { PENDING_AUTHORIZATION_COOKIE, resumeAuthorizationId } from "./auth-flow.mjs";

export type AuthPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function pendingAuthorization(fromQuery?: string | string[]) {
  return resumeAuthorizationId(fromQuery, (await cookies()).get(PENDING_AUTHORIZATION_COOKIE)?.value);
}
