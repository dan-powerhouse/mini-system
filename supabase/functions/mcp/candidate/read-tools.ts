// Read-only application tools backed by the ticketed dispatcher.
import { z } from 'zod';
import { kind } from '../schemas.ts';
const page = { after: z.string().min(1).max(140).optional(), limit: z.number().int().min(1).max(50).optional() };
const empty = z.object({}).strict();
export const readTools = {
  get_context: { title: 'Get application context', description: 'Call first to identify the workspace, role, credential scopes and allowed tools. This credential is bound to one workspace.', inputSchema: empty },
  list_templates: { title: 'Discover entity types', description: 'Find valid types for a Registry kind before creating or changing an entity. Follow nextAfter unchanged to list more.', inputSchema: z.object({ ...page, kind: kind.optional() }).strict() },
  get_template: { title: 'Read entity template', description: 'Read the exact fields and constraints of a registered kind/type. Call before preparing attributes; never invent fields.', inputSchema: z.object({kind, type:z.string().min(1).max(100)}).strict() },
  list_predicates: { title: 'Discover relationship predicates', description: 'Find allowed relationship names, endpoint kinds and direction before connecting entities. Follow nextAfter for more.', inputSchema: z.object(page).strict() },
  get_dashboard: { title: 'Summarize the Registry', description: 'Read counts by kind, orphan counts and stale Process Kind definitions. This is a compact summary, not an execution report or audit history.', inputSchema: empty },
  run_path_report: { title: 'Report an ordered relationship path', description: 'After identifying a start entity and valid predicates, explore exactly one or two ordered relationship steps. Use traverse for general discovery. Results are bounded; truncated means more paths exist.', inputSchema: z.object({startId:z.uuid(),steps:z.array(z.object({predicate:z.string().min(1).max(100),direction:z.enum(['incoming','outgoing','either'])}).strict()).min(1).max(2),maxResults:z.number().int().min(1).max(100).optional()}).strict() },
  list_saved_views: { title: 'List available saved views', description: 'Read your own personal views and workspace-shared views. Use their query with search_entities. Other users’ personal views are not available.', inputSchema: z.object(page).strict() },
} as const;
export const readAnnotations = { readOnlyHint:true, destructiveHint:false, openWorldHint:false } as const;

// Exact result shapes for the candidate operations. Dynamic template/query fields remain JSON.
const pageResult = <T extends z.ZodType>(item:T) => z.object({items:z.array(item).max(50),nextAfter:z.string().nullable()}).strict();
const ver = z.number().int().positive();
const status = z.enum(['active','inactive','archived']);
const entityRef = z.object({id:z.uuid(),title:z.string(),kind,type:z.string(),status,version:ver}).strict();
const relationRef = z.object({id:z.uuid(),fromId:z.uuid(),toId:z.uuid(),predicate:z.string(),version:ver,validFrom:z.string().nullable(),validTo:z.string().nullable()}).strict();
const counts = z.record(kind,z.number().int().nonnegative());
export const readOutputs = {
 get_context:z.object({workspace:z.object({id:z.uuid(),name:z.string(),slug:z.string()}).strict(),role:z.enum(['owner','admin','editor','viewer']),scopes:z.array(z.enum(['read','write','manage'])),allowedTools:z.array(z.string()),kinds:z.array(kind),workspaceBound:z.literal(true)}).strict(),
 list_templates:pageResult(z.object({kind,type:z.string(),version:ver,fieldCount:z.number().int().nonnegative()}).strict()),
 get_template:z.object({kind,type:z.string(),version:ver,fields:z.array(z.json()),updatedAt:z.string()}).strict(),
 list_predicates:pageResult(z.object({name:z.string(),description:z.string(),fromKinds:z.array(kind),toKinds:z.array(kind),directed:z.boolean(),symmetricHelper:z.string().nullable(),version:ver}).strict()),
 get_dashboard:z.object({countsByKind:counts,orphanCountsByKind:counts,staleProcessKindDays:z.number().int().positive(),staleProcessKinds:z.array(z.object({id:z.uuid(),title:z.string(),type:z.string(),version:ver,updatedAt:z.string()}).strict()).max(20)}).strict(),
 run_path_report:z.object({paths:z.array(z.object({entities:z.array(entityRef).min(2).max(3),relations:z.array(relationRef).min(1).max(2)}).strict()).max(100),truncated:z.boolean()}).strict(),
 list_saved_views:pageResult(z.object({id:z.uuid(),name:z.string(),visibility:z.enum(['personal','workspace']),kind:kind.nullable(),query:z.record(z.string(),z.json()),version:ver,isMine:z.boolean()}).strict()),
} as const;
export type ReadToolName=keyof typeof readTools;
