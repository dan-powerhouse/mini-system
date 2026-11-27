# Current validation

## Earlier independent test evidence — 2026-11-24

- **12/12 migrations** applied in delivered order on a fresh disposable PostgreSQL 16.15 instance. The corrected `tests/postgres16/run.sh` completed with exit code 0 and **105 named PASS notices**, followed by five real-session Registry concurrency checks. All fixtures in this run were removed or rolled back; final workspace count was zero. Execution ID: `549d2f8516d1abfe248a`.
- **Native PGMQ test**: official upstream PGMQ v1.7.0, commit `e359dc936ec5b5c746de61498b5275bebd483bcd`, installed from its unmodified extension SQL/control files on a separate disposable PostgreSQL 16.15 instance. `bash tests/native/run.sh` applied all twelve migrations, ran the Registry suites, installed the real extension, created the locked test queue, applied the optional execution SQL and passed **122 named SQL notices** (105 base + 17 native), plus two concurrent-session tests. Execution ID: `ab728a5c37e992993c1f`. The final concurrent fixture is intentionally retained in that disposable database, not deleted by bypassing immutable publication protection. The extension is not bundled in this repository; it is a native Supabase component. Reference: https://github.com/pgmq/pgmq/tree/v1.7.0/pgmq-extension .
- Public RPC catalog verified directly against PostgreSQL grants: 34 authenticated functions, 9 service-only functions, 43 total non-trigger public functions. Operational execution functions are private and unavailable to anon, authenticated and service_role. Verification ID: `2766ed94d7e0693ba00a`.
- All Edge sources passed frozen Deno 2.9.6 type-checking; five ZIP/CSV and package safety tests passed. Exact source and lock hashes below. Execution ID: `74023ff1367db37fefaf`. The MCP lockfile canonical JSON SHA-256 remains `452d2a0fc3fa27ca7587da6176c413123a5e3d661bdccfa35ede41f83a208f4f`. No live HTTP/Storage integration is implied.
- Local shell syntax, Python AST, TOML and JSON checks passed on the earlier delivered files. Hosted Registry validation is recorded below.

| Regression suite | Named checks |
|---|---:|
| Foundation | 13 |
| Entity RPC | 16 |
| Process storage | 18 |
| Relationship RPC | 5 |
| Registry reads | 11 |
| Workspace access | 3 |
| MCP database access | 5 |
| Dashboard/bulk/saved views | 6 |
| Ordered path reports | 6 |
| Registry exchange | 9 |
| Paginated audit API | 6 |
| Process Kind publication | 7 |
| SQL subtotal | 105 |
| Native PGMQ execution | 17 |
| Registry concurrent-session checks | 5 |
| Native execution concurrent-session checks | 2 |
| Deno CSV/ZIP/package checks | 5 |
| **Total distinct named checks** | **134** |

Publication tests cover atomically allocated versions, exact replay, stale revisions, roles, same-workspace kind constraints, metadata paging, transactional audit, pinned old executions and denial of direct client access. ZIP tests cover digest integrity, path traversal, case collisions, file/directory conflicts, symbolic links and invalid ZIPs. Native execution tests cover transaction rollback of send and claim, duplicate delivery, fenced leases, monotonic progress, explicit retry, terminal success, real lease expiry, reconciliation, cancellation before start and while running, separate operational audit and denied application grants. The two native races establish exclusive claim and idempotent concurrent completion with one audit event. Existing Registry regressions and concurrency checks remain intact.

## Hosted Registry validation — 2026-11-24

Owner-designated persistent development/test project: `Registry` (`hamwrbmnxzdcdbqjqvae`), PostgreSQL 17.12, native PGMQ 1.5.1, eu-west-1. The twelve baseline migrations, native Queue/Storage setup, private execution SQL and identity authorization SQL are installed. All seventeen source migration IDs and exact byte hashes now match the stored hosted statements; do not replay the baseline against this installation.

| Hosted migration version | Name |
|---|---|
| 20261124201904 | registry_foundation |
| 20261124201912 | entity_rpc |
| 20261124201916 | execution_storage |
| 20261124201920 | registry_relations |
| 20261124201924 | registry_reads |
| 20261124201942 | workspace_access |
| 20261124201946 | mcp_access |
| 20261124201950 | registry_operations |
| 20261124201954 | registry_paths |
| 20261124202004 | registry_exchange |
| 20261124202010 | registry_audit |
| 20261124202015 | process_kind_publication |
| 20261124202026 | execution_native |
| 20261124202221 | process_execution_private |
| 20261124205909 | identity_provider |
| 20261125001951 | mcp_read_tools |
| 20261125004055 | mcp_golden_path |

