import { ZipWriter,Uint8ArrayWriter,TextReader } from 'npm:@zip.js/zip.js@2.25.0';
import { validateSkillPackage } from './process-package.ts';
import {sha256} from './exchange.ts';
async function archive(entries:string[]):Promise<Uint8Array>{
 const w=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
 for(const path of entries)await w.add(path,new TextReader('content'));
 return await w.close();
}
async function rejects(fn:()=>Promise<unknown>){let rejected=false;try{await fn();}catch{rejected=true;}if(!rejected)throw new Error('expected rejection');}
Deno.test('package digest covers exact original bytes',async()=>{
 const bytes=await archive(['SKILL.md','references/notes.md']);
 if(await validateSkillPackage(bytes)!==await sha256(bytes))throw new Error('digest mismatch');
});
Deno.test('package rejects path traversal, case collisions and file/directory conflicts',async()=>{
 for(const entries of [['../x'],['/x'],['C:/x'],['a','A'],['a','a/b']]){
  const bytes=await archive(entries);await rejects(()=>validateSkillPackage(bytes));
 }
});
Deno.test('package rejects symbolic links and invalid ZIP',async()=>{
 const w=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
 await w.add('link',new TextReader('/etc/passwd'),{unixMode:0o120777});
 const bytes=await w.close();await rejects(()=>validateSkillPackage(bytes));
 await rejects(()=>validateSkillPackage(new Uint8Array([1,2,3])));
});
