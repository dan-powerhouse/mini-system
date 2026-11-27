# mini system acceptance and release gates

The 110 baseline requirements (with owner-approved presentation/catalog amendments) plus production v0 requirements 111–120 below define the current release gates. These are target tests, not passed results. No milestone is complete until all applicable cases execute successfully against real services. Record command, runtime version, output and covered IDs in each PR. A test may satisfy only the portion it exercises; no skipped tests count as pass.

# 13. Acceptance test contract

Tests must exist at three levels: unit tests for schemas/pure logic, service integration tests against PostgreSQL, and adapter contract tests proving that Data API/RPC and MCP call the same service behavior.

## 13.1 Database and workspace isolation

1. Entity kind/status/version CHECK constraints reject invalid values.
2. Cross-workspace relation endpoint FK is rejected.
3. Relation predicate FK must belong to the same workspace.
4. Duplicate relation triple is rejected by the unique constraint.
5. Self-link is rejected by the database.
6. Invalid validity range is rejected by the database.
7. Every RPC/read search/list/traversal query is workspace-filtered.
8. A user cannot read/write another workspace's entity by guessing its UUID.
9. A removed workspace member's tokens are revoked in the removal transaction.

## 13.2 Entity and template

10. Valid entity create applies defaults, stores version 1, and writes audit atomically.
11. Missing `(kind,type)` template returns `TEMPLATE_NOT_FOUND`.
12. Required field missing or wrong type returns `VALIDATION_ERROR`.
13. Unknown attribute key is rejected.
14. `entity_ref` must point to an existing same-workspace entity and match configured kind.
15. Entity update with current version succeeds and increments once.
16. Stale entity version returns `VERSION_CONFLICT` and writes no mutation audit row.
17. Kind change is rejected.
18. Type change validates against the destination template.
19. Archived entity update is rejected.
20. Archive is soft, keeps relations, increments version, and is audited.
21. Archived entity cannot be restored through v1 APIs.
22. Template update that would invalidate existing entities is rejected atomically.
23. Template update requires expected version and increments template version.

## 13.3 Relations and predicates

24. Allowed predicate/kind combination creates relation successfully.
25. Disallowed endpoint kinds return `RELATION_KIND_MISMATCH`.
26. Predicate validation is transactionally protected against concurrent registry edits.
27. Relation create rejects archived endpoints.
28. Relation create rejects duplicate triple.
29. `validTo <= validFrom` fails.
30. `directed:false` creates one stored edge but traversal can follow it both ways.
31. `symmetricHelper` does not create an implicit reciprocal edge.
32. Relation update requires matching version and increments it.
33. Relation delete removes only edge and stores before snapshot in audit.
34. Predicate update that invalidates existing edges is rejected.
35. Predicate update requires expected version and increments predicate version.
36. Predicate delete while in use is rejected.

## 13.4 Authorization, members, and tokens

37. Viewer can read but cannot mutate through Data API/RPC.
38. Read-only token cannot write even when owned by editor/admin.
39. Write token owned by viewer cannot write.
40. Token cannot access a workspace other than its bound workspace.
41. Revoked/expired token is rejected on its next request.
42. Token action records both token actor and effective user.
43. Removing a member revokes their tokens.
44. Admin cannot assign or transfer owner role.
45. Last/only workspace owner cannot be removed/demoted.
46. Ownership transfer leaves exactly one owner.
47. Invitation is single-use, email-bound, expires, and cannot be accepted by a different email.

## 13.5 Search, traversal, dashboard, and saved views

48. Custom MCP list, lookup and search tools use identical native search semantics.
49. Search correctly combines kind/type/status/tag/attribute filters.
50. Search cursor cannot be reused with a different query or workspace.
51. Attribute operators reject incompatible JSON types.
52. Search excludes archived by default and includes them only when requested.
53. Traversal depth 1/2/3 returns expected entities/edges.
54. Traversal rejects depth >3 and never returns more than 500 nodes.
55. Traversal excludes archived adjacent nodes by default.
56. Orphan count matches entities with no incoming/outgoing relations.
57. Stale Process Kind definition review threshold uses workspace setting and active status; operational Process executions are excluded.
58. Saved view is private/shared according to visibility and still enforces caller access.