- All twelve SQL regression suites (105 named assertions) plus native execution (17 named assertions) completed successfully on managed PostgreSQL 17.12 with real Supabase roles/Auth schema and PGMQ 1.5.1. psql variables were translated to local transaction settings for the management SQL API; assertions were unchanged. JWT identity was simulated through claim settings; this is not a real Auth/PostgREST HTTP login test. Regression fixtures remained uncommitted and were rolled back by the suites. The earlier independent test count is not additive to these 122 repeated hosted checks.
- Three private buckets (`process-kind-packages`, `process-artifacts`, `registry-exchange`), restrictive object policy, locked native queue and private execution operations are installed. Queue rollback, fenced leases, cancellation, expiry and explicit recovery passed. Storage byte transfer remains untested. No worker API or scheduler is activated.
- MCP v3 was deployed during the initial hosted validation; superseded by v6. Runtime Host is `edge-runtime.supabase.com`, while request URL and `SUPABASE_URL` identify the project. The adapter accepts that exact combination, retains other host/origin checks and performs authorization through `mcp_begin`. Frozen Deno check passed (execution `e43e3eefb76631dcf9db`; checked source SHA-256 `4506aee2a4361a40a9018b7d90802820a72630093b0b44c02e2014fc64e0bfb7`; deployed source differs only in trailing newline). Actual HTTP returned 401 `UNAUTHENTICATED` without credentials and 403 `ORIGIN_NOT_ALLOWED` for an unapproved origin (execution `24ea61be0ec89b271082`). Gateway JWT checking is disabled because MCP uses opaque token authorization. Authenticated MCP protocol round trip remains untested.
- Permanent demonstration fixture: two workspaces (`entitygraph-hosted-test`, `entitygraph-isolation-test`), three synthetic confirmed Auth identities, five entities across the five Registry kinds, one relation and three memberships. Database role simulation confirmed viewer access and cross-workspace denial. Synthetic users were inserted with random password hashes for the test environment; the authenticated HTTP attempt was blocked at the credential-transfer boundary. Do not treat them as verified login accounts. No secrets are included. Do not reset or delete the hosted project or committed fixtures.
- Security Advisor after identity deployment: no ERROR-level finding returned. 11 deny-by-default RLS/no-policy informational findings; 32 authenticated application SECURITY DEFINER warnings and one platform event trigger (`rls_auto_enable`, also flagged for anon); one leaked-password-protection warning. Previous performance review flagged 25 foreign-key index candidates and eight unused indexes. Review rather than blindly revoke legitimate RPCs or remove indexes. See [security advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [foreign-key index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). Not a passed production security gate.
- Identity provider deployment at 20:59 UTC: `supabase/migrations/20261124205909_identity_provider.sql` applied via management migration; exact stored bytes are now included. Seven assertions in `tests/identity/authorization.sql` passed (psql variables converted to local settings); all 122 previous hosted SQL/PGMQ checks reran successfully. **129 distinct SQL assertions** passed on the current installed schema; JWT claims simulated in SQL, not real browser sessions. Existing MCP opaque-token database dispatch remains compatible. Ten restrictive Registry policies, four additional authenticated RPCs and the private link table are installed. Excluding the platform event trigger, 38 application RPCs are authenticated and nine service-only (47 total). The final persistent fixture counts are unchanged: 2 workspaces, 5 entities, 1 relation, 3 users; no persistent identity links or OAuth clients were created. Eleven local identity unit tests passed. Full UI dependency installation/build blocked by missing cached packages and npm DNS resolution; the updated file adapter is not yet validated/deployed.
- Live discovery: `/.well-known/oauth-authorization-server/auth/v1`, `/auth/v1/.well-known/openid-configuration`, `/auth/v1/.well-known/jwks.json` all returned HTTP 200; issuer matches the Registry Auth URL, supported grant types authorization_code and refresh_token, one JWKS key, no advertised registration endpoint. No real OAuth authorization code or passkey ceremony was executed. The user reported enabling passkeys; native WebAuthn settings have not been independently read. No Auth setting or host was changed. The existing project remains active.

## Functional deployment inventory (current)

**Installed** means present in the designated Registry environment; **SQL only** means backend operations exist and passed database checks but the corresponding transport is not deployed/validated. Prepared files are not live services. This is a functionality inventory, not a new architecture or acceptance-completion percentage.

| Area | Deployment | Remaining validation or implementation |
|---|---|---|
| Supabase Auth users and sessions | Native service present | real login, email delivery and session lifecycle |
| OAuth 2.1/OIDC | Enabled, discovery and JWKS verified | client registration, consent host, code/refresh/revocation |
| Passkeys | Enabled per owner; SDK host prepared | stable RP ID/origin, real enrollment/sign-in |
| Identity link to Person, revoke and audit | Installed, SQL tested | real-session integration and authorized application tools |
| OAuth data authorization boundary | Installed, SQL tested | scoped delegated grants; currently denied |
| Login, callback, consent host | Prepared, not deployed | build, hosting, Auth Site URL/path/redirect configuration |
| OAuth client administration and App mapping | Not implemented | native admin lifecycle, explicit authority |
| Account passkey/session/consent management | Partial source | list/rename/revoke UI, recovery |
| Workspaces and membership/roles/invitations | Installed, SQL tested | HTTP/browser and email integration |
| Five-kind Registry (People, Objects, Process Kinds, Agents, Apps) | Installed, SQL tested | expanded custom MCP |
| Type templates, ontology and predicate rules | Installed, SQL tested | expanded custom MCP |
| Relations, temporal validation and archive | Installed, SQL tested | expanded custom MCP |
| Search, filters, signed cursors, traversal and ordered paths | Installed, SQL tested | HTTP and MCP integration |
| Dashboard, bulk operations and saved views | Installed, SQL tested | expanded MCP integration |
| Audit history and token lifecycle | Installed, SQL tested | end-to-end identity/MCP integration |
| MCP 19 tools / 3 resources | Edge v6 active; local authenticated HTTP, actual Registry Golden Path, hosted SQL and negative HTTP verified | hosted authorized HTTP, OAuth and real LLM client |
| Seven additional read tools and three Golden Path tools | Installed; local authenticated HTTP and local/hosted SQL passed | Remaining management tools and browser OAuth |
| OAuth MCP delegation | Not implemented/active | scoped grants, resource audience/discovery, audit |
| Import/export preview/commit | SQL only; adapters prepared | deploy/test adapters and actual CSV/ZIP transfer |
| Storage | 3 private buckets installed | actual byte transfers and signed URLs |
| Process Kind immutable publication | SQL only; adapter prepared | semantic package review, publication/download integration |
| Processes and operational state | Installed privately, SQL/PGMQ tested | approved requester binding and execution API |
| Native queue, dispatch, claim, heartbeat, finish, expiry, retry, cancel, reconcile | Installed privately, real PGMQ tests | worker authorization and real execution; no active worker |
| Edge identity and artifacts | Not active | machine credentials, assignment and delivery |
| Cron and scheduled maintenance | Not installed/active | preserve test data; no automatic cleanup |
| Registry management UI | Explicitly out of scope | custom MCP is the application interface |
| TypeScript generated types | Generated from hosted public schema; strict standalone compile passed | integrate with adapters and regenerate when schema changes |
| Security/performance hardening, load, CI, recovery | Partial | advisor review, real load and restore drill |
| Execution graph | Explicitly deferred | not in current implementation |


## Reproduce

Use `tests/postgres16/run.sh` on a **new disposable** database named `entitygraph_test`. The corrected runner refuses an existing Auth schema or workspace table. After the SQL harness, run `python3 tests/postgres16/concurrency_test.py` on that same disposable database. The independent harness emulates Supabase JWT claims; it does not prove actual Auth, PostgREST or Edge runtime behavior. For native execution, use `tests/native/run.sh` only on a separate fresh PostgreSQL 16 instance with actual PGMQ extension files installed, DB name `entitygraph_execution_check`. It intentionally retains the committed concurrent fixture, so discard the test database afterward. `scripts/check-edge.sh` includes all frozen Edge checks and codec tests. `scripts/provision-local.sh` and `tests/supabase/smoke.py --confirm-disposable` are the local Supabase stack gates (fresh startup, migration-up, native verification, pgTAP, lint and real Auth/Data API smoke observed successful); `--mcp` requires the local function explicitly enabled. Native Queue/Storage setup, private execution and identity authorization are included in the fifteen migrations; `scripts/provision-native-local.sh --confirm-local` verifies local resources without replay. Standalone runners deliberately omit Storage DDL (real Storage schema required), while the native runner installs actual PGMQ and runs identity checks. No worker/Edge access is enabled.

## Unfinished and unverified

The explicit CI reset/re-run, hosted authenticated HTTP and MCP protocol smoke tests, Storage byte transfer integration, load, CI execution, branch protection, backup/restore, invitation delivery, live import/export, signed Storage export delivery, native Cron cleanup, expanded MCP and the identity-only Next.js host remain outstanding. Publication is prepared and type-checked with SQL regressions, but the semantic package format, actual Storage immutability/retrieval with digest verification and orphan reconciliation remain open. The execution SQL and real PGMQ tests are prepared and passed; requester binding, Edge identity and authorization, routing/assignment, lease and retry/backoff policy, execution API, artifact delivery and scheduler activation still require review. No execution graph is introduced. The baseline 110 acceptance requirements are retained with explicit presentation/catalog amendments and ten additional production v0 gates (111–120). The designated hosted Registry development project is installed and retained; no production project was deployed. This is a provisioning source package and development installation, not a production-ready application. The earlier 134 named checks are not a count of completed acceptance criteria; current hosted regression assertions are separately reported above.

## Production v0 Foundation verification — 2026-11-24

- Live migration history was queried read-only via the connected Supabase management API; all 15 installed migration versions, names and SHA-256 hashes of stored SQL exactly match `supabase/migration-manifest.json` and the current migration files. The three formerly separate provisioning files are now their exact hosted migration files; no replay, repair or change was made to Registry. The live project still has 2 workspaces, 5 entities, 1 relation, 3 Auth users, 0 OAuth clients and 0 identity links. PostgreSQL 17.12 and PGMQ 1.5.1 confirmed.
- The exact deployed MCP v3 `index.ts`, `schemas.ts` and `deno.json` were fetched from the management API. The repository source had a single additional trailing LF in `index.ts`; normalized to the deployed bytes. The repository retains the pinned lockfile; the management download does not return it. No redeploy.
- Official generated public TypeScript schema obtained from the live Supabase generator and saved to `supabase/types/database.types.ts` (57,338 bytes, SHA-256 `570094d5d74bc4cce3fc396d44d7c0247ce6f208a8d55ab94a1bb02f59421295`). `tsc --noEmit --strict --target ES2020 supabase/types/database.types.ts` passed. Types describe schema, not granted client operations; private tables and secrets remain unavailable.
- Fresh standalone PostgreSQL 16.15 revised runner passed 112 SQL checks (105 Registry + 7 identity) plus five concurrent-session checks, zero remaining workspaces. Execution ID `639ab1c7baf0e377eca6`. Real upstream PGMQ 1.7.0 native runner passed 129 SQL checks (105 Registry + 7 identity + 17 native) plus two concurrent-session checks. Execution ID `95ba7d4da8ac08fb3fdd`. These are reruns, not additive new acceptance counts. The test-only Auth shim is not proof of real Auth sessions. Exact test runner/source hashes below. The hosted project was not modified.
- Pinned Supabase CLI 2.76.8 initially rejected the old `db.major_version = 16` config. Corrected local full-stack config to 17 (matches hosted major); standalone tests remain on 16. Fresh local Supabase startup succeeded with the corrected configuration.
- The source contracts now implement the owner's MCP-first direction with an identity-only Next.js UI, nine compatibility tools plus reviewed expanded business catalog, no raw SQL/management MCP exposure, OAuth delegation as a gated requirement, and separate Process execution activation. This is not a deployment of the expanded tools.

Migration checksums: `supabase/migration-manifest.json` (all seventeen byte-exact hosted SQL statements). Re-run `python3 scripts/check-migration-history.py` offline; `--live` is a read-only psql comparison against the explicitly selected Registry database. CLI statement serialization may differ in other environments; any mismatch is reported conservatively, never repaired automatically.

Current regression source hashes:

```text
1534924cf7ebd8e307b9b0c90412f1cb215c22ddbab13000e415f9380aa472dd  tests/identity/authorization.sql
064596444aef3072d50d24539375bb2227c4eebca283e9643f90e5b303323b7f  tests/native/concurrency_test.py
8abbe9cfbcf1323daa8eaa519114085fad642bbf32ff12ec4bba37b2b8c2c50d  tests/native/process_execution.sql
c8c6962fe68ba44ba76159a9375744a8a252127c4da77d0dcdd62889f0fb1212  tests/native/run.sh
d0e6eb758c8d3306aa158ffdd351804e0097d501b9335e1189c6fa6875a01540  tests/postgres16/auth_shim.sql
11d3dbc0d7efc61b00b4bb2a8609de486105315fbd424f202a69709e1f6b0fea  tests/postgres16/concurrency_test.py
46da866f79d4304ca306260b0e37f553a61280ae905fc92b3d58870388536d83  tests/postgres16/entity_rpc.sql
437781957505a1dfa4f887830c196b3fe8b3b08b669ebf9a7112af0ce3fe5ee1  tests/postgres16/mcp_access.sql
e555c385cc42bce66be0c5ac84378002f7ba9fe550ea5e2ea427e389cd8544cd  tests/postgres16/process_kind_publication.sql
085151be50cfeb31a635f47b0107c8225abde16cf58507c29097084fe3bdddf0  tests/postgres16/process_storage.sql
3b1c0386336fd470f2a8457d25a68e3f48895df7a48b86708d48dd585adb8798  tests/postgres16/registry_audit.sql
8b7ca97c35fae6d31c4b1b4d3d26c631c6c2a1ea555527bc69dc64d6ed772303  tests/postgres16/registry_exchange.sql
e768365de985f40d8c4dbb9469588f2c4105b836be2c2e097da1b9eee656bfa5  tests/postgres16/registry_operations.sql
60f567822419934e78fa3240ced6c284f2667218dedcd2a9d5d998c679de4280  tests/postgres16/registry_paths.sql
403531dea35c1ef688d75dec7f9f3ac0d1c6b15b0ffdd5b1c8f847e935ebb0fc  tests/postgres16/registry_reads.sql
3cc2d8c16061d4f96a8ed5bad741d27aa253eecda073cc21a2df1126ce97f9e9  tests/postgres16/relations_rpc.sql
ff0cd37f4024aed09c2e34570261ab4186ea53d80975eff9f4671b0d2aafe142  tests/postgres16/run.sh
d47cf9eb769c2647682e9b08c898fbfd55526dadbb5c407e5575253029a7356f  tests/postgres16/verify.sql
b6f6571bd1adcfbabc8e82c78820439702d4facdc21af9a80c7cb6bf3a64807f  tests/postgres16/workspace_access.sql
88dff8915fb04eb262166f5bb856812bfa6b29e71c1994f1862a9e5448240f70  tests/supabase/smoke.py
```

## Fresh full Supabase stack verification — Foundation

Official CLI **2.76.8**, local PostgreSQL **17.6**, native PGMQ **1.5.1**, actual Auth, REST, Storage and gateway containers (disposable isolated environment, not Registry). All fifteen exact migration files applied successfully on first `supabase start`. Local history IDs matched source; `supabase migration up --local` reported “Local database is up to date.” No hosted migration was applied or changed.

| Executed check | Observed result | Evidence ID |
|---|---|---|
| Fifteen actual migrations, native queue and three private buckets, execution write denial | PASS | e7c454a8539abb960884 |
| `supabase test db` | 16/16 pgTAP checks, PASS | 3c9a55ade1a4e12f916c |
| `supabase db lint --local --level error` | exit 0 | 3c9a55ade1a4e12f916c |
| `python3 tests/supabase/smoke.py --confirm-disposable` | real Auth password sessions, RPC/RLS isolation, direct write denial, invitations and immediate role downgrade, PASS | 706512706877809eed73 |
| `supabase migration up --local` | no pending migrations | b0d1e438e39f740ec769 |
| Identity authorization SQL on real Supabase schema | 7/7 repeated assertions | b0d1e438e39f740ec769 |
| Native execution SQL on real Supabase PGMQ | 17/17 repeated assertions | b0d1e438e39f740ec769 |
| Identity unit tests | 11/11, local Node test runner | local |
| Generated types | TypeScript 5.8.3 strict standalone compile, PASS | local |
| Static package checks | all JSON/TOML/Python/shell parse; all 15 manifest entries match | local |

The actual local Auth smoke uses password sessions for synthetic test users, not the production passkey/OAuth login UI. It covers owner/editor/viewer and a second workspace, not a full exhaustive admin role or hosted JWT suite. The explicit CI reset, hosted authenticated MCP, real OAuth/passkey flow, signed Storage byte transfer and complete production gates remain open. Foundation A04/A05 are complete for the current development source, A06 remains the owner-selected domain/production target decision. Test fixture data in the hosted Registry is preserved.

## Type-checked source hashes

```text
2067320f5e26b8e78857e4c3d4feafaf8e8e755caadfa19cc6fc518b3420b697  supabase/functions/mcp/index.ts
ac8d4990c0221398bef878a0b5e2c6971860775b94b441c9f1013e532edd63e9  supabase/functions/mcp/schemas.ts
d6d066fd6118b0cd6bc0cf25d217d0e05287968ff7ee4b9e6eb48920c0ef0979  supabase/functions/mcp/deno.json
61a3c97d4c0ad4ced60ce3a8ca0b276da9d025670620b6ee662a22bf55396380  supabase/functions/_shared/exchange-http.ts
459999486375b11a8b23496d09777c30826de62a554c30873e970d7da6cbe4a1  supabase/functions/_shared/exchange.ts
56f844f67a9c50a69b61d23fcbe298bc5c989c65778d667688ac5e5df5953643  supabase/functions/_shared/exchange_test.ts
be8275becedb3cd32781fb67ccc53cecfb79d820d986588cfed185e9b6d0419e  supabase/functions/_shared/process-package.ts
8b1c9db277401f8f7ab0e19c77cd3e33f50f51a3d6cd8910e5de5626803eb540  supabase/functions/_shared/process-package_test.ts
ae1fdb417e728b3d6f7075eb1e2a640a569cce1378bba3c5387444f235e67cb9  supabase/functions/import/index.ts
7282aed6918a9d139b1d90c80835bd0e1a05d719e057a7be25e5b3bbd8729770  supabase/functions/export/index.ts
a19dc19017b85bfbd435dc5f6bbae26758592963b72894bc0c992ce3da5c3818  supabase/functions/exchange-cleanup/index.ts
c6106973df9706e899624f4713ac72f93f808e2c32293bc6ec44fa1abc17faa2  supabase/functions/publish/index.ts
3d3a65ce772e6c71691f6048e89a5866ede65503597b4784cdfd6b602f88a49c  supabase/functions/deno.lock
```

## Current login and delegated authorization validation (2026-11-24)

- Owner-supplied `EntityGraph-Login-UI(1).zip` integrated in `apps/identity`; all 11 supplied tests plus 4 new Vercel config tests pass with Node 22.16.0. No UI redesign or brand/domain assignment. `vercel.json`, Node 22 engines, CI and deployment runbook added. Vercel not connected; deployment, full dependency install/build/typecheck/audit and browser validation pending. Local offline npm ci failed ENOTCACHED; bounded network attempt did not complete.
- C01 candidate `supabase/provision/oauth-grants.sql` and `tests/identity/oauth_grants.sql`: eight named checks passed in a rollback-only transaction on managed Registry using synthetic native Auth rows; no migration applied, no OAuth client or grant committed, no token verification or dispatch activated. Existing 15 migration bytes unchanged. See `docs/DELEGATED_AUTHORIZATION.md`.

## MCP read-tool release evidence (v5, superseded) — 2026-11-25

- Migration `20261125001951_mcp_read_tools.sql` SHA-256 `94e435391f045a911e6494ef4a04bad3704f20a5b4dfc35ad7dbac53ac5926a7` applied; hosted hash matches. No permission expansion for writes. New read helper private; original ticketed dispatcher and audit preserved.
- Eleven new read SQL assertions and five existing MCP access assertions passed after migration on both isolated real local Supabase and hosted Registry. Rollback fixtures; no persistent dataset changes. Previously passed 129 distinct SQL checks plus 11 new = 140 unique named SQL checks across iterations, not a full post-v5 rerun.
- Frozen Deno 2.9.6 / SDK 2.4.0 compilation and four tests passed (`e7c17032e683354e156f`). Index SHA `cdb8ac6bfc5009ac0aa6af01230e20aafcc1bafd7427dbe384a58bec5d9fcaf6`; read schema SHA `fa5c71b3698aa18c7ace875059a6b62fd7a6285fc1d188bf7daf77fcdf8d12f0`; register SHA `7d088d0b58c02cdd7efe144af54554b9bfd445a7be773dfc71cb3c5ea68ff82f`. Actual authenticated local HTTP test `tests/supabase/mcp_read_smoke.py` SHA `266defe88231e16cbc08409563e1e94503c5890fa12489f4edbad26000dd62d7`, execution `e4f984ae2e2b41b90026`: discovery, 16 tools, all seven strict reads, pagination, existing resource/entity read, cross-workspace/forged-context/viewer-write denial, token revocation. Test credentials generated/used only in the disposable local environment. Packaged runner `tests/supabase/run_mcp_local.py --confirm-disposable` passed from startup through shutdown (`a6fc312c240b0dfae0fc`); runner SHA-256 `21ce0fe4c13005d8eb06fd2efa9be5e5ec9cc289579863a8c1ba924a18bcf6c5`. The local CLI-bundled runtime 1.70.3 (Deno 2.1.4) rejected lockfile v5; exact adapter executed directly under Deno 2.9.6, without modifying lockfile. Production runtime/version alignment remains a release gate.
- Active MCP v5 (function ID `7196a8df-4168-4e71-8c25-eeae2d3bb6d8`, bundle SHA `f70e9f3db794d91055da34c7ffe4c843ff46fb4ba998c24a72fee0cddb202f62`), HTTP 401/403 passed (`aa7d0169b862bf6b193c`). Actual hosted authorized HTTP is not verified. No OAuth clients/grants or worker access enabled. Advisor categories unchanged; [SECURITY DEFINER RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain open.
- Persistent Registry inventory: 16 migrations, 2 workspaces, 5 entities, 1 relation, 3 Auth users, 0 registered OAuth clients. No cleanup scheduled. Vercel deferred. Production catalog, delegated OAuth, administration tools, signed files, package semantics, security/load/recovery gates remain open.

## Current MCP v6 Golden Path development release — 2026-11-25

- Migration `20261125004055_mcp_golden_path.sql` SHA-256 `1e6773e44a41e70c52fa6956f13ea52bbdf1ca1ada092ef2b185aaac75b6f125` matches actual hosted history. New private helper and existing dispatcher extend the closed catalog. The existing `api_token` scope constraint and issuance RPC accept opt-in `manage` only with `write`, for current owners/admins; no old credential is modified. Native optimistic ontology RPCs enforce create-only operation. Entity history is a compact projection over native signed audit paging.
- Five new SQL checks passed locally (`c932aa115f053f74a83f`), against hosted Registry in a rollback transaction before migration and again after migration. Previous eleven read and five compatibility SQL assertions passed against local real Supabase after v6 (`801351d85f3f79802b2f`). 145 distinct named SQL checks across iterations, not a full post-v6 suite rerun.
- Frozen Deno 2.9.6/SDK 2.4.0 compile and four tests passed (`2c490a4ad448dfdfb3c4`); index SHA `60c98080004b3ef94eb090f5e1a1e2bf33be9499cb6f69cde871c262321817a5`, golden-tools SHA `7843a12706fcf9245c2f2f91def6bc577066f3dcf34be8e86ac6fcdfb4fee08c`.
- Actual full local HTTP acceptance passed twice. Strengthened final run `0b5c555fa5d38c02f4b9` executes real Supabase password login and workspace/credential bootstrap, discovers supported kinds and permissions, creates five dynamically generated templates and a predicate through actual MCP, enforces required fields, creates all five kinds and four real links, searches, traverses, updates with expected version, refuses stale version/viewer/old-scope writes, reads real paginated audit history, refuses foreign audit access, and revokes the token. Independent authenticated PostgREST reads verify exactly the expected persisted entities, relationships and two successful entity history events; denied writes leave state unchanged. Golden Path test SHA-256 `0f0b27a9e3c32b5326d71983d98b511e6adcb6282c36bb1f319a36c45022c92b`. Local disposable fixtures retained. CI configuration includes the SQL and HTTP acceptance suite; CI itself not run on GitHub.
- MCP Edge v6 ACTIVE, function ID `7196a8df-4168-4e71-8c25-eeae2d3bb6d8`, bundle SHA `84effe317e1564071d0d45477b0f72e3d3db61283749cee227ec69954bbaa95f`. Hosted negative HTTP 401/403 passed (`801351d85f3f79802b2f`). Actual authorized hosted HTTP and real LLM client remain unverified. The local CLI Edge runtime lockfile incompatibility remains; exact pinned Deno adapter ran against native local services.
- Registry retains 2 workspaces, 5 entities, 1 relation, 3 Auth users, 17 migrations. No reset, fixture deletion, OAuth activation, worker deployment or production deployment. Advisors still report the existing RLS default-deny information and intended security-definer warnings, plus leaked password protection warning; [definer review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain open.

## Native platform hardening — 2026-11-26

Not applied to any hosted project. Five additive migrations, Edge key handling and identity dependency update.

- `20261126170000_foreign_key_indexes.sql` and `20261126170010_execution_foreign_key_indexes.sql`: covering indexes for all 28 previously unindexed foreign keys (the second covers the private execution tables and is skipped by the plain PostgreSQL harness, like `process_execution_private`).
- `20261126170030_audit_event_order.sql`: `audit_log.at` defaults to `clock_timestamp()`. With `now()`, events in one transaction shared a timestamp and history order fell back to the random id; `tests/mcp/golden_path.sql` failed 8/20 runs before and 0/20 after.
- `20261126170020_native_platform.sql` (Supabase platform only; both standalone harnesses skip it): `process-kind-packages` and `registry-exchange` enforce 20 MiB and `application/zip` in Storage itself; `pg_graphql` removed (`api.schemas = ["public"]`); native `pg_cron` + `pg_net`. Hourly `private.maintenance_purge()` deletes expired MCP request tickets and export snapshots (never audit rows). Every 15 minutes `private.invoke_exchange_cleanup()` calls the `exchange-cleanup` Edge Function with Vault secrets `project_url` and `exchange_cleanup_secret`; it is a no-op until both exist. Process expiry/reconcile are intentionally not scheduled (worker activation gate).
- Edge: `_shared/supabase-env.ts` prefers current API keys (`REGISTRY_SECRET_KEY`, `REGISTRY_PUBLISHABLE_KEY` Edge secrets) and falls back to injected legacy keys; Import/Export/Publish verify user JWTs with `auth.getClaims()`; `exchange-cleanup` accepts only the dedicated `EXCHANGE_CLEANUP_SECRET` (constant-time compare), no longer the service-role key. `@supabase/supabase-js` aligned to 2.112.4 in all functions; lockfiles regenerated.
- `config.toml`: bucket limits, OAuth 2.1 server (consent path `/oauth/consent`, dynamic registration off), anonymous sign-ins off, identity callback redirect, Edge runtime and secret mapping. Leaked-password protection and passkeys have no CLI key and stay dashboard settings.
- `apps/identity`: `next` 15.5.23 → 15.5.29 (critical advisories) and `postcss` override 8.5.33; `npm audit --omit=dev` reports 0 vulnerabilities.

| Executed check | Result |
|---|---|
| All 22 migrations on `supabase/postgres:17.6.1.081` with real GoTrue v2.186.0 / Storage v1.37.7 schemas | PASS |
| pgTAP `foundation_test.sql` + new `native_hardening_test.sql` | 16/16 + 12/12 |
| All SQL regression, identity, OAuth-grant, MCP and native PGMQ suites rerun after the new migrations | 0 failures, 0 residual workspaces |
| Vault-configured cleanup enqueues `net.http_post` to `/functions/v1/exchange-cleanup` with the Bearer secret (rolled back) | PASS |
| `scripts/check-edge.sh` (Deno 2.9.6, frozen) | 4 + 9 tests |
| `scripts/check-migration-history.py` | 22 entries match |
| Supabase CLI 2.76.8 parses `config.toml` | PASS |
| Identity: 15 tests, typecheck, `next build`, `npm audit` | PASS, 0 vulnerabilities |

CI fixes for gates that were already red on `main` after the package import:
- `tests/postgres16/auth_shim.sql` grants `extensions` schema usage to API roles, as the Supabase platform does (`read_tools.sql` failed with `permission denied for schema extensions`). Plain PostgreSQL 16 `run.sh`: 128 PASS, concurrency 5 PASS.
- `tests/supabase/local_adapter.py` port pre-check uses `SO_REUSEADDR` like Deno, so the previous adapter's TIME_WAIT on port 8000 no longer fails `exchange_workflows.py`; a live listener is still refused.
- Identity `npm audit` gate: resolved by the dependency update above.
- Edge key lookup treats settings outside a restricted `--allow-env` list as unset (`optionalEnv`), and the local adapter allows the optional key names; every adapter starts and answers 401/405 under the CI flags.

Export portability (Acceptance 68): `tests/postgres16/export_reference_roundtrip.sql` required the default export (archived excluded) to import into a fresh workspace, while `registry_exchange.sql` expected that export to omit an archived entity the active one references through `entity_ref`. Resolved by `20261126170040_export_dependency_closure.sql`: exports add every entity transitively referenced through `entity_ref`, even if archived or of an unselected kind; unreferenced archived entities stay filtered out. `registry_exchange.sql` now asserts both (an unreferenced archived entity is excluded, the referenced one is included). Plain PostgreSQL 16 job fully green, including the round trip.

Full `supabase start` (PostgREST/Kong/Edge HTTP) could not run in the verification container; CI `db.yml` covers it.

Hosted rollout: `supabase db push`; then `select vault.create_secret('https://<ref>.supabase.co','project_url'); select vault.create_secret('<random ≥32 chars>','exchange_cleanup_secret');`, `supabase secrets set EXCHANGE_CLEANUP_SECRET=<same value>` (and optionally `REGISTRY_SECRET_KEY`/`REGISTRY_PUBLISHABLE_KEY`), deploy `exchange-cleanup`, then `supabase config push`.

## Delegated OAuth MCP access — 2026-11-26

Not applied to any hosted project; requires independent auth review. Design and gates: [DELEGATED_AUTHORIZATION](docs/DELEGATED_AUTHORIZATION.md).

| Executed check | Result |
|---|---|
| 23 migrations on `supabase/postgres:17.6.1.081` with real GoTrue v2.186.0 / Storage v1.37.7 | PASS |
| All SQL suites incl. `tests/identity/oauth_grants.sql` (8) and new `tests/identity/oauth_dispatch.sql` (8), run twice | 149 PASS per run, 0 failures |
| pgTAP `foundation_test.sql` / `native_hardening_test.sql` | 16/16, 12/12 |
| Plain PostgreSQL 16 `run.sh`, concurrency, export round trip | PASS |
| `scripts/check-edge.sh` | 4 + 9 tests |
| `tests/supabase/oauth_mcp.py` — real GoTrue OAuth server (authorization code + PKCE), PostgREST 13.0.7, exact MCP adapter under Deno 2.9.6 | 5 PASS |
| Existing `egt_` HTTP suites against the same adapter (`mcp_read_smoke.py`, `golden_path.py`, `registry_workflows.py`, `smoke.py`) | PASS |

The local HTTP run replaced Kong with a minimal path proxy; CI runs the same tests on the full CLI stack.

## Unified package — 2026-11-27

Merged the Cursor Origin repository `dan-voulez/registry-pulse` (commit `ce2f4a3`, adds `apps/registry`) with the newer `Registry-main` backend (23 migrations, native hardening, delegated OAuth). Nothing was applied to any hosted project.

Changes beyond the merge:
- `supabase/config.toml`: `http://127.0.0.1:43127/` added to `additional_redirect_urls`, so `apps/registry` sign-up confirmation and password recovery links work on a local stack (the registry README already required it).
- `apps/registry`: `next` and `eslint-config-next` 15.5.9 → 15.5.29, `postcss` override 8.5.33 (same fix as `apps/identity`), `sharp` 0.34.5 → 0.35.5 in the lockfile.

`apps/registry` calls 31 RPCs, 5 tables and the import/export functions; none of their signatures changed in the six new migrations (`export_create` was replaced with an identical signature). The import/export functions still accept the user session the app sends. `apps/registry/lib/database.types.ts` predates the new OAuth RPCs; regenerate it from a live stack when one is available.

| Executed check (Node 22.23.5, PostgreSQL 16.15, Deno 2.9.6) | Result |
|---|---|
| `scripts/check-migration-history.py` | 23 entries match |
| `apps/identity`: 15 tests, `tsc`, `next build`, `npm audit --omit=dev` | PASS, 0 vulnerabilities |
| `apps/registry`: `tsc`, `eslint` (0 errors, 12 warnings), `next build`, `npm audit --omit=dev` | PASS, 0 vulnerabilities (before the update: 1 critical, 2 high) |
| `tests/postgres16/run.sh` on a fresh disposable database | 128 PASS, exit 0 |
| `tests/postgres16/concurrency_test.py` | 5 PASS |
| `tests/postgres16/export_reference_roundtrip.sql` | PASS |
| `scripts/check-edge.sh` | 4 + 9 tests |

Not run here (no Docker daemon or Supabase CLI): `tests/identity/oauth_grants.sql` and `oauth_dispatch.sql` (need the real `auth.oauth_clients` table), native PGMQ suite, pgTAP, `run_application_local.py`, `oauth_mcp.py`, browser OAuth/passkeys. These remain open for this unified package.
