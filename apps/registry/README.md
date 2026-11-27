# Registry

Next.js client for Registry and Workspace. Use Node.js 22.

```sh
npm ci
npm run dev
```

The dev server listens on port 43127. Selecting a workspace opens its overview at `/w/[workspaceId]/workspace`. The Registry remains at `/w/[workspaceId]`. Saved-view shortcuts open Registry with the saved search, record kind and status used by the existing filter controls.

## Connect to Supabase

Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for your development project. Existing setups may use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. `NEXT_PUBLIC_IDENTITY_URL` is an optional link to the Identity host.

Registry currently uses a direct Supabase session with email and password.
The browser verifies the issued access token with Supabase Auth and calls the existing
`registry_direct_session` RPC before opening the workspace. The Data API continues to
enforce Registry membership and permissions independently.

An OAuth token issued for a registered application identifies its user and client.
Registry workspace access for that client requires a reviewed delegated operation
and its matching grant. Keep the direct-session entry point for the current web UI
until its delegated operations are covered by an approved contract.

For local sign-in, add `http://127.0.0.1:43127` to the development project's allowed Auth redirects. See the [native API reference](../../docs/NATIVE_API.md) for RPCs.

## Checks

Run `npm test` for editor regression tests and `npm run build` for the production build and TypeScript checks. See [DESIGN.md](DESIGN.md) for the shared visual kit.