## 13.6 Bulk and import/export

59. Bulk tag supports add/remove/replace, checks every expected version, and normalizes tags.
60. Bulk archive checks every expected version.
61. Bulk operation over 100 items is rejected.
62. Bulk failure rolls back all rows and audit entries.
63. Import preview creates no domain mutations.
64. Import preview reports row/field validation failures.
65. Import commit rejects expired/foreign-user/foreign-workspace previews.
66. Import commit revalidates and is atomic.
67. Export never includes another workspace's records.
68. Export/import round trip preserves entity and relation UUIDs without silent overwrite.

## 13.7 MCP

69. MCP endpoint accepts only the pinned 2026-07-28 modern protocol when modern-only mode is configured.
70. `server/discover` advertises only implemented capabilities.
71. All nine compatibility tools and only reviewed, implemented, authorized production v0 business-tool additions are discoverable; no management, SQL, generic RPC or unimplemented tools appear.
72. The three compatibility resource URI templates are registered; any approved additions are bounded, authorized and audited.
73. All tools delegate to shared SQL mutation functions; no MCP-specific write path exists.
74. Every authenticated MCP RPC (tool, resource, list, discover) produces exactly one audit event.
75. Invalid-token attempts write a security event but never persist the submitted token.
76. MCP update version conflict instructs agent to re-read and does not overwrite.
77. `tools/list` cache hints include `ttlMs` and `cacheScope`; backend validation remains authoritative.
78. Rate limit is shared across application instances and enforces 60 req/min/token by default.
79. Payload cap is enforced.
80. Endpoint works behind round-robin load balancing without session affinity.
81. MCP Inspector and at least one real MCP client pass conformance tests for the pinned SDK/spec.

## 13.8 Audit and operations

82. Entity/relation mutation and audit row commit or rollback together.
83. Audit rows cannot be updated/deleted by the app role.
84. No secrets appear in application logs or error responses.
85. Backup restore drill succeeds in a clean environment.
86. Concurrent entity updates produce one winner and one `VERSION_CONFLICT`.
87. Concurrent relation updates produce one winner and one `VERSION_CONFLICT`.

---


## Additional Supabase and five-kind acceptance tests

88. All five Registry kinds (person, object, process_kind, agent, app) appear in DB constraint, lists, counts, type filters, resource schemas and import/export; no three-kind hardcoded assumptions.
89. Agents and Apps remain descriptive entities; creating either never grants credentials or execution authority. Process Kind registration does not start a Process.
90. Unauthenticated Data API callers cannot read or write domain records.
91. Authenticated editors cannot perform direct INSERT/UPDATE/DELETE/TRUNCATE via Data API; permitted RPCs still work; anonymous callers cannot execute them.
92. Every exposed table has RLS and explicit grants; per-kind views are security invoker and respect caller membership.
93. SQL definer functions set safe search_path; private helpers inaccessible; malicious actor/role/workspace arguments do not bypass checks.
94. Revoked membership and role changes apply to JWT requests without a fresh JWT; opaque token and human identity paths cannot be confused.
95. Credential hashes and invite secrets not exposed in PostgREST, RPC DTOs, logs, Storage or MCP; no service-role key in frontend.
96. Real local Supabase reset, database lint and pgTAP run on all migrations; no test runs against linked production project.
97. Actual Supabase Auth login and Data API tests run for two workspaces and all roles, with RLS exercised by nonprivileged roles.
98. MCP modern SDK runs in real Edge runtime; gateway rejects bad JWT/opaque tokens and exposes only approved custom tools, never the management MCP API.
99. Storage import/export staging private; signed downloads expire and cross-user/workspace access fails.
100. Multi-session integration test races membership revocation, template/predicate changes and entity/edge writes; committed data remains valid.
101. CI uses pinned tool versions/lockfiles and secret scanning; PR gates, independent review and protected main confirmed on actual repo.
102. Backup/restore includes all database schemas, authentication and storage/config recovery plan; secrets reissued, never exported in plaintext.

