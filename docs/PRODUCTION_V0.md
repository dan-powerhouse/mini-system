# mini system — Production v0 tasklist

**Target.** The native Supabase backend supports ChatGPT and Claude through the custom MCP (target revision `2026-07-28`) and the Registry, Authority and Workspace mini app surfaces. Shared login and OAuth consent have separate hosting. The official Supabase MCP is restricted to development and administration.

**Baseline:** seventeen reconciled migrations, 38 authenticated RPCs, 9 service-only RPCs, 9 private execution functions, MCP v6 with 19 tools and 3 resources, three private buckets, PGMQ 1.5.1. 129 previously passed SQL checks plus eleven read-tool and five Golden Path SQL assertions (145 distinct named SQL checks across iterations, not a complete rerun after v6); 15 identity unit tests; 4 MCP contract tests. Actual local authenticated MCP HTTP and Registry Golden Path passed using pinned Deno and local Supabase, including independent authenticated database persistence verification. Hosted v6 security smoke passed. Development Registry fixtures preserved; not production acceptance.

**Status:** [x] = completed in development baseline; [ ] = remaining production task. **P0** = release blocker; **P1** = later enhancement or separately gated capability. A checked item is not a claim of production deployment.

## A. Scope and release baseline

- [x] A01 — Native Supabase Registry schema, five kinds (People, Objects, Process Kinds, Agents, Apps), relationships, role model, queries, audit and immutable publication SQL installed and tested in development.
- [x] A02 — Native OAuth/OIDC discovery and JWKS verified; restrictive identity boundary and account-to-Person link functions installed.
- [x] A03 — Custom MCP Edge endpoint deployed in development; opaque token authorization and negative HTTP checks passed. Identity host source prepared.
- [x] A04 (P0) — PLAN/CONTRACTS/ACCEPTANCE/DECISIONS amended for MCP-first, login-only UI, rich catalog, delegated OAuth and release gates. Nine compatibility tool contracts preserved; exactly-nine restriction superseded. Protocol/client compatibility remains a separate D05 gate.
- [x] A05 (P0) — Reconciled all seventeen migration IDs and exact SHA-256 hashes, integrated native/identity migrations and generated public types; fresh standalone Registry/identity and real PGMQ runners passed. Fresh local Supabase CLI 2.76.8 / PostgreSQL 17.6 / PGMQ 1.5.1 installed all fifteen migrations, native verification, pgTAP, lint, real Auth/PostgREST smoke and migration-up no-op passed. No reset of Registry. Production CI, hosted authenticated smoke and final OAuth/LLM gates remain separate. Migrations 16 and 17 exact hashes reconciled and independently verified on Registry.
- [ ] A06 (P0) — Select production Supabase target and stable identity origin/RP ID. Vercel is approved for the independent identity host; the Registry development project is preserved. No new paid resource or assumed domain.

## B. Shared login and OAuth consent

- [x] B01 (P0) — Supplied login-only Next.js application integrated as `apps/identity`: dark UI, login, signup, recovery, callback, passkey enrollment, consent, and sign-out. Source completion accepted by owner. Browser accessibility and runtime validation remain B02/B04.
- [ ] B02 (P0) — Build, typecheck and dependency/security-check the actual Next.js package using its lockfile; test in a real browser. **Partial.** Node 22 build, typecheck, 16 tests and signed-out Chromium preview passed. See [test run](../TEST-RUN.md) for the observed results.
- [ ] B03 (P0) — Configure Supabase Site URL, exact redirect allowlist, `/oauth/consent`, WebAuthn RP ID/origins, production email delivery and an explicit enrollment/recovery policy. The permanent RP domain must precede real passkey enrollment.
- [ ] B04 (P0) — Test sign-in, magic-link callback, passkey enrollment/sign-in, expired/cancelled challenge, sign-out and recovery. Include OAuth consent on its separate origin and verify the complete login-to-consent continuation. Keep a tested fallback while native passkeys are experimental.
- [ ] B05 (P0) — Register approved OAuth clients with exact callbacks; test authorization code/PKCE, state, nonce where relevant, approve/deny, refresh, consent withdrawal and session revocation. Verify issuer, key rotation, audience/resource binding, expiry and access-token versus ID-token distinction. No dynamic registration by default; review client compatibility first.
- [ ] B06 (P0) — Test existing identity link/unlink and person lookup through real sessions. No automatic Person linking by matching email and no global permissions from a link. Provide safe account security/revocation paths using native Auth, not workspace admin impersonation.
- [ ] B07 (P1) — Additional passkey management UX and optional extra sign-in methods; no new management dashboard. OAuth client lifecycle can be an authorized operator workflow; project-wide Auth administration is not a workspace capability.

