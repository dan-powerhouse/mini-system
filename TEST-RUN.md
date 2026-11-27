# EntityGraph verification run

## Authority WebAuthn verification, 27 November 2026

Base revision `1aeff67`. In `apps/identity`, `npm run typecheck`, `node --experimental-test-isolation=none --test tests/*.test.mjs` and `npm run build` passed on Node 22.23.5. All 19 tests passed, including three new tests that verify real ES256 signatures and reject modified intents, changed sessions, stale counters, foreign origins and missing user verification. `npm audit --omit=dev` reported zero advisories.

A local Chromium run registered a virtual WebAuthn authenticator, used the browser credential API to sign an archive intent, verified the assertion in Node and rejected the same assertion after changing the version. The production queue, enrollment, single-use execution and MCP connection remain open under [H02](docs/PRODUCTION_V0.md#h-mini-app-surfaces).

## Workspace overview, 27 November 2026

Base revision `04a6bda`. On Node 22.23.5, `npm run build` passed for Registry with the existing 12 lint warnings, and `node --experimental-test-isolation=none --test tests/*.test.mjs` passed all 5 Registry tests.

Chromium against the Registry production build passed the 320 px overview layout and axe scan, saved view navigation and reload, Back navigation, role-filtered links, empty saved views, and rejection of a view ID from another workspace. The browser used preview data.

`PGUSER=postgres PGDATABASE=entitygraph_test bash tests/postgres16/run.sh` passed with 128 PASS notices on isolated PostgreSQL 16.16. This was the standalone test runner, separate from live Supabase and MCP integration.

## Frontend stabilization, 27 November 2026

The baseline is the full source snapshot from `registry-pulse-D.zip` (`registry-pulse-d-snapshot`, `b832516`). The archive contains working-tree changes beyond its original Git HEAD. Checks used Node 22.23.5 and a fresh PostgreSQL 16.16 database.

| Check | Observed result |
|---|---|
| `npm ci --offline --ignore-scripts` from each lockfile | Both installs reproduced from the populated npm cache. |
| `npm run build` in both apps and `npm run typecheck` in Identity | Both production builds passed, including the default Registry Turbopack build. Registry reported 12 existing lint warnings and zero errors. |
| `node --experimental-test-isolation=none --test tests/*.test.mjs` in each app | 3 Registry tests and 16 Identity tests passed. |
| `npm audit --omit=dev` in each app | No reported production dependency advisories at the time of the run. |
| Chromium with both Next.js production builds | Preview checks passed for delayed search, template loading and retry, attribute preservation, comma options, required fields, creation, archiving, keyboard relation selection, theme switching, 320 px reflow and desktop workspace navigation. The tested login and relation picker passed the automated axe scan. |
| `PGUSER=postgres PGDATABASE=entitygraph_test bash tests/postgres16/run.sh` | Passed with 125 PASS notices in an isolated `postgres:16-alpine` container. This standalone runner uses the repository's Auth shim. |

The browser run used Harbor preview data and exercised the public login and recovery pages without a Supabase connection. Live email delivery, cross-origin consent, passkeys, real MCP clients and the Authority workflow remain release work. See [Production v0](docs/PRODUCTION_V0.md).

## Archive baseline, 25 November 2026

Run date: 25 November 2026 (Europe/Madrid). Source revision: `5124952d6374bac08741c404afbb5bfce8deb8e8`.

| Check | Observed result |
|---|---|
| Identity unit tests | 15 passed, 0 failed, Node 24.22.3. The application declares Node 22 as its target. |
| Migration manifest | All 17 packaged migration IDs, names and byte hashes matched. |
| Source and test fixtures | Python, JSON, TOML and Bash checks passed. The exchange ZIP fixture and manifest digests matched. Seven workflow test methods were discovered. |
| Application HTTP | Blocked at startup. Supabase CLI and a local stack were unavailable. No new workflow test ran. |
| Edge checks | Blocked before type checking or tests. Deno 2.9.6 was unavailable. |
| PostgreSQL and PGMQ | Blocked before connecting. psql and a local server were unavailable. |
| Filtered-export regression | Included as a hard assertion. No live result was obtained. |

The selected ParallelSandbox integration exposed no runner in this session. The commands in this report ran in the available workspace. No hosted systems were used.

See [test instructions](tests/README.md) for a disposable-stack run. The archived logs under `test-results/` contain the command, process output and exit status for each check.
