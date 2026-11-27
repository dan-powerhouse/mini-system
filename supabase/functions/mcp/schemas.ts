// Wire contracts follow docs/CONTRACTS.md. Zod validates the external boundary;
// SQL remains authoritative for all dynamic templates and mutations.
import { z } from 'zod';
export const kind = z.enum(['person', 'object', 'process_kind', 'agent', 'app']);
const uuid = z.uuid();
const version = z.number().int().positive().max(2147483647);
const attrs = z.record(z.string(), z.json());
const dateTime = z.iso.datetime({ offset: true }).nullable().optional();
const id = z.object({ id: uuid }).strict();
const patch = {
  type: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  attributes: attrs.optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
};
const edgePatch = { attributes: attrs.optional(), validFrom: dateTime, validTo: dateTime };
export const tools = {
  search_entities: z.object({
    q: z.string().trim().max(500).optional(), kind: kind.optional(), type: patch.type,
    status: z.array(z.enum(['active', 'inactive', 'archived'])).optional(),
    tagsAny: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
    attributeFilters: z.array(z.object({ key: z.string().min(1).max(128), operator: z.enum(['eq', 'contains', 'gt', 'gte', 'lt', 'lte']), value: z.json() }).strict()).max(20).optional(),
    limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(2048).optional(),
    sort: z.object({ field: z.enum(['title', 'createdAt', 'updatedAt']), direction: z.enum(['asc', 'desc']) }).strict().optional(),
  }).strict(),
  get_entity: id,
  create_entity: z.object({ ...patch, kind, type: patch.type.unwrap(), title: patch.title.unwrap() }).strict(),
  update_entity: z.object({ ...patch, id: uuid, expectedVersion: version }).strict(),
  archive_entity: z.object({ id: uuid, expectedVersion: version }).strict(),
  create_relation: z.object({ ...edgePatch, fromId: uuid, toId: uuid, predicate: z.string().min(1).max(100) }).strict(),
  update_relation: z.object({ ...edgePatch, id: uuid, expectedVersion: version }).strict(),
  delete_relation: id,
  traverse: z.object({ startId: uuid, predicates: z.array(z.string().min(1).max(100)).max(50).optional(), direction: z.enum(['incoming', 'outgoing', 'both']).optional(), depth: z.number().int().min(1).max(3), maxNodes: z.number().int().min(1).max(2147483647).optional() }).strict(),
} as const;
export type ToolName = keyof typeof tools;
