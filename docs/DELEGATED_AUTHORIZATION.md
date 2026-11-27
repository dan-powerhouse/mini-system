# Delegated authorization — native OAuth 2.1 MCP access

`supabase/migrations/20261126180000_oauth_delegation.sql` implements C01–C03 and the database part of C04. It is not deployed to any hosted project and needs independent auth review before merge (AGENTS.md).

## Model

- A native Supabase OAuth access token is identity only. It never becomes a direct Registry session: the restrictive `direct_registry_principal` policies and every domain RPC still reject tokens that carry `client_id`.
- Registry access through OAuth requires a **grant** in `private.oauth_application_grant`: one workspace, one member, one native OAuth client, an explicit operation list, an expiry (at most 90 days) and an optional active App entity.
- `public.mcp_oauth_dispatch` is the single OAuth entry point. Identity comes only from the JWT that PostgREST has verified (`sub`, `client_id`, `session_id`); no tool or caller supplies user, client or session identifiers. In the same transaction as the business operation it rechecks membership and current role, the grant (operation, expiry, revocation, App), the confirmed native account, the registered client, a live native session bound to that client and unrevoked native consent. It then calls the same fixed domain RPCs as `mcp_dispatch`. No generic RPC forwarding.
- Mutations take the workspace write lock before the check (same order as `require_write`), so concurrent revocation or role change cannot interleave with a write.
- Each dispatch has a request ticket (`private.oauth_request`): 60 requests per minute per grant, replayed request IDs refused, exactly one durable audit row per request. Audit rows use `actor_type = 'token'`, `actor_id` = grant, `effective_user_id` = member and `metadata.oauthClientId`. Refusals against an existing grant are audited; refusals without any grant go to `private.security_event_log`.

## Grant lifecycle (policy defaults — owner may tighten)

| RPC (authenticated, direct sessions only) | Rule |
|---|---|
| `oauth_grant_issue(workspace, client, operations, expires_at, app?)` | A member delegates only their own access, only to a client they already consented to; viewers cannot delegate mutations; a new grant for the same workspace/member/client supersedes the active one; audited |
| `oauth_grant_revoke(workspace, grant)` | The grantee or a workspace owner/admin; audited |
| `oauth_grant_list(workspace)` | Own grants; owners/admins see all |

Delegable operations: the nine compatibility tools, the two resources, the seven read tools and `get_entity_history`. Template/predicate management (`manage` scope) is not delegable.

## MCP Edge Function

- `Authorization: Bearer egt_…` keeps the existing opaque-credential path unchanged.
- `Authorization: Bearer <JWT>`: verified with `auth.getClaims()` (requires `client_id` and `session_id`), then every call goes to PostgREST with that same token (`mcp_oauth_session`, `mcp_oauth_dispatch`). No service-role key is used on this path. Optional `Mcp-Workspace` header selects the workspace when the member granted the client more than one; otherwise the single granted workspace is used.
- `GET /functions/v1/mcp/.well-known/oauth-protected-resource` returns RFC 9728 metadata naming the project's Auth server; 401 responses carry `WWW-Authenticate: Bearer resource_metadata="…"`.
- A valid token without any grant gets HTTP 403 `NO_REGISTRY_GRANT`.

## Evidence

- `tests/identity/oauth_grants.sql` (original C01 checks, 8) and `tests/identity/oauth_dispatch.sql` (8) on the real Supabase Auth schema.
- `tests/supabase/oauth_mcp.py`: real authorization-code + PKCE flow against local Supabase Auth (admin client registration, `/oauth/authorize`, consent API, `/oauth/token`), then the exact MCP adapter: no access before grant, OAuth token cannot grant itself, granted reads/writes, ungranted operation refused, Data API confirms row and attributed audit, admin revocation effective on next request. Runs in CI through `run_mcp_local.py`.

## Remaining gates

- **C05 consent host:** `apps/identity` approves OAuth consent but does not yet ask which workspace/operations to grant; until then a member issues the grant with `oauth_grant_issue` from a direct session.
- **Audience binding:** native access tokens carry `aud = authenticated`, not the MCP resource. Binding the audience needs a Custom Access Token Hook; verify on the hosted project before activation.
- **Client registration:** dynamic client registration stays off (`config.toml`); clients are registered by an admin. Most MCP clients expect DCR or a pre-registered client ID — decide per client.
- **ID tokens:** scope `openid` needs asymmetric signing keys; local CLI Auth signs HS256, so the local test requests `email`. Hosted projects should use asymmetric JWT signing keys.
- Protocol-level methods (`tools/list`, `initialize`) are not audited on the OAuth path; operations are.
- Real LLM-client interoperability and hosted validation remain open.

Official source: https://supabase.com/docs/guides/auth/oauth-server/token-security
