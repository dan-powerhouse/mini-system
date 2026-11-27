// Multipart ZIP upload; trusted RPC binds package digest to verified caller.
import { admin, boundedMultipart, failure, json, principal } from '../_shared/exchange-http.ts';
import { decodePackage, isUuid, MAX_BYTES, sha256 } from '../_shared/exchange.ts';
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json(405,{code:'METHOD_NOT_ALLOWED'});
 try{
  const p=await principal(req);
  const form=await boundedMultipart(req), workspace=form.get('workspaceId'),file=form.get('file');
  if(!isUuid(workspace)||!(file instanceof File)||file.size<1)throw new Error('INVALID_PACKAGE');
  if(file.size>MAX_BYTES)throw new Error('PAYLOAD_TOO_LARGE');
  const {data:membership,error:memberError}=await p.client.from('workspace_member').select('role').eq('workspace_id',workspace).eq('user_id',p.id).maybeSingle();
  if(memberError||!membership||!['owner','admin','editor'].includes(membership.role))throw new Error('FORBIDDEN');
  const bytes=new Uint8Array(await file.arrayBuffer()),payload=await decodePackage(bytes),digest=await sha256(bytes),uploadId=crypto.randomUUID();
  const path=`${workspace.toLowerCase()}/${p.id}/${uploadId}.zip`;
  const bucket=admin.storage.from('registry-exchange');
  const {error:storageError}=await bucket.upload(path,bytes,{contentType:'application/zip',upsert:false});
  if(storageError)throw new Error('SERVICE_UNAVAILABLE');
  const {data,error}=await admin.rpc('exchange_stage_upload',{p_workspace_id:workspace,p_user_id:p.id,p_upload_id:uploadId,p_source_hash:digest,p_size_bytes:bytes.length,p_payload:payload});
  if(error){await bucket.remove([path]);throw new Error(error.code==='42501'?'FORBIDDEN':'SERVICE_UNAVAILABLE');}
  return json(201,data);
 }catch(error){return failure(error);}
});
