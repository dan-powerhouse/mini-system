// Package safety checks, not a new skill manifest standard. Final semantic
// validation/activation is pending the Center's approved package contract.
import { ZipReader, Uint8ArrayReader } from 'npm:@zip.js/zip.js@2.25.0';
import { MAX_BYTES, sha256 } from './exchange.ts';
const MAX_ENTRIES=1000;
function require(ok:unknown,code='INVALID_PACKAGE'): asserts ok {if(!ok)throw new Error(code);}
export async function validateSkillPackage(bytes:Uint8Array):Promise<string>{
 require(bytes.length>0 && bytes.length<=MAX_BYTES,'PAYLOAD_TOO_LARGE');
 const reader=new ZipReader(new Uint8ArrayReader(bytes),{useWebWorkers:false});
 const seen=new Map<string,boolean>(); let total=0,files=0;
 try{
  for await(const entry of reader.getEntriesGenerator()){
   require(seen.size<MAX_ENTRIES,'PAYLOAD_TOO_LARGE');
   const name=entry.filename.replace(/\/$/,'');
   const parts=name.split('/');
   require(name.length>0 && name.length<=512 && !/[\\:\u0000-\u001f\u007f]/.test(name)
     && parts.every(p=>p.length>0 && p!=='.' && p!=='..' && !/[. ]$/.test(p)));
   require(!entry.encrypted && !entry.symlink);
   const kind=(entry.externalFileAttributes>>>16)&0o170000;
   require(kind===0 || kind===(entry.directory?0o040000:0o100000));
   const key=name.normalize('NFC').toLowerCase();
   require(!seen.has(key));seen.set(key,entry.directory);
   require(Number.isSafeInteger(entry.uncompressedSize) && entry.uncompressedSize>=0 && entry.uncompressedSize<=MAX_BYTES-total,'PAYLOAD_TOO_LARGE');
   if(entry.directory){require(entry.uncompressedSize===0);continue;}
   files++;
   let size=0;
   await entry.getData(new WritableStream<Uint8Array>({write(chunk){
    size+=chunk.byteLength;total+=chunk.byteLength;
    require(size<=entry.uncompressedSize && total<=MAX_BYTES,'PAYLOAD_TOO_LARGE');
   }}),{checkSignature:true,useWebWorkers:false});
   require(size===entry.uncompressedSize);
  }
  require(files>0);
  for(const key of seen.keys()){
   const parts=key.split('/');
   for(let i=1;i<parts.length;i++)require(seen.get(parts.slice(0,i).join('/'))!==false);
  }
 }finally{await reader.close();}
 return await sha256(bytes);
}
