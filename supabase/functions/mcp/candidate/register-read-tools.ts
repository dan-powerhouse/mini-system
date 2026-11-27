// Register read-only application tools with strict output validation.
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { readTools, readOutputs, readAnnotations, type ReadToolName } from './read-tools.ts';
import { toolError } from '../tool-ux.ts';
export type ReadDispatch = (operation:ReadToolName,args:unknown)=>Promise<{ok:true;data:unknown}|{ok:false;code:string}>;
export function registerReadTools(server:McpServer,dispatch:ReadDispatch) {
 for(const name of Object.keys(readTools) as ReadToolName[]) {
  const outputSchema: z.ZodType<Record<string,unknown>> = readOutputs[name];
  server.registerTool(name,{...readTools[name],annotations:{...readAnnotations,title:readTools[name].title},outputSchema},async (args:unknown)=>{
   const response=await dispatch(name,args);
   if(!response.ok) return toolError(response.code);
   const parsed=outputSchema.safeParse(response.data);
   if(!parsed.success) return toolError('INTERNAL_ERROR');
   return {content:[{type:'text' as const,text:JSON.stringify(parsed.data)}],structuredContent:parsed.data};
  });
 }
}
