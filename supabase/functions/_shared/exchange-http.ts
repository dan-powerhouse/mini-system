import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { MAX_BYTES } from './exchange.ts';
import { supabaseEnv } from './supabase-env.ts';
const {url,publishableKey,secretKey}=supabaseEnv();
const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
export const admin=createClient(url,secretKey,{auth});
const verifier=createClient(url,publishableKey,{auth});
export function json(status:number, body:unknown):Response {return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function principal(req:Request){
 const token=/^Bearer ([^\s]+)$/.exec(req.headers.get('authorization')??'')?.[1];
 if(!token) throw new Error('UNAUTHENTICATED');
 // Native JWT verification: local JWKS check for asymmetric signing keys,
 // Auth server fallback for legacy symmetric keys.
 const {data,error}=await verifier.auth.getClaims(token);
 const sub=data?.claims?.sub;
 if(error||typeof sub!=='string'||data?.claims?.role!=='authenticated') throw new Error('UNAUTHENTICATED');
 const client=createClient(url,publishableKey,{auth,global:{headers:{Authorization:`Bearer ${token}`}}});
 const direct=await client.rpc('registry_direct_session');
 if(direct.error||direct.data!==true)throw new Error('FORBIDDEN');
 return {id:sub,client};
}
export async function boundedMultipart(req:Request):Promise<FormData>{
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) throw new Error('UNSUPPORTED_MEDIA_TYPE');
 const max=MAX_BYTES+256*1024, chunks:Uint8Array[]=[]; let size=0;
 const reader=req.body?.getReader(); if(!reader) throw new Error('INVALID_PACKAGE');
 try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>max){await reader.cancel();throw new Error('PAYLOAD_TOO_LARGE');}chunks.push(x.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return await new Request(req.url,{method:'POST',headers:{'Content-Type':req.headers.get('content-type')!},body:bytes}).formData();
}
export function failure(error:unknown){
 const code=error instanceof Error?error.message:'INVALID_PACKAGE';
 if(code==='UNAUTHENTICATED')return json(401,{code});
 if(code==='FORBIDDEN')return json(403,{code});
 if(code==='NOT_FOUND')return json(404,{code});
 if(code==='PAYLOAD_TOO_LARGE')return json(413,{code});
 if(code==='UNSUPPORTED_MEDIA_TYPE')return json(415,{code});
 if(code==='SERVICE_UNAVAILABLE')return json(503,{code});
 return json(400,{code:'INVALID_PACKAGE'});
}
