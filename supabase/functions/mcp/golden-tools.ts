// Golden Path: actual ontology setup and entity history, backed by native RPCs.
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { kind } from './schemas.ts';
import { readOutputs } from './candidate/read-tools.ts';
import { toolError } from './tool-ux.ts';
const identifier = z.string().min(1).max(100);
const field = z.object({name: z.string().regex(/^[a-z][a-z0-9_]*$/), dataType: z.enum(['text','number','date','select','multiselect','entity_ref']), required: z.boolean().optional(), options: z.array(z.string().min(1)).optional(), default:z.json().optional(), entityRefKind:kind.optional()}).strict();
const ver = z.number().int().positive();
export const goldenTools = {
 create_template: {title:'Create an entity type', description:'Owner/admin with explicit manage scope only. After listing templates, create a missing kind/type with user-approved fields. Does not overwrite an existing definition. Call get_template to inspect the result.',inputSchema:z.object({kind,type:identifier,fields:z.array(field).max(100)}).strict(),outputSchema:readOutputs.get_template,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 create_predicate:{title:'Create a relationship predicate',description:'Owner/admin with explicit manage scope only. After listing predicates, create a missing relationship name and permitted endpoint kinds. Does not change existing definitions. Inspect it before creating relations.',inputSchema:z.object({name:identifier.regex(/^[a-z][a-z0-9_]*$/),description:z.string().max(1000),fromKinds:z.array(kind).min(1).max(5),toKinds:z.array(kind).min(1).max(5),directed:z.boolean(),symmetricHelper:identifier.nullable().optional()}).strict(),outputSchema:z.object({name:z.string(),description:z.string(),fromKinds:z.array(kind),toKinds:z.array(kind),directed:z.boolean(),symmetricHelper:z.string().nullable(),version:ver}).strict(),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 get_entity_history:{title:'Read an entity change history',description:'Use a verified entity ID from search or get_entity. Review creation, updates and versions, with a bounded cursor. Does not reveal raw snapshots or secret metadata. Read-only within the current workspace.',inputSchema:z.object({id:z.uuid(),limit:z.number().int().min(1).max(50).optional(),cursor:z.string().min(1).max(2048).optional()}).strict(),outputSchema:z.object({items:z.array(z.object({id:z.uuid(),at:z.string(),action:z.string(),source:z.string(),actorType:z.string(),targetId:z.uuid(),outcome:z.string(),beforeVersion:ver.nullable(),afterVersion:ver.nullable()}).strict()).max(50),nextCursor:z.string().nullable()}).strict(),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
} as const;
type Operation = keyof typeof goldenTools;
export function registerGoldenTools(server:McpServer, dispatch:(name:Operation,args:unknown)=>Promise<{ok:true;data:unknown}|{ok:false;code:string}>) {
 for(const name of Object.keys(goldenTools) as Operation[]) {
  const {outputSchema,...config}=goldenTools[name];
  const output: z.ZodType<Record<string,unknown>> = outputSchema;
  const inputSchema: z.ZodType<Record<string,unknown>> = config.inputSchema;
  server.registerTool(name,{...config,inputSchema,outputSchema:output},async(args:unknown)=>{
   const result=await dispatch(name,args);
   if(!result.ok) return toolError(result.code);
   const parsed=output.safeParse(result.data);
   if(!parsed.success) return toolError('INTERNAL_ERROR');
   return {content:[{type:'text' as const,text:JSON.stringify(parsed.data)}],structuredContent:parsed.data};
  });
 }
}
