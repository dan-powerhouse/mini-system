// Binary exchange format from CONTRACTS 5.13. Reuse published CSV/ZIP libraries.
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from 'npm:@zip.js/zip.js@2.25.0';
import { parse } from 'npm:csv-parse@7.0.3/sync';
import { stringify } from 'npm:csv-stringify@6.9.0/sync';
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 10_000;
export const ENTITY_COLUMNS = ['id','kind','type','title','status','attributes_json','notes','tags_json'];
export const RELATION_COLUMNS = ['id','from_id','to_id','predicate','attributes_json','valid_from','valid_to'];
const names = ['entities.csv','relations.csv','manifest.json'];
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', {fatal:true});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string { return typeof v === 'string' && uuidPattern.test(v); }
export async function sha256(b: Uint8Array): Promise<string> {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(b))), x=>x.toString(16).padStart(2,'0')).join('');
}
export type Row = Record<string, unknown>;
export type Payload = {entities: Row[], relations: Row[]};
export type Snapshot = Payload & {sourceWorkspaceId: string, exportedAt: string};
function check(ok: unknown, code='INVALID_PACKAGE'): asserts ok { if(!ok) throw new Error(code); }
function record(v:unknown): v is Row { return v !== null && typeof v === 'object' && !Array.isArray(v); }
// Check declared size first, then enforce actual streamed output size as defense in depth.
export async function decodePackage(bytes: Uint8Array): Promise<Payload> {
 check(bytes.length > 0 && bytes.length <= MAX_BYTES,'PAYLOAD_TOO_LARGE');
 const reader = new ZipReader(new Uint8ArrayReader(bytes), {useWebWorkers:false});
 const files = new Map<string,Uint8Array>(); let total=0;
 try {
  const entries=await reader.getEntries();
  check(entries.length===3);
  for(const e of entries){
   check(names.includes(e.filename) && !files.has(e.filename) && !e.directory && !e.encrypted);
   check(Number.isSafeInteger(e.uncompressedSize) && e.uncompressedSize>=0 && e.uncompressedSize<=MAX_BYTES-total,'PAYLOAD_TOO_LARGE');
   if(e.filename==='manifest.json') check(e.uncompressedSize<=16384);
   const data=new Uint8Array(e.uncompressedSize); let offset=0;
   await e.getData(new WritableStream<Uint8Array>({write(chunk){
    check(offset+chunk.byteLength<=data.byteLength && total+chunk.byteLength<=MAX_BYTES,'PAYLOAD_TOO_LARGE');
    data.set(chunk,offset); offset+=chunk.byteLength; total+=chunk.byteLength;
   }}),{checkSignature:true,useWebWorkers:false});
   check(offset===data.length); files.set(e.filename,data);
  }
 } finally { await reader.close(); }
 const manifest:unknown=JSON.parse(dec.decode(files.get('manifest.json')!));
 check(record(manifest) && manifest.formatVersion===1 && isUuid(manifest.sourceWorkspaceId) && typeof manifest.exportedAt==='string' && Number.isFinite(Date.parse(manifest.exportedAt)) && record(manifest.rowCounts) && record(manifest.checksums));
 for(const name of ['entities.csv','relations.csv']) check(manifest.checksums[name]===await sha256(files.get(name)!),'CHECKSUM_MISMATCH');
 function csv(name:string, columns:string[]): Row[] {
  const rows=parse(dec.decode(files.get(name)!),{bom:false,skip_empty_lines:false,max_record_size:MAX_BYTES,columns:false,cast:(value:string, context:{quoting:boolean})=>value===''&&!context.quoting?null:value}) as unknown[][];
  check(rows.length>=1 && rows.length<=MAX_ROWS+1 && JSON.stringify(rows[0])===JSON.stringify(columns));
  return rows.slice(1).map((cells,i)=>{
   check(cells.length===columns.length,`INVALID_ROW:${name}:${i+2}`);
   const r:Row=Object.fromEntries(columns.map((c,j)=>[c,cells[j]]));
   for(const c of ['attributes_json','tags_json']) if(c in r){
    try { r[c==='attributes_json'?'attributes':'tags']=JSON.parse(String(r[c])); }
    catch { // Preserve malformed cells as validation failures in the SQL preview.
      r[c==='attributes_json'?'attributes':'tags']=null;
    }
    delete r[c];
   }
   return r;
  });
 }
 const entities=csv('entities.csv',ENTITY_COLUMNS),relations=csv('relations.csv',RELATION_COLUMNS);
 check(entities.length+relations.length<=MAX_ROWS,'PAYLOAD_TOO_LARGE');
 check(manifest.rowCounts.entities===entities.length && manifest.rowCounts.relations===relations.length,'ROW_COUNT_MISMATCH');
 return {entities,relations};
}
export async function encodePackage(snapshot:Snapshot):Promise<Uint8Array>{
 check(isUuid(snapshot.sourceWorkspaceId) && snapshot.entities.length+snapshot.relations.length<=MAX_ROWS);
 function csv(rows:Row[],columns:string[]):Uint8Array {
  const cells=rows.map(r=>columns.map(c=>c==='attributes_json'?JSON.stringify(r.attributes):c==='tags_json'?JSON.stringify(r.tags):r[c]??null));
  // CSV convention: null is unquoted empty; literal empty string is quoted.
  return enc.encode(stringify([columns,...cells],{quoted_string:true,record_delimiter:'\n'}));
 }
 const entities=csv(snapshot.entities,ENTITY_COLUMNS),relations=csv(snapshot.relations,RELATION_COLUMNS);
 const manifest=enc.encode(JSON.stringify({formatVersion:1,exportedAt:snapshot.exportedAt,sourceWorkspaceId:snapshot.sourceWorkspaceId,rowCounts:{entities:snapshot.entities.length,relations:snapshot.relations.length},checksums:{'entities.csv':await sha256(entities),'relations.csv':await sha256(relations)}}));
 check(entities.length+relations.length+manifest.length<=MAX_BYTES,'PAYLOAD_TOO_LARGE');
 const zip=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,level:6});
 await zip.add('entities.csv',new Uint8ArrayReader(entities));
 await zip.add('relations.csv',new Uint8ArrayReader(relations));
 await zip.add('manifest.json',new Uint8ArrayReader(manifest));
 const bytes=await zip.close(); check(bytes.length<=MAX_BYTES,'PAYLOAD_TOO_LARGE'); return bytes;
}
