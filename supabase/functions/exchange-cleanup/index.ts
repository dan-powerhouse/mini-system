// Invoked only by native Supabase Cron (private.invoke_exchange_cleanup via pg_net)
// with the dedicated EXCHANGE_CLEANUP_SECRET held in Vault; never by user JWTs.
// Storage API deletion precedes database acknowledgement.
import { admin, json } from '../_shared/exchange-http.ts';
import { optionalEnv, sameSecret } from '../_shared/supabase-env.ts';
const secret=optionalEnv('EXCHANGE_CLEANUP_SECRET')?.trim();
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json(405,{code:'METHOD_NOT_ALLOWED'});
 const presented=/^Bearer (\S+)$/.exec(req.headers.get('authorization')??'')?.[1];
 if(!secret||secret.length<32||!presented||!sameSecret(presented,secret))return json(401,{code:'UNAUTHENTICATED'});
 const {data,error}=await admin.rpc('exchange_cleanup_candidates',{p_limit:100});
 if(error)return json(503,{code:'CLEANUP_UNAVAILABLE'});
 let removed=0,failed=0;
 for(const row of data as {id:string,path:string}[]){
  const result=await admin.storage.from('registry-exchange').remove([row.path]);
  if(result.error){failed++;continue;}
  const done=await admin.rpc('exchange_cleanup_finish',{p_upload_id:row.id});
  if(done.error)failed++;else removed++;
 }
 return json(failed?503:200,{removed,failed});
});
