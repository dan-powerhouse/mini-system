# Identity host deployment — Vercel

The existing `apps/identity` Vercel package serves login and consent routes together. The production target separates login and OAuth consent hosting and keeps both independent of the mini apps. Supabase remains the identity issuer and application backend. No identity product name or domain is assigned here. Vercel deployment is pending an authorized account connection and successful build.

## Project settings

- Framework: Next.js; root directory: `apps/identity` when importing the complete repository. Alternatively import the standalone identity ZIP contents as the project root. Node.js 22.x (declared in `package.json`); install `npm ci`; build `npm run build`. The checked-in `vercel.json` sets framework/install/build.
- Use `apps/identity` as the root for the current candidate. The production separation of login and consent requires verified cross-origin continuation. Keep mini app routes in their own deployable application.
- Preview is a UI-only build, with no Supabase URL/key. The validator rejects an Auth-enabled arbitrary preview. A real authentication test uses a separately configured stable development origin. Keep default deployment protection for previews; public production login and OAuth consent must be reachable by authorized users of registered clients.
- Production build requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_IDENTITY_BASE_URL`. Supply the selected Supabase project URL, its modern `sb_publishable_…` key and the actual HTTPS origin without a path, query, fragment or credentials. No secret/service-role key, OAuth client secret, personal access token, or Auth signing key belongs here. These are deliberately not committed. Rebuild after changing a `NEXT_PUBLIC_*` variable.
- The existing hosted Registry (`hamwrbmnxzdcdbqjqvae`) remains development/test. Do not provision a paid project or repoint production to Registry without approval. For a stable development alias choose a neutral origin explicitly; do not enroll production passkeys until the permanent origin/RP ID is chosen.

## Auth-side configuration (after stable origin is known)

1. Supabase Auth Site URL = the chosen origin; allow the exact `https://<chosen-host>/auth/callback` URL. OAuth authorization path = `/oauth/consent`. Avoid wildcard production redirect allowlists. Use the exact approved callback URL(s) for each OAuth client; do not conflate these with the identity host's email callback.
2. Set WebAuthn relying-party ID to the approved stable domain, and add its exact HTTPS origin; preserve any already-enrolled credentials by not changing RP ID without a migration plan. Native passkeys remain experimental. Set an explicit email enrollment and recovery policy; test actual delivery before release.
3. Register each relying application as a native OAuth client (authorization code + PKCE, state, nonce as applicable, exact callbacks). Applications initiate at the Supabase issuer authorization endpoint, not at a handcrafted login URL; the issuer sends users to Vercel consent and handles code/token exchange. Use verified OIDC discovery and JWT validation. Client secrets, if any, belong to the relying application's server.
4. Identity consent does not grant Registry access. Keep the deployed OAuth data deny boundary; use explicitly approved per-user/client/workspace/operation grants only after verified MCP dispatch is implemented.

## Release gates

`npm ci && npm test && npm audit --audit-level=high && npm run build && npm run typecheck` in `apps/identity`. CI workflow `identity.yml` executes these checks. Verify login, signup, recovery, check-email, passkey setup, consent, sign-out, callback failures in a browser; verify actual email/PKCE/consent and passkey ceremony on the approved stable origin; check cache-control and CSRF protections and issuer redirect binding. Verify Vercel deployment URL, actual Auth configuration and no backend secrets in client bundle before checking deployment complete. User-supplied source has passed 15 unit tests after adding four config tests; full package installation/build and live browser checks have not passed in this environment.

References: https://vercel.com/docs/monorepos ; https://vercel.com/docs/project-configuration ; https://vercel.com/docs/environment-variables ; https://supabase.com/docs/guides/auth/oauth-server/getting-started ; https://supabase.com/docs/guides/auth/passkeys
