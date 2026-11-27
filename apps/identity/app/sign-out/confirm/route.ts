import { NextResponse, type NextRequest } from "next/server";
import { PENDING_AUTHORIZATION_COOKIE } from "../../../lib/auth-flow.mjs";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { authConfigured } from "../../../lib/ui-routes";

export async function POST(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_IDENTITY_BASE_URL || request.nextUrl.origin;
  if (request.headers.get("origin") !== new URL(site).origin) {
    return new NextResponse(null, { status: 403 });
  }
  if (!authConfigured()) {
    return NextResponse.redirect(new URL("/auth/error?reason=configuration", site), 303);
  }
  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error && error.name !== "AuthSessionMissingError") {
      return NextResponse.redirect(new URL("/auth/error?reason=sign-out", site), 303);
    }
  } catch {
    return NextResponse.redirect(new URL("/auth/error?reason=sign-out", site), 303);
  }
  const response = NextResponse.redirect(new URL("/auth/signed-out", site), 303);
  response.cookies.delete(PENDING_AUTHORIZATION_COOKIE);
  return response;
}
