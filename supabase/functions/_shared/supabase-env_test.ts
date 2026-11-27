import { sameSecret, supabaseEnv } from './supabase-env.ts';
function assertEquals(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function assertThrows(f: () => unknown) { try { f(); } catch { return; } throw new Error('expected throw'); }
const env = (m: Record<string, string>) => (n: string) => m[n];
Deno.test('prefers current API keys over legacy keys', () => {
  const e = supabaseEnv(env({ SUPABASE_URL: 'https://x.supabase.co', REGISTRY_PUBLISHABLE_KEY: 'sb_publishable_a', SUPABASE_ANON_KEY: 'legacy-anon', REGISTRY_SECRET_KEY: 'sb_secret_b', SUPABASE_SERVICE_ROLE_KEY: 'legacy-service' }));
  assertEquals([e.publishableKey, e.secretKey], ['sb_publishable_a', 'sb_secret_b']);
});
Deno.test('falls back to platform-injected legacy keys', () => {
  const e = supabaseEnv(env({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' }));
  assertEquals([e.publishableKey, e.secretKey], ['anon', 'service']);
});
Deno.test('rejects missing configuration and a secret key used as publishable', () => {
  assertThrows(() => supabaseEnv(env({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' })));
  assertThrows(() => supabaseEnv(env({ SUPABASE_URL: 'https://x.supabase.co', REGISTRY_PUBLISHABLE_KEY: 'sb_secret_x', REGISTRY_SECRET_KEY: 'sb_secret_y' })));
});
Deno.test('shared secret comparison', () => {
  assertEquals(sameSecret('a'.repeat(40), 'a'.repeat(40)), true);
  assertEquals(sameSecret('a'.repeat(40), 'a'.repeat(39) + 'b'), false);
  assertEquals(sameSecret('a'.repeat(40), 'a'.repeat(41)), false);
});
