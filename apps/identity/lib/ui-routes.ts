export function withAuthorization(path: string, authorizationId?: string, query?: Record<string, string>) {
  const params = new URLSearchParams(query);
  if (authorizationId) params.set("authorization_id", authorizationId);
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function authConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
