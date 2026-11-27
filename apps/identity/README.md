# mini system identity UI

Standalone Next.js App Router app for mini system’s authentication flows. It uses the supplied identity host’s Supabase Auth adapter and OAuth issuer.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The sign-in form can be viewed without credentials. To exercise authentication, set the Supabase project URL, its publishable key, and the UI origin in `.env.local`.

In Supabase Auth, set the Site URL to the UI origin, allow the matching `/auth/callback` URL, and set the OAuth authorization path to `/oauth/consent`. Passkey testing requires a configured WebAuthn relying party ID and origin that match the host used in the browser. Use HTTPS for a hosted origin. Email recovery sends a regular sign-in link for an existing account. Account creation remains a separate, explicit flow and follows the Supabase project's signup settings.

## Pages

| Route | Purpose |
| --- | --- |
| `/login` | Passkey or email sign-in, with a verified session state |
| `/signup` | Create and verify an account by email |
| `/recover` | Request an email link when a passkey is unavailable |
| `/auth/check-email` | Instructions, change address, and resend when the address is available in the same tab |
| `/auth/callback` | Exchange the email authorization code and continue to passkey setup |
| `/passkey/setup` | Create an optional passkey after verification, or continue |
| `/oauth/consent` | Review issuer-supplied details and allow or deny an application request |
| `/auth/error` | Callback and sign-out recovery |
| `/sign-out` | Confirm sign-out from this device |
| `/auth/signed-out` | Sign-out confirmation |
| `/account/connected-apps` | Review and revoke OAuth approvals for the signed-in account |

## Checks

```sh
npm test
npm run build
npm run typecheck
```

## Vercel

Deploy this directory as its own Next.js project on Node.js 22.x. The production build requires the actual Supabase URL, modern publishable key, and permanent HTTPS identity origin. Previews are UI-only and must not contain Auth configuration. Never put server credentials in this package. See `../../docs/VERCEL.md` in the complete repository.