- [x] B08 (P0) — Prepare independent Vercel deployment package: `vercel.json`, Node 22, CI, production-origin and publishable-key validation, preview isolation, deployment runbook. Four new configuration tests passed.
- [ ] B09 (P0) — Connect Vercel, create/import the independent identity project, deploy UI-only preview and then configured stable identity host. Verify deployment/build and live browser flows. No Vercel connection yet; do not mark deployed until URL and checks confirmed. See `docs/VERCEL.md`.

## C. Application authorization (shared SQL boundary)

- [x] C01 (P0) — Implement private delegated grant data model and check for native client/user/workspace/operations, optional App, current role, session, consent, expiry and revocation. Eight rollback-only SQL checks passed on Registry. Candidate only (`supabase/provision/oauth-grants.sql`); no client access activated. Grant lifecycle policy/approval and secure transactional dispatcher remain C02–C05. See `docs/DELEGATED_AUTHORIZATION.md`.
- [ ] C02 (P0) — Enforce current membership/role AND credential/client grant AND operation permission at every read and write, including SECURITY DEFINER functions, views, file adapters and MCP resources. Existing direct-session denial for OAuth tokens stays in place except for the reviewed delegated path. Never convert arbitrary OAuth tokens into unrestricted direct sessions.
- [ ] C03 (P0) — Revalidate grants and membership on each request; enforce workspace isolation, immediate application-grant revocation, safe client switching, rate and result limits; identify caller from verified principal, not a supplied user ID. No service-role credential in MCP clients.
- [ ] C04 (P0) — Add scoped, audited SQL entry points wherever current Data API reads cannot be safely consumed by MCP. Extend dispatcher allowlist, not generic SQL execution. Resolve existing saved-view/invitation/role-contract gaps.
- [ ] C05 (P0) — Negative tests for owner, admin, editor, viewer, foreign workspace, unapproved OAuth client, expired/revoked token, revoked grant and downgraded member. Audit attribution for user/client/token, tool, request ID, before/after and failures. Preserve existing opaque workspace-bound token behavior for unattended clients.

## D. Custom MCP — application tool catalog

**Current progress:** MCP v6 active with nineteen tools. Golden Path first: context, ontology creation/discovery, five-kind Registry CRUD, relations, reports and audit history work via the actual MCP. The end-to-end local acceptance test verifies committed rows and denial effects through an independent Data API read. Five new hosted SQL checks passed; old scopes are not widened. D01/D03 remain open for the remaining catalog; D02 OAuth remains open. Vercel deployment deferred.

The original nine tools, seven read tools and three Golden Path tools are deployed in development; other additions below remain proposed. All business operations reuse native SQL/RPC/RLS and app-level authorization.

