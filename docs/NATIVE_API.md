# Native API reference

This reference describes the SQL bindings and adapters in the source tree. Use the [technical contracts](CONTRACTS.md) for behavior and the [release checklist](PRODUCTION_V0.md) for activation status. The [migration manifest](../supabase/migration-manifest.json) lists the source migrations.

## Database call example

After local startup and authentication, use the Supabase client with the signed-in user's session (not a service-role key). These are implemented SQL entry points:

```ts
const { data: workspace, error } = await supabase.rpc('workspace_create', {
  p_name: 'My registry', p_slug: 'my-registry'
})
// Handle error; use returned workspace.id. Owner/admin configures types:
await supabase.rpc('template_upsert', {
  p_workspace_id: workspace.id, p_kind: 'agent', p_type: 'assistant',
  p_fields: [{ name: 'provider', dataType: 'text', required: true }]
})
const { data: entity } = await supabase.rpc('entity_create', {
  p_workspace_id: workspace.id,
  p_input: { kind: 'agent', type: 'assistant', title: 'Research assistant', attributes: { provider: 'Example' } }
})
// Check every returned error before using data in real code.
await supabase.rpc('entity_update', {
  p_workspace_id: workspace.id, p_id: entity.id,
  p_expected_version: entity.version, p_patch: { title: 'Research agent' }
})
```

The SQL row outputs are snake_case and include database columns; the future adapter maps them to the public contract. The example is illustrative, not an executed browser/client integration test. Membership, token access, relationships, Registry reads and the MCP database adapter have independent PostgreSQL regression coverage; see the current validation report.

## Native API binding (Contracts §8.1)

Business rules belong in PostgreSQL functions, constraints, triggers and RLS. Authorized applications and MCP are consumers of the same native Supabase API, not owners of domain logic. The 42 Registry procedure contracts have the following implementation entry points (presence is not full contract acceptance). For all reads use the authenticated client and explicit workspace filtering; no client service-role keys. RLS remains authoritative. Use native Data API directly for ordinary reads instead of redundant Edge wrappers. Complex queries and every domain mutation use RPC. The nine service-only RPCs are not client tools.

| Contract procedures | Native binding |
|---|---|
| workspace.create / update | `workspace_create`, `workspace_update` RPC |
| workspace.listMine / getCurrent | `workspace` SELECT, RLS; filter by ID for get |
| member.list | `workspace_member` SELECT, RLS (admin sees workspace members, other members see only self) |
| member.invite / updateRole / remove / transferOwnership / acceptInvitation | `member_invite`, `member_update_role`, `member_remove`, `member_transfer_owner`, `member_accept_invitation` RPC |
| token.list / issue / revoke | `token_list`, `token_issue`, `token_revoke` RPC |
| entity.search / get / create / update / archive | `entity_search`, `entity_get`, `entity_create`, `entity_update`, `entity_archive` RPC |
| entity.bulkTag / bulkArchive | `entity_bulk_tags`, `entity_bulk_archive` RPC |
| relation.create / update / delete | `relation_create`, `relation_update`, `relation_delete` RPC |
| relation.listForEntity | relation lists in `entity_get` RPC result |
| template.list / get | `type_templates` SELECT, RLS; filter kind/type |
| template.upsert | `template_upsert` RPC |
| predicate.list / get | `predicate_registry` SELECT, RLS; filter name |
| predicate.upsert / delete | `predicate_upsert`, `predicate_delete` RPC |
| traversal.run | `registry_traverse` RPC |
| dashboard.getSummary | `dashboard_summary` RPC |
| audit.forEntity / recent | `audit_for_entity`, `audit_recent` RPC; signed keyset cursor |
| savedView.list | `saved_view` SELECT, RLS; filter kind |
| savedView.create / update / delete | `saved_view_create`, `saved_view_update`, `saved_view_delete` RPC |
| import.preview / commit | `import_preview`, `import_commit` RPC |
| export.create | `export_create` RPC |
| Ordered path report (additional) | `registry_path_report` RPC |

MCP: `search_entities` → `entity_search`; `get_entity` → `entity_get`; `create_entity` → `entity_create`; `update_entity` → `entity_update`; `archive_entity` → `entity_archive`; `create_relation` → `relation_create`; `update_relation` → `relation_update`; `delete_relation` → `relation_delete`; `traverse` → `registry_traverse`. The trusted Edge transport uses `mcp_begin`, `mcp_dispatch`, `mcp_finish` (service role only); dispatch resolves the token's current member and calls these exact domain RPCs. The three resources read the same entity/template/predicate data. The other service-only RPCs are `exchange_stage_upload`, `exchange_read_export`, `exchange_cleanup_candidates`, `exchange_cleanup_finish`.


