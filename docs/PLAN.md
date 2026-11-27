# mini system — Supabase implementation plan

Production v0 active release direction · 2026-11-27

## Purpose and scope

A small-team registry of People, Objects, Process Kinds, Agents and Apps. Production v0 supports authorized business workflows through the custom MCP in ChatGPT or Claude and through the Registry, Authority and Workspace mini app surfaces. Each channel uses the same native Supabase contracts. The operational Processes subsystem remains private until its separate activation gates pass.
## Source and authority

This plan describes scope; `ONTOLOGY.md` defines Registry semantics, `CONTRACTS.md` defines behavior, `ACCEPTANCE.md` defines gates and `DECISIONS.md` records authority. `AGENTS.md` directs contributors. Supabase is the backend; proposed defaults remain subject to owner approval in `DECISIONS.md`.

## Architecture

- One Supabase project per environment, PostgreSQL with one `entity` table for five kinds, workspace-scoped templates/predicates/relations, indexes and views. Use Postgres constraints, SQL functions and RLS as the authoritative validation/transaction boundary. PostgreSQL 16 is the standalone regression baseline. The pinned Supabase CLI local stack targets PostgreSQL 17, matching Registry. The designated managed Registry development project runs PostgreSQL 17.12; 129 SQL/native-queue and identity regression checks passed there with PGMQ 1.5.1. Maintain compatibility.
- Supabase Auth owns users and sessions (email magic link, planned Google OAuth, native OAuth/OIDC identity provider and passkeys). The identity authorization SQL is installed. Production Auth configuration and delegated Registry access remain pending. Membership, not browser input or stale JWT role claims, determines workspace role. Supabase Storage handles private import/export files; Vault/Edge secrets hold secret material where appropriate. No credentials in entity attributes or logs.
- Supabase Data API is the read interface (RLS); grant only explicit read permissions, and expose named RPCs for controlled writes and complex reads. Revoke raw table writes from application roles, including service role where feasible. A service-role client must never be a general-purpose bypass. Use private schema for privileged helpers, fixed search paths, least privilege, explicit grants and tests.
- Custom MCP server in Edge Functions using official MCP handler as transport. Keep the existing nine tools and three resources as the compatibility core; expand the application-level catalog under CONTRACTS §9 and PRODUCTION_V0. Retain the requested revision 2026-07-28 until compatibility is verified; no silently enabled legacy sessions. Native OAuth/OIDC is the human delegation path, subject to explicit per-client/user/workspace grants and resource-bound token checks; preserve the original opaque revocable tokens for authorized unattended clients. Prove the actual pinned SDK/Edge compatibility. Agents/apps use bounded, workspace-scoped credentials tied to current membership and scope. No browser service keys.
- The mini app surfaces share the Registry visual kit. Registry covers records, ontology and relationships. Authority covers pending human decisions and their execution receipts. Workspace covers active context, saved views and member administration. Shared login and OAuth consent have separate hosting. The current `apps/identity` package contains both routes pending cross-origin integration. The official Supabase MCP and Studio remain infrastructure tools.
- Realtime is optional for refresh; Cron cleans up expired staging, not audit history without a retention decision. Backups, isolated environments and restore drill are required before production.

## User workflows

1. Workspace bootstrap: create owner and workspace together. Invite members, change roles, transfer ownership, revoke access. Owner/admin manage definitions, settings and tokens; editor maintains records; viewer reads.
2. Ontology setup: configure type templates, required/default typed properties, allowed predicates, direction and inverse label/helper. Validate existing data before changing definitions. Empty registry at workspace creation pending seed approval; examples are illustrative.
3. Registry: five searchable kinds, template-aware structured results, status/type/tag/attribute filters, pagination, bulk tag/archive; create/edit records, Markdown notes, relationships and history through the supported application channels. Archive instead of delete. Version conflicts ask caller to refresh. Relations are independently editable, temporally valid, unique per triple, no self-links; removing edge preserves audit.
4. Search: unified full-text ranking for application search and list tools, structured JSON filters, stable paginated results; archived excluded by default. No required vector search in v1.
5. Dashboard: non-archived counts per kind, orphan counts, recent audit activity, stale active Process Kind definitions using a configurable review threshold; actual process state belongs to a separate operational API. Paths show one/two-hop ordered reports (Process Kinds requiring object, people owning objects required by Process Kind, everything person manages) and additional agent/app dependencies. No graph canvas.
6. MCP: agents learn templates/predicates through resources, search and read, make individual validated mutations, traverse at most three hops/500 nodes. All authenticated MCP calls audited once, including reads and failures. Token rate limit 60/min, body and result caps. Apps use the same RPCs or a scoped Edge adapter; app/agent records alone confer no authority. Custom MCP expansion provides the human application workflow.
7. Power features: saved personal/shared queries and display fields, atomic bulk operations; CSV package export/import with dry run, validation, explicit commit, identity preservation, no overwrite, no cross-workspace leakage.
8. Operations: human-readable history, security monitoring, dependency scans, load/concurrency tests, backup recovery and operational runbook.
9. Authority: authorized users request and review pending actions. The signing policy must define which actions qualify, who can sign and what counts as evidence. MCP users can follow the request to its human decision and check the outcome from chat.

## Execution boundary

The Center defines and publishes reusable Process Kinds (skill-like packages); Edges execute separate Process instances against a pinned published version. `process` is operational storage, not part of Registry search, relations, counts, import/export or MCP. See CONTRACTS §14 for the separate state and execution design. The storage and integrity boundaries are established. Service-only publication RPCs and private native PGMQ state/queue primitives are installed by the reconciled migration baseline; authorization, actual worker activation, integration and artifacts are subsequent slices. No execution graph now.

## Delivery milestones and gates

| Stage | Deliverable | Exit condition |
|---|---|---|
| M0 | Supabase local environment, versioned migrations, PR/CI controls | Fresh reset + pgTAP + security checks; independent review and branch protection |
| M1 | Workspace, five-kind Registry ontology, entities/relations, validation, authorization, audit; separate Process storage foundation | Real database tests for every M1 acceptance case, including concurrent writers; no direct writes |
| M2 | Shared login, separate OAuth consent and native Passkeys | Browser auth tests across both origins plus actual API sessions for all roles and two workspaces |
| M3 | Rich custom application MCP + delegated access + credential lifecycle | Compatibility core plus approved expanded catalog; role/grant/audit tests and real LLM client workflows |
| M4 | Paths, saved views, bulk, CSV exchange | Transactional and round-trip acceptance tests; invalid imports leave no mutations |
| Execution | After Registry works: publication, queue dispatch, claim/lease, state transitions, results and separate operational API | Execution acceptance tests; no graph |
| M5 | Hardening/deployment | All gates, no unresolved critical/high unless explicitly accepted per policy, load test and restore drill |

ParallelSandbox is the execution environment for independent verification. GitHub is for collaboration; its availability does not prevent local/remote development. The active production checklist is [PRODUCTION_V0](PRODUCTION_V0.md). No claim of completion without observed test output. Unfinished features remain explicitly outstanding, not green or silently removed.
