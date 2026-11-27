/** Fail closed in Vercel production; preview without Auth is allowed. */
export function validateDeployConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origin = env.NEXT_PUBLIC_IDENTITY_BASE_URL;
  if (env.VERCEL_ENV === 'production' && (!url || !key || !origin)) {
    throw new Error('Production requires the Supabase URL, publishable key and stable identity origin.');
  }
  if (Boolean(url) !== Boolean(key)) throw new Error('Configure both Supabase URL and publishable key, or neither.');
  if (key && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('Use a Supabase publishable key, never a server credential.');
  for (const [label, value] of [['Supabase URL', url], ['Identity origin', origin]]) {
    if (!value) continue;
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error(`${label} must be an absolute origin.`); }
    const local = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !(parsed.protocol === 'https:' || local)) throw new Error(`${label} must be a secure origin (HTTP loopback for local development only).`);
    if (env.VERCEL_ENV === 'production' && local) throw new Error(`${label} cannot be loopback in production.`);
  }
  if (env.VERCEL_ENV === 'preview' && (url || key)) throw new Error('Preview deployments are UI-only; use the stable development identity origin for Auth testing.');
}