| Group | Existing tools | Proposed application tools / operations | Gate |
|---|---|---|---|
| Context | — | `get_context`, `list_workspaces` (authorized), workspace selection with server-validated context, `get_capabilities` (can be part of context) | P0 |
| Entities | `search_entities`, `get_entity`, `create_entity`, `update_entity`, `archive_entity` | `list_entity_types`, `get_template`, `find_entity` or enriched search, `preview_entity_change` | P0 |
| Relationships | `create_relation`, `update_relation`, `delete_relation`, `traverse` | `list_predicates`, `get_related_entities` (if not redundant), `run_path_report` | P0 |
| Ontology | existing template/predicate resources | `list_templates`, `upsert_template`, `upsert_predicate`, `delete_predicate`, impact preview | P0; owner/admin writes |
| Workspace | — | `get_workspace`, `create_workspace`, `update_workspace`, `list_members`, `invite_member`, `change_member_role`, `remove_member`, `transfer_ownership` | P0; role-specific |
| Identity | — | `get_my_identity`, `link_person_identity`, `unlink_person_identity`; scoped App-client grants if approved | P0; role-specific |
| Operations | — | `get_dashboard`, `get_entity_history`, `search_audit`, `list_saved_views`, `create_saved_view`, `update_saved_view`, `delete_saved_view` | P0; preserve personal privacy |
| Exchange | — | `preview_import`, `commit_import`, `create_export`, `get_export_download`; bounded bulk tagging/archive with preview and exact version set | P0; approved file and batch contracts |
| Credentials | — | `list_credentials`, `revoke_credential`; native secure issuance/enrollment flow, never return raw keys to ordinary LLM conversation | P0; owner/admin as authorized |
| Process standards | — | `list_process_kind_versions`, `publish_process_kind`, `get_process_kind_package` | P0 if publication included; separate role-authorized standard management |
| Operational Processes | — | separate authorized `create_process`, `get_process`, `list_processes`, `dispatch_process`, `cancel_process`, `retry_process` | Separate execution activation gate; P1 by default pending approved execution scope |

- [ ] D01 (P0) — Map each proposed tool to existing SQL/RPC/approved service, required role, scope, side effects, input/output, errors and tests. Remove redundant tools; retain distinct high-value operations. Approve final catalog and contract amendment before expanding the deployed nine-tool interface. **Partial:** 19-tool mapping documented, tested and deployed in development; final production catalog and remaining operations open.
- [ ] D02 (P0) — Implement OAuth protected-resource discovery and authentication using native Supabase Auth and the official MCP SDK; require correct resource audience and a validated application grant. Keep opaque token path separate and scoped. Public discovery exposes metadata, never workspace data.
- [ ] D03 (P0) — Implement the context/Registry/ontology/read-report tools first; then role-restricted workspace, identity and operational management tools. Expose no raw SQL, arbitrary RPC dispatcher, service key, migration, schema edit, project settings or admin logs tool. **Partial:** context/ontology/report and create-only ontology plus history tools deployed and authenticated local HTTP-tested; broader management tools remain.
- [ ] D04 (P0) — Make import/export and package publication usable from MCP after the Storage gates; prefer bounded upload/download handoff rather than large base64 blobs in tool results. No arbitrary external URL fetching. Preserve separate execution APIs from Registry entities.
- [ ] D05 (P0) — Verify protocol discovery/list/call/resource flows, pinned SDK and real authorized MCP client compatibility. Enforce server-side authorization even if cached tool catalogs or annotations are stale. Test at least one real intended LLM client and an independent SDK harness; do not weaken authorization for compatibility. **Partial:** real local protocol discovery/list/call/resource and revocation passed; Golden Path including creation, relationships, updates, audit and independent persisted state passed. Hosted authorized client and real LLM checks pending.

## E. LLM-first tool UX (release requirement, not optional polish)

