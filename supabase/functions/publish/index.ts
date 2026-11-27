// Disabled by config until Center package format and Storage integration reviewed.
// Only this trusted adapter attests the validated digest; SQL owns authorization,
// optimistic revision checks, version allocation and atomic audit.
import {admin,boundedMultipart,failure,json,principal} from '../_shared/exchange-http.ts';
import {isUuid,MAX_BYTES,sha256} from '../_shared/exchange.ts';
import {validateSkillPackage} from '../_shared/process-package.ts';
Deno.serve(async(req)=>{
 if(!['POST','GET'].includes(req.method))return json(405,{code:'METHOD_NOT_ALLOWED'});
 try{
  const p=await principal(req);
  const url=new URL(req.url);
  const form=req.method==='POST'?await boundedMultipart(req):null;
  const workspace=form?form.get('workspaceId'):url.searchParams.get('workspaceId');
  const kind=form?form.get('processKindId'):url.searchParams.get('processKindId');
  if(!isUuid(workspace)||!isUuid(kind))throw new Error('INVALID_PACKAGE');
  const {data:m,error:me}=await p.client.from('workspace_member').select('role').eq('workspace_id',workspace).eq('user_id',p.id).maybeSingle();
  if(me||!m||!['owner','admin'].includes(m.role))throw new Error('FORBIDDEN');
  if(req.method==='GET'){
   const before=url.searchParams.get('beforeVersion'),limit=url.searchParams.get('limit')??'25';
   if(!/^\d{1,3}$/.test(limit)||before!==null&&!/^\d{1,10}$/.test(before))throw new Error('INVALID_PACKAGE');
   const {data,error}=await admin.rpc('process_kind_publications',{p_workspace_id:workspace,p_user_id:p.id,p_process_kind_id:kind,p_before:before===null?null:Number(before),p_limit:Number(limit)});
   if(error)throw new Error(error.message==='NOT_FOUND'?'NOT_FOUND':'INVALID_PACKAGE');
   return json(200,data);
  }
  const file=form!.get('file'),spec=form!.get('specification'),entityVersion=form!.get('expectedEntityVersion'),publicationVersion=form!.get('expectedPublicationVersion'),uploadId=form!.get('uploadId');
  if(!(file instanceof File)||!isUuid(uploadId)||typeof spec!=='string'||typeof entityVersion!=='string'||typeof publicationVersion!=='string'||!/^\d{1,10}$/.test(entityVersion)||!/^\d{1,10}$/.test(publicationVersion))throw new Error('INVALID_PACKAGE');
  if(file.size>MAX_BYTES||new TextEncoder().encode(spec).length>1048576)throw new Error('PAYLOAD_TOO_LARGE');
  const specification=JSON.parse(spec);
  if(!specification||typeof specification!=='object'||Array.isArray(specification))throw new Error('INVALID_PACKAGE');
  const bytes=new Uint8Array(await file.arrayBuffer()),digest=await validateSkillPackage(bytes);
  const path=workspace.toLowerCase()+'/'+kind.toLowerCase()+'/'+uploadId.toLowerCase()+'.zip';
  const bucket=admin.storage.from('process-kind-packages');
  const {error:se}=await bucket.upload(path,bytes,{contentType:'application/zip',upsert:false});
  if(se){
   // Idempotent retry: compare bytes already stored; NEVER overwrite or delete
   // an object on an ambiguous result, as publication may have committed.
   const {data:existing,error:de}=await bucket.download(path);
   if(de||!existing||existing.size>MAX_BYTES)throw new Error('SERVICE_UNAVAILABLE');
   if(await sha256(new Uint8Array(await existing.arrayBuffer()))!==digest)return json(409,{code:'PUBLICATION_CONFLICT'});
  }
  const {data,error}=await admin.rpc('process_kind_publish',{p_workspace_id:workspace,p_user_id:p.id,p_process_kind_id:kind,p_expected_entity_version:Number(entityVersion),p_expected_publication_version:Number(publicationVersion),p_upload_id:uploadId,p_sha256:digest,p_specification:specification});
  if(error){
   if(['VERSION_CONFLICT','PUBLICATION_CONFLICT'].includes(error.message))return json(409,{code:error.message});
   if(error.message==='NOT_FOUND')throw new Error('NOT_FOUND');
   if(error.code==='42501')throw new Error('FORBIDDEN');
   throw new Error('SERVICE_UNAVAILABLE');
  }
  const {package_path:_,specification:__,...metadata}=data;
  return json(201,metadata);
 }catch(error){return failure(error);}
});
