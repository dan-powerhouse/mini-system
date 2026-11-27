import { tools } from './schemas.ts';
import { toolUX,toolError } from './tool-ux.ts';
import { readTools,readOutputs } from './candidate/read-tools.ts';
function assert(v:unknown,message:string) {if(!v)throw new Error(message);}
Deno.test('nine compatibility tools have accurate closed-world hints',()=>{
 assert(Object.keys(toolUX).length===9,'metadata count');
 for(const n of Object.keys(tools) as (keyof typeof tools)[]) {const m=toolUX[n];assert(m.description.length>50&&m.title.length>0&&!m.annotations.openWorldHint,n);}
 assert(toolUX.archive_entity.annotations.destructiveHint&&!toolUX.archive_entity.annotations.readOnlyHint,'archive hint');
 assert(!toolUX.create_entity.annotations.idempotentHint,'create must not promise replay');
});
Deno.test('errors never leak internal SQL text and give next action',()=>{
 const r=JSON.parse(toolError('VERSION_CONFLICT').content[0].text);assert(r.code==='VERSION_CONFLICT'&&r.nextAction.includes('Do not automatically retry'),'version recovery');
 const unknown=JSON.parse(toolError('select secret from private.api_token').content[0].text);assert(unknown.code==='INTERNAL_ERROR'&&!JSON.stringify(unknown).includes('api_token'),'unsafe error leaked');
});
Deno.test('candidate tool schemas reject unbounded reads and workspace override',()=>{
 assert(Object.keys(readTools).length===7,'read tool count');
 assert(!readTools.get_context.inputSchema.safeParse({workspaceId:'other'}).success,'context override');
 assert(!readTools.list_templates.inputSchema.safeParse({limit:51}).success,'page limit');
 assert(!readTools.run_path_report.inputSchema.safeParse({startId:'00000000-0000-0000-0000-000000000001',steps:[]}).success,'empty path');
});
Deno.test('candidate output schemas reject extraneous fields and missing counts',()=>{
 assert(readOutputs.list_templates.safeParse({items:[{kind:'person',type:'employee',version:1,fieldCount:0}],nextAfter:null}).success,'valid template result');
 assert(!readOutputs.list_saved_views.safeParse({items:[],nextAfter:null,token:'secret'}).success,'unexpected credential');
 assert(!readOutputs.get_dashboard.safeParse({countsByKind:{person:1},orphanCountsByKind:{},staleProcessKindDays:90,staleProcessKinds:[]}).success,'missing kinds');
});