- [ ] E01 (P0) — Each tool has a distinct business intent, human-readable title, concise description with when-to-use and when-not-to-use, parameter examples, strict input and output schemas, and accurate read-only/destructive/idempotency hints. Hints are not enforcement. **Partial:** nine compatibility titles/descriptions/hints live; seven strict input/output schemas and descriptive registration live. Original nine output schemas and remaining catalog still open.
- [ ] E02 (P0) — Discovery-first: context includes current workspace, role, permitted operations and how to find valid kinds/templates/predicates. Human-readable search supports titles, aliases where supported, kind/type filters; never guess UUIDs. Ambiguity returns candidate IDs and distinguishing information; do not mutate an arbitrary match. **Partial:** context and paginated template/predicate tools live; active name resolution guidance improved.
- [ ] E03 (P0) — Return consistent compact structured results plus text fallback: result/status, stable IDs, display titles, versions, page cursor, warnings and valid follow-up actions. Offer summary by default, explicit detail, bounded pagination and truncation. Never emit SQL internals, credential values or unbounded rows. **Partial:** bounded compact read-tool schemas deployed; original results and full catalog need review.
- [ ] E04 (P0) — Actionable error contracts: `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`, `VERSION_CONFLICT`, `RATE_LIMITED`; field-level feedback, retry timing, required template fields and exact next safe step. Do not reveal foreign workspace existence or auto-overwrite concurrent changes. **Partial:** v6 allowlisted actionable errors deployed; SQL field-level details and integration checks remain open.
- [ ] E05 (P0) — For high-impact writes (archive, deletion, bulk, membership, ownership, publication), preview intended changes, validate expected versions and require explicit confirmation where the approved policy requires it. Server-side confirmation tokens bind actor/workspace/operation/parameters/expiry; recheck authorization on commit. Never treat a model-generated confirmation flag as user consent. Require idempotent replay where applicable.
- [ ] E06 (P0) — Provide compact MCP resources for the ontology/templates, application rules and examples; optionally workflow prompts for supported clients. Treat entity notes/imported content as data, not instructions. No hidden autonomous execution or prompt injection via stored records.
- [ ] E07 (P0) — End-to-end LLM scenarios: find a person and their apps; resolve ambiguous names; create a valid entity and relation; repair missing fields; handle a stale version; refuse viewer mutation; update a template safely; generate a report; import preview/commit; export download. Measure correct tool selection, completion, unnecessary calls and unsafe actions. No arbitrary SQL needed for any approved workflow.

### Golden Path — current priority

- [x] Local real Supabase Auth and scoped credential bootstrap, with empty workspace and dynamically discovered kinds/capabilities.
- [x] Actual product ontology creation through MCP; discover required fields and permitted relationships without fixed definitions.
- [x] Register all five kinds, create valid edges, search, inspect, traverse and run path reports via real MCP HTTP.
- [x] Update with expected version; reject stale version, viewer, missing required fields and old-scope ontology writes; independently verify persistent database rows and successful audit events.
- [x] Read paginated entity history and reject cross-workspace access; verify credential revocation.
- [x] Deploy actual Golden Path product functions to development Registry; hosted SQL and negative HTTP checks passed.
- [ ] Complete the same journey using the hosted login, native OAuth delegation, hosted authenticated MCP and actual intended LLM client. The local bootstrap uses real Auth password sessions and native RPCs instead of the browser until Vercel is available. No production login/LLM acceptance claim.

The Golden Path test is `tests/supabase/golden_path.py`, invoked by the disposable integration suite. It is test code only, not a product service. No fixed workspace, ID, credentials or ontology in product code. Wider administration remains deferred until the Golden Path works through the intended client.

## F. Exchange, Storage and Process standards

- [ ] F01 (P0) — Deploy and test the prepared import/export/publication Edge adapters only after authorization changes are verified. Test real upload/download, private buckets, archive validation, checksums, import rollback, replay, cross-tenant denial and byte limits.
- [ ] F02 (P0) — Complete authorized short-lived signed export/package URLs and expiry. Keep file delivery scoped and audit it; reconcile orphaned uploads without overwriting immutable publications. Preserve the development data; do not enable its automatic deletion.
- [ ] F03 (P0) — Finalize package semantic contract, immutable version and digest checks, expected revision and publication permissions; expose Process Kind management as application operations if released. Keep Process instances distinct from Registry entities.
- [ ] F04 (conditional P0 / otherwise P1) — Before activating operational Process management: approve requester binding, machine/Edge identity, assignment, retry/lease limits, artifacts and authorized operational read/write APIs. Test real execution, duplicate handling, fencing and crash recovery using native Queues. No automatic orchestration, execution graph or unapproved workers. If execution isn't part of launch, leave all operational primitives installed privately and unavailable.

## G. Production readiness and release

