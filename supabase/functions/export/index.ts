// Export snapshot is created by the authenticated export_create RPC. Binary
// delivery rechecks caller/workspace membership at read time; no public bucket.
import { admin, failure, json, principal } from '../_shared/exchange-http.ts';
import { encodePackage, isUuid, type Snapshot } from '../_shared/exchange.ts';
Deno.serve(async(req)=>{
 if(req.method!=='GET')return json(405,{code:'METHOD_NOT_ALLOWED'});
 try{
  const p=await principal(req),id=new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  if(!isUuid(id))throw new Error('NOT_FOUND');
  const {data,error}=await admin.rpc('exchange_read_export',{p_export_id:id,p_user_id:p.id});
  if(error)throw new Error(error.message==='NOT_FOUND'?'NOT_FOUND':'SERVICE_UNAVAILABLE');
  const snapshot=data as Snapshot,bytes=await encodePackage(snapshot);
  // Return the private, authorized snapshot directly; no signed/public URL or
  // persistent duplicate of the export is created by this adapter.
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="entitygraph-export.zip"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return failure(error);}
});