## Relationship operations

The Registry relations migration defines `predicate_upsert`, `predicate_delete`, `relation_create`, `relation_update`, `relation_delete` and `entity_get`. They use the existing workspace locking, authorization and audit functions, or caller RLS for reads. The SQL signatures are in `supabase/migrations/20261124201920_registry_relations.sql`.

## Registry search and traversal

`entity_search(p_workspace_id, p_query)` supports the contract's full-text query, kind/type/status/tag/attribute filters, sort, limit and signed keyset cursor. `registry_traverse(p_workspace_id, p_start_id, p_depth, p_direction, p_predicates, p_max_nodes)` uses bounded PostgreSQL graph traversal. Both are confined to the Registry. The search RPC is a read-only security definer with an explicit verified membership check and a private pgcrypto cursor signer; traversal uses caller RLS. The public DTO mapping belongs to the transport adapter.

## Registry operations

`dashboard_summary` returns five-kind counts, orphans, recent visible activity and stale Process Kind definitions. `entity_bulk_tags` and `entity_bulk_archive` reuse the individual entity RPCs in one transaction with sorted IDs and version checks. `saved_view_create`, `saved_view_update` and `saved_view_delete` validate stored filters through `entity_search`; personal views and their audit snapshots are restricted to their owner. Shared views remain workspace-scoped. No direct client DML is granted.

## Ordered path reports and exchange

`registry_path_report(p_workspace_id, p_start_id, p_steps, p_max_results)` returns bounded ordered Registry paths with one or two predicate/direction steps. It is not an execution graph.

The prepared import Edge function accepts a multipart `workspaceId` and `file` ZIP with `manifest.json`, `entities.csv`, and `relations.csv`. The client calls `import_preview` with the returned upload ID, then `import_commit` with the preview ID. Commit validates again and rolls back on any error. The `export_create` RPC returns an export identifier; the prepared export Edge function serves an authenticated GET ending in that identifier. It currently returns the ZIP directly, not the signed Storage link specified by the target contract. That delivery step and real Supabase integration are outstanding. ZIP and CSV use pinned libraries rather than custom parsers. The prepared service-only cleanup function removes expired import objects using the Storage API and then acknowledges deletion; scheduling via native Cron has not been activated. All three exchange functions remain disabled pending the full-stack gate.

## Process Kind publication and native execution (prepared, not activated)

The migration `20261124202015_process_kind_publication.sql` provides two service-only RPCs: `process_kind_publish` (atomic version allocation, immutable path/digest, exact replay, owner/admin recheck, transactional audit) and `process_kind_publications` (bounded metadata pages). The disabled `publish` Edge adapter verifies Auth, validates ZIP safety using the pinned ZIP library, uploads with `upsert:false` to `process-kind-packages` and calls the SQL publication RPC. It rejects altered bytes on an upload-ID retry. The generic archive safety checks do not establish the final semantic format of a Process Kind package. Storage integration, orphan-file reconciliation and package retrieval with digest verification remain open; a failed/ambiguous publication never deletes or overwrites an already uploaded object.

`supabase/migrations/20261124202221_process_execution_private.sql` is installed automatically as private primitives, **not** worker activation. It implements private SQL operations `process_create`, `process_dispatch`, `process_claim`, `process_heartbeat`, `process_finish`, `process_expire`, `process_cancel`, `process_reconcile`, plus the event helper. The native PGMQ queue carries only Process IDs. Queue send/ack and durable state changes are atomic, claim creates a fenced lease, retries preserve the Process ID, completion is idempotent, explicit recovery reconciles missing messages, and duplicate messages cannot start a second attempt. Operational audit and attempt history are private and separate from the Registry. No Edge identity is inferred from a Registry entity. No worker, scheduler, public execution RPC or grant is enabled. The owner must review the candidate policies and identity binding before activation.

Run `bash tests/native/run.sh` only on a fresh standalone disposable PostgreSQL 16 instance with actual PGMQ extension files installed and a database named `entitygraph_execution_check`. Tested with the official PGMQ 1.7.0 extension. It applies the migrations supported by the standalone runner, substituting the exact queue-only statements for the combined native Queue/Storage migration because standalone PostgreSQL has no Supabase Storage schema. It runs the Registry, identity and native execution suites plus multi-session races. It intentionally leaves the committed concurrency fixture in this disposable database; discard that DB afterward. This tests the real extension, not the full Supabase stack. See [VALIDATION](VALIDATION.md).