- [ ] G01 (P0) — Review all Security/Performance Advisor findings, including privileged RPCs, default grants and foreign-key indexes; fix genuine vulnerabilities and document intentional RLS deny policies. No blanket privilege changes to silence warnings.
- [ ] G02 (P0) — Generate TypeScript DB types, integrate CI for SQL/native queues, Deno, Next.js, API/MCP and browser tests. Re-run all existing checks against the target release and add identity/MCP integration checks; do not count assertions as acceptance criteria. **Partial:** read SQL tests integrated in regression runners; exact Deno/local Supabase authenticated smoke passed. Bundled CLI Edge runtime lockfile incompatibility still open.
- [ ] G03 (P0) — Set project-specific secret management, allowed hosts/origins, token/grant limits, abuse controls and logging redaction. Monitor auth/MCP failures, latency and DB/queue health without raw tokens or sensitive payloads. Configure only necessary Cron jobs after explicit review; keep development fixtures intact.
- [ ] G04 (P0) — Verify backup and tested recovery, safe forward migration/rollback strategy, documented release/incident procedure, capacity and load tests with target thresholds agreed before launch. No destructive reset or copying synthetic credentials into production.
- [ ] G05 (P0) — Deploy signed-off production database, identity host and custom MCP; register clients and configure exact Auth URLs. Verify production smoke with authorized test account and LLM client. Confirm official Supabase MCP is not exposed as an application tool surface.
- [ ] G06 (P0) — Update actual deployment inventory and acceptance evidence; record unresolved risks, optional capabilities and explicit approval for production launch.

## H. Mini app surfaces

- [ ] H01 — Verify Registry record editing, search, responsive layouts and accessible relation selection against the production candidate. **Partial.** These flows passed on the local production build with Harbor preview data.
- [ ] H02 — Approve which actions require Authority and who can sign. The owner approved cryptographic signatures. The WebAuthn verifier for an archive intent is implemented. Credential enrollment, durable request and challenge consumption, MCP integration and a full human approval journey remain open.
- [ ] H03 — Verify Workspace selection, role-aware navigation and saved views across the mini app and the MCP. Confirm that switching workspaces never carries over a pending selection or a stale result. **Partial.** The workspace overview and saved-view links passed on the local Registry production build with preview data.
- [ ] H04 — Verify shared login and OAuth consent on separate origins before changing production routes. Keep the Auth issuer, grant checks and redirect allowlists in scope for integration review.

## Release definition

A user can connect ChatGPT or Claude to the custom MCP, authenticate, select an authorized workspace and complete the supported workflows through domain tools. The Registry, Authority and Workspace mini app surfaces use the same backend operations. The system enforces current roles and grants server-side, protects tenant boundaries and audits outcomes. Production execution remains a separate activation decision.

## Owner decisions only

1. Stable identity domain and permitted origins; production Supabase project and any paid resources. Vercel hosting is approved; account connection is required for deployment.
2. Final v0 tool catalog and access policy (including bulk/confirmation and credential issuance), with the old nine-tool limitation explicitly amended.
3. Initial OAuth client(s), stable consent origin, enrollment/recovery and outbound email policy.
4. Authority pilot actions and eligible signers.
5. Whether to activate Process execution in v0; approve machine identity, lease/retry and package contracts before activation.

These are proposed planning decisions, not silently activated policies. This is the current tasklist for the reconciled repository. Foundation evidence is in VALIDATION; the permanent domain, production Supabase target, Vercel deployment and activation decisions remain open.

## References

- Current repository: `docs/CONTRACTS.md` §§5–9, 14; `docs/IDENTITY.md`; `docs/DECISIONS.md`; `VALIDATION.md`; `supabase/functions/mcp/index.ts`; `apps/identity/package.json`.
- Supabase OAuth: https://supabase.com/docs/guides/auth/oauth-server
- Supabase MCP Auth: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase OAuth authorization flows: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- MCP tool annotations: https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- MCP TypeScript SDK structured outputs: https://ts.sdk.modelcontextprotocol.io/v2/clients/calling