## Registry / execution separation (owner correction)

103. Registry accepts `process_kind` and rejects legacy `process` entity kind; all five Registry lists, templates, predicate endpoints and entity references use the new vocabulary.
104. Process executions never appear in Registry counts, relations, search, traversal, CSV exchange or Registry MCP tools; any separately approved execution API/tool group stays isolated.
105. Many Process rows may reference the same published Process Kind version; a non-Process-Kind entity, nonexistent version or cross-workspace version cannot be referenced.
106. Published Process Kind version rows are immutable; old executions retain their exact version and package digest when a new standard is published.
107. Process tables deny direct client DML; execution access is not exposed until role/Edge authorization and audited RPCs are tested.
108. Invalid state/priority/attempt count/progress/timestamp combinations fail; a retry uses the same Process ID.
109. Future queue claim/lease tests prove exclusive claims, fencing, retry/idempotency, stale-worker rejection and reconciliation between queue and Process state.
110. Execution API and tool group remain separate from Registry; no execution web UI, execution graph or graph orchestration is implemented.

## Production v0 additional gates (owner-approved MCP-first direction)

111. Shared login, callback, enrollment and recovery work on the identity host. OAuth consent works across its separate origin. The Registry, Authority and Workspace mini app surfaces and the custom MCP follow the same authorization and validation contracts.
112. Real browser OAuth code/PKCE, state/nonce, consent approve/deny, refresh, revocation and passkey/fallback tests pass on the chosen stable identity origin.
113. OAuth-issued access tokens are accepted only with validated issuer, resource/audience, session/client identity and explicit user/client/workspace operation grants; unapproved clients and ID tokens cannot access Registry.
114. Grant revocation, role downgrade and membership removal apply at the next request across MCP, Data API/RPC and file adapters; existing opaque tokens remain scoped.
115. The custom MCP exposes the reviewed application tool groups and reuses authoritative native functions with least privilege and audited outcomes. The official Supabase MCP is never an end-user endpoint.
116. Each released tool has typed inputs/outputs, useful descriptions, accurate annotations, bounded results and actionable errors; ambiguous lookup never selects a record for mutation automatically.
117. High-impact mutations enforce approved preview/confirmation, version and replay protections server-side; LLM-provided confirmation flags alone are insufficient.
118. Real intended LLM client plus independent SDK harness complete representative supported business workflows without direct SQL/admin access.
119. Repository migration IDs and hashes match the designated development installation; fresh provisioning, generated schema types and regression gates reproduce the approved release. No reset of Registry.
120. Production rollout preserves the existing test project and meets deployment, security, monitoring, backup and recovery gates; execution remains unavailable unless its independent authorization and activation gates pass.

## Stage gates

M0: fresh local stack, migration smoke test, CI configuration and actual checks, branch protection. M1: 1–47, 82–83, 86–94, 96–97, 100 as applicable to delivered operations (credential/invitation functionality may finish M3 but deny by default until then). M2: 48–58 as applicable to list/search/dashboard; end-to-end Auth and authorized application API for five kinds. M3: 37–43, 69–81, 84, 89, 94–95, 98. M4: 58–68, 99, ordered path reports. M5: all remaining, 85, 101–102, load/restore. Execution foundation: 103–107 and structural portion of 108. Execution activation: all 103–110; no execution activation until those gates pass. Production v0 additionally requires 111–120. No production deployment until every applicable requirement is verified or explicitly changed by owner.

## Golden Path development acceptance

The actual local application journey is tested by `tests/supabase/golden_path.py`, launched by `tests/supabase/run_mcp_local.py --confirm-disposable`. All domain writes use the real MCP. Starting with an empty workspace and real Auth sessions, it discovers kinds/capabilities, creates configurable ontology, registers and connects every kind, searches/traverses, updates optimistically, reads history, checks denial and revocation, then independently compares actual database rows through the authenticated Data API. The corresponding five SQL checks run in CI and rollback. Passed locally and the new SQL checks passed on development Registry, with the deployed v6 negative HTTP checks passing. Production acceptance still requires browser login/OAuth and actual intended LLM client over authenticated hosted MCP.
