import { NextResponse, type NextRequest } from "next/server";
import { PENDING_AUTHORIZATION_COOKIE, resumeAuthorizationId } from "../../../lib/auth-flow.mjs";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { authConfigured, withAuthorization } from "../../../lib/ui-routes";

export async function GET(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_IDENTITY_BASE_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const id = resumeAuthorizationId(
    request.nextUrl.searchParams.get("authorization_id"),
    request.cookies.get(PENDING_AUTHORIZATION_COOKIE)?.value,
  );
  const failure = (reason: string) =>
    NextResponse.redirect(new URL(withAuthorization("/auth/error", id, { reason }), site));

  if (!code) return failure("link");
  if (!authConfigured()) return failure("configuration");

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure("link");
  } catch {
    return failure("link");
  }

  return NextResponse.redirect(new URL(withAuthorization("/passkey/setup", id), site));
}
