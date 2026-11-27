# Custom application MCP — production v0

The custom Supabase Edge Function provides the application interface for ChatGPT and Claude. It uses the same domain contracts as the mini app. Native Supabase Auth remains the identity authority. Shared login and OAuth consent are separate deployment surfaces in the production target.

## Compatibility core (live Registry, v6)

The nine existing tool names, input/output DTOs, protocol, resources, ticketed SQL dispatcher, role and scope boundaries are unchanged. `tool-ux.ts` supplies human-readable titles, descriptions, examples/safe follow-ups, closed-world business-effect hints, and allowlisted actionable error messages. Unknown backend errors are reduced to INTERNAL_ERROR, not raw SQL. Hints do not authorize any operation. `create_entity` and `create_relation` are not retry-safe; no mutation automatically retries. Read operations still create required audit records. The v6 deployment also includes the seven read tools and three Golden Path tools below.

| Compatibility tool | Native operation | Effective role and scope | Effects and recovery |
|---|---|---|---|
| search_entities | entity_search | member + read | Page of entities; stable cursor; resolve ambiguous IDs |
| get_entity | entity_get | member + read | Entity with incoming/outgoing relations and versions |
| create_entity | entity_create | editor/admin/owner + write | Registered template required; no blind retry |
| update_entity | entity_update | editor/admin/owner + write | Expected version; re-read on conflict |
| archive_entity | entity_archive | editor/admin/owner + write | Terminal soft archive; version check |
| create_relation | relation_create | editor/admin/owner + write | Registered predicate and compatible endpoints |
| update_relation | relation_update | editor/admin/owner + write | Expected relation version; cannot change endpoints |
| delete_relation | relation_delete | editor/admin/owner + write | Removes edge only; history retained |
| traverse | registry_traverse | member + read | Bounded general exploration; depth 1–3, cap 500 |

Existing three resource URIs remain available. No raw SQL, arbitrary RPC forwarding, credentials or project management API exposed.

## Read-tool expansion (live Registry, v6)

`supabase/migrations/20261125001951_mcp_read_tools.sql` installs the private helper and additive dispatcher allowlist, retaining the request ticket, membership/scope checks, locks, size cap and auditing. The helper is not directly callable by app/service roles. `supabase/functions/mcp/candidate/register-read-tools.ts` (retained path to match deployed bytes) is imported by the active entrypoint and registers strict input/output schemas. The exact SQL was validated locally and on hosted Registry after installation.

| Tool | Input | Output and bounds | Native source |
|---|---|---|---|
| get_context | {} | Workspace ID/name/slug, current role, scopes, permitted catalog, five kinds; one workspace bound to credential | workspace, workspace_member and authenticated ticket |
| list_templates | kind?, after?, limit? | Type/version/fieldCount, nextAfter; max 50 | type_templates |
| get_template | kind, type | Exact template fields/version/updatedAt | type_templates |
| list_predicates | after?, limit? | Predicate, description, endpoint kinds, direction, helper, version, nextAfter; max 50 | predicate_registry |
| get_dashboard | {} | Counts/orphan counts by kind, stale definition age and at most 20 compact stale Process Kind summaries; excludes raw audit history | dashboard_summary and scoped entity projection |
| run_path_report | startId, steps (1–2), maxResults? | Ordered compact entity and relation references, truncated; max 100 | registry_path_report |
| list_saved_views | after?, limit? | Personal caller-owned and shared views, query, version, isMine, nextAfter; max 50 | saved_view with explicit visibility filter |

All seven tools require an authorized existing workspace-bound credential and current member role, including viewers. They perform no business mutations; each call is audited exactly once. There is no arbitrary workspace/user ID override. Cursors for these short catalog lists are simple lexicographic continuation keys, not authorization tokens or snapshot guarantees; filtering and visibility are enforced independently on every call. Reuse kind/filters with continuation keys. The `get_context` catalog reflects the nineteen live tools and caller's permitted actions. OAuth grants remain disabled. The additional reads do not mint credentials or change mutations. Production approval and the remaining catalog, administrative writes, original nine output schemas, field-level errors, confirmation rules, OAuth discovery/audience and real LLM interoperability are still open.

