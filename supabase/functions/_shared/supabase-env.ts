// Server-side Supabase API keys for Edge Functions. Prefers the current
// publishable/secret API keys (set as Edge secrets REGISTRY_PUBLISHABLE_KEY and
// REGISTRY_SECRET_KEY, since the SUPABASE_ prefix is reserved) and falls back to
// the legacy keys the platform injects. Never expose these values to a client.
export interface SupabaseEnv { url: string; publishableKey: string; secretKey: string }

type Get = (name: string) => string | undefined;

// Optional settings may be outside a restricted --allow-env list; treat that as unset.
export function optionalEnv(name: string): string | undefined {
  try { return Deno.env.get(name); } catch (e) { if (e instanceof Deno.errors.NotCapable) return undefined; throw e; }
}

export function supabaseEnv(get: Get = optionalEnv): SupabaseEnv {
  const pick = (...names: string[]) => names.map((n) => get(n)?.trim()).find((v) => !!v);
  const url = pick('SUPABASE_URL');
  const publishableKey = pick('REGISTRY_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const secretKey = pick('REGISTRY_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishableKey || !secretKey) throw new Error('Missing server-side Supabase configuration');
  if (publishableKey.startsWith('sb_secret_')) throw new Error('Secret key configured as publishable key');
  return { url, publishableKey, secretKey };
}

// Constant-time comparison for shared secrets (e.g. the Cron → Edge secret).
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
