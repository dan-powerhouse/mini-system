# Identity and Registry preview acceptance

Start both applications from their package directories with Node.js 22, using the checked-in npm lockfiles. Keep the Supabase settings empty for this preview run. Use the production build for the browser run so dev tools do not affect the focus order or the screenshots.

| App directory | Install and build | Start |
|---|---|---|
| `apps/identity` | `npm ci && npm run build` | `npm run start -- -p 3000` |
| `apps/registry` | `npm ci && npm run build` | `npm run start -- -p 43127` |

Run the browser checks from the repository root with Playwright 1.62.1 and its pinned Chromium installed in the test environment. Set `NODE_PATH` if that environment places Playwright outside the checkout. `FRONTEND_CHROMIUM` optionally selects an installed Chromium binary.

```sh
node --test tests/frontend/preview.test.mjs
```

Set `FRONTEND_SCREENSHOTS` to a directory outside the checkout to save the screenshots from a successful run. The checks cover reflow at 320 and 1440 CSS pixels, browser errors, Identity’s signed-out routes and callback failure, Registry’s Harbor search and record navigation, theme switching, and key response headers. These checks collect the first screenshots for review. Pixel baselines, automated accessibility checks, and manual screen-reader review are separate acceptance steps.

Run the hosted authentication tests against the real Identity and Registry deployments. Test email and passkey ceremonies, consent approval and rejection, concurrent requests, deep-link return, and logout and revocation. Verify that a relying-app OAuth token stays within its approved grants, including when sent directly to the Data API. Exercise a second relying application against the same hosted Identity and test real iPhone and Mac passkeys. Track the hosting and approved grant requirements in [Production v0](../../docs/PRODUCTION_V0.md).

## Native Registry authorization boundary

This check uses real access tokens issued by a disposable local Supabase instance for
the same member. It proves the password session can read a seeded record and the
native OAuth session can neither pass `registry_direct_session` nor read that record
through the direct Data API. From the repository root with the disposable Supabase
stack running:

```sh
python3 tests/supabase/oauth_mcp.py --confirm-disposable --registry-boundary-only
```

The full MCP integration also verifies that granting delegated operations leaves the
direct-session gate closed to the OAuth token.