## Golden Path product operations (live Registry, v6)

| Tool | Input | Result | Authorization |
|---|---|---|---|
| `create_template` | kind, type, fields | template/version/fields/updatedAt | Current owner/admin + explicit `read`, `write`, `manage` |
| `create_predicate` | name, description, fromKinds, toKinds, directed, optional symmetricHelper | predicate/version and constraints | Current owner/admin + explicit `read`, `write`, `manage` |
| `get_entity_history` | id, optional limit (1–50), signed cursor | ordered event metadata, outcome and before/after versions, nextCursor | Current workspace member + read |

The first two call the existing native upsert RPCs with a null expected version: only creation is possible; existing definitions raise VERSION_CONFLICT. The new scope is opt-in and cannot be issued for a viewer/editor. Every call checks the current role; a role downgrade overrides an already-issued manage credential. Existing read/write tokens do not obtain new mutation permissions. All operations use the ticketed dispatcher, bounded results, existing RPC validation, and durable audit. No database-administration tool, arbitrary RPC, hardcoded ontology or new service is introduced. `get_entity_history` uses `audit_recent` and projects only audit metadata/versions, not raw snapshots.

## Verification

- Migration 20261125001951 is applied in Registry; exact SHA-256 94e435391f045a911e6494ef4a04bad3704f20a5b4dfc35ad7dbac53ac5926a7.
- Frozen Deno 2.9.6 / MCP SDK 2.4.0 typecheck and 4/4 contract tests passed (`e7c17032e683354e156f`).
- Eleven new and five existing MCP SQL checks passed against both local and hosted Supabase, using rollback fixtures. Includes scope, privacy, cross-workspace denial, viewer mutation denial and audit.
- `tests/supabase/mcp_read_smoke.py --confirm-disposable --direct-deno` passed real local Auth/PostgREST and exact pinned adapter HTTP integration (`e4f984ae2e2b41b90026`): discovery, sixteen entries, seven structured reads, pagination, resource compatibility, denials and token revocation. The client must include `io.modelcontextprotocol/clientCapabilities` in the 2026-07-28 `_meta` envelope. CLI's bundled Edge runtime 1.70.3 cannot parse Deno lock v5; direct Deno verification is not a local Edge-runtime pass.
- Hosted MCP v5 was superseded by v6; its 401 and 403 negative HTTP checks passed (`aa7d0169b862bf6b193c`). Authenticated hosted HTTP, actual LLM-client test and OAuth delegation remain outstanding.
- Registry retains 2 workspaces, 5 entities, 1 relation, 3 Auth accounts; no OAuth clients installed and no fixture deletion.


Official SDK reference: https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/mcp.html

### Current v6 acceptance evidence

- `20261125004055_mcp_golden_path.sql` applied and verified on Registry; SHA-256 `1e6773e44a41e70c52fa6956f13ea52bbdf1ca1ada092ef2b185aaac75b6f125`. Five SQL assertions passed locally and before/after hosted deployment. Previous eleven read and five compatibility checks passed locally after migration.
- Frozen Deno compilation and four contract tests passed. `tests/supabase/run_mcp_local.py --confirm-disposable` passed both compatibility and Golden Path suites against the real local Supabase Auth/PostgREST and exact adapter. Final run `0b5c555fa5d38c02f4b9` checks discovery, dynamically generated ontology, all five entity kinds, four links, version conflict, denied mutations, signed audit pagination, tenant isolation and revocation. An independent authenticated Data API read verifies exact persisted entities/edges and exactly two successful create/update audit events; rejected operations did not change state.
- Hosted Edge version 6 is ACTIVE; live unauthorized 401/unapproved Origin 403 checks passed. Registry still has two workspaces, five entities, one relation, three Auth users. No OAuth clients or grants activated. Browser login/OAuth, authorized hosted HTTP and actual LLM client journey are not verified. Vercel remains deferred.
