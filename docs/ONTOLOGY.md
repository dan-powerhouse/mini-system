# mini system ontology

The ontology describes permitted kinds, subtypes, properties and relations; instances are the actual records. Five kinds were requested by the owner. The type and predicate catalogs are workspace-configurable; examples below are not seeded production defaults.

| Kind key | Meaning | Illustrative types |
|---|---|---|
| person | Human actor | employee, customer, supplier |
| object | Resource, physical or digital | document, equipment, dataset |
| process_kind | Reusable, centrally defined standard for work; never an execution | code_review, onboarding, research |
| agent | Intelligent or automated actor | coding_assistant, research_agent, monitor |
| app | Software or service | saas, api, mcp_server |

Single entity table; UUID, workspace, kind, type, title, status, properties (`attributes` JSONB), Markdown notes, tags, created/updated actor/time and version. Kind immutable; type change must validate destination template. Active/inactive/archived; archive terminal in v1, relationships remain. App or agent identity is not a login credential. Actor identity for requests is separate from the descriptive entity record.

## Type template contract

Each workspace has a current template per `(kind,type)` with version. Fields: stable unique snake_case `name`, `dataType`, optional `required`, `options`, `default`, optional `entityRefKind` for references. Optional display label/description is a proposed UI refinement, not required to persist data. Unknown attribute keys and explicit null are rejected. Defaults apply only on create. Field types: text (string), number (finite JSON number), date (real YYYY-MM-DD date), select (exact option), multiselect (unique permitted string array), entity_ref (UUID in same workspace and optional kind). No coercion. Reject invalid template changes instead of rewriting existing records; no template deletion in v1. All five kinds are eligible reference targets.

Example suggested fields: person employee: department, email; object equipment: serial_number, manufacturer; process_kind project_standard: purpose, required_capabilities; agent coding_assistant: provider, model, instructions, capabilities, autonomy_level; app api: provider, version, endpoint, interfaces, authentication_type, capabilities. Use current field types; lists may be modeled with multiselect or entities/relations rather than adding undocumented JSON field types. No secrets, token values or passwords in ordinary attributes. An agent's documented capabilities are descriptive, not authorization.

## Predicate contract

Per-workspace stable `name`, allowed source and target kind arrays, directed flag, optional same-workspace `symmetricHelper`, description, version and audit. Directed=false means traversable both ways; stored orientation stays fixed, no reciprocal auto-write. One row per ordered (workspace, source, predicate, target); no duplicate triple or self-link; valid_to must be after valid_from if both set. Do not add separate repeated episodes in v1. Archive does not erase relation history. Predicate update is rejected if existing edges become invalid; in-use predicate cannot be deleted. Link attributes are a JSON object, no per-predicate link template in v1.

Illustrative vocabulary (owner/admin decides actual configuration):

| Predicate | From → To |
|---|---|
| owns | person → object/app |
| manages | person → person/process_kind |
| contributes_to_standard | person → process_kind |
| reports_to | person/agent → person |
| requires | process_kind → object/app |
| depends_on | process_kind → process_kind |
| part_of | object/process_kind → object/process_kind (configure explicit permitted pairs as appropriate) |
| uses | agent/process_kind → app/object |
| supervises | person → agent |
| delegates_to | person → agent |
| can_execute | agent → process_kind |
| creates | agent → object |
| produces_kind_of | process_kind → object |
| collaborates_with | agent → agent |
| supports | app → process_kind |
| integrates_with | app → app |
| stores | app → object |
| requires_agent | process_kind → agent |

Additional examples `precedes`, `maintains`, `assigned_to`, `member_of` are available for administrators to define. Arrays express allowed Cartesian pairs, not arbitrary pair exceptions; if exclusions are needed, split predicates or approve a model change.

## Registry boundary

Process Kind describes what work the Center wants Edges to perform, analogous to a skill package. Relations describe requirements and capabilities, never actual execution. Published versions and package hashes are separate immutable definition records linked to a Process Kind. Many operational Process instances may reference a single published version. Processes are excluded from all Registry entity types, entity references, predicates, search, traversal and MCP. Their state, attempts, assignments, inputs and outputs belong to the separate `process` table (CONTRACTS §14). No execution graph in this version.

## Query semantics

All lookup, search, references and traversal are scoped to one workspace. Directed edges respect direction, undirected can be followed either way, cycles are deduplicated, shortest depth retained. Archived adjacent entities excluded by default. Temporal validity is metadata in the current release, not silently a current-time filter; an as-of query is a future decision. Ordered path presets are not unordered predicate filters. See CONTRACTS for exact interfaces.
