export function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  const identityUrl = process.env.NEXT_PUBLIC_IDENTITY_URL?.trim() || null;
  return {
    url,
    key,
    identityUrl,
    configured: Boolean(url && key),
  };
}
