import { decodePackage, encodePackage, type Snapshot } from './exchange.ts';
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from 'npm:@zip.js/zip.js@2.25.0';
const source:Snapshot={sourceWorkspaceId:'00000000-0000-0000-0000-000000000001',exportedAt:'2026-11-24T00:00:00Z',entities:[{id:'00000000-0000-0000-0000-000000000002',kind:'object',type:'asset',title:'Name, "quoted"',status:'active',attributes:{value:'line\n2'},notes:'',tags:['tag']},{id:'00000000-0000-0000-0000-000000000003',kind:'person',type:'person',title:'Person',status:'archived',attributes:{},notes:null,tags:[]}],relations:[{id:'00000000-0000-0000-0000-000000000004',from_id:'00000000-0000-0000-0000-000000000003',to_id:'00000000-0000-0000-0000-000000000002',predicate:'owns',attributes:{},valid_from:null,valid_to:null}]};
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
Deno.test('CSV/ZIP round trip preserves identities, multiline text, null and empty notes',async()=>{
 const b=await decodePackage(await encodePackage(source));
 assert(b.entities.length===2&&b.relations.length===1);
 for(let i=0;i<source.entities.length;i++)for(const [k,v] of Object.entries(source.entities[i]))assert(JSON.stringify(b.entities[i][k])===JSON.stringify(v));
 for(const [k,v] of Object.entries(source.relations[0]))assert(JSON.stringify(b.relations[0][k])===JSON.stringify(v));
});
Deno.test('ZIP with extra/path traversal entry rejected',async()=>{
 const zip=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
 for(const name of ['entities.csv','relations.csv','../manifest.json'])await zip.add(name,new Uint8ArrayReader(new Uint8Array([1])));
 const bytes=await zip.close();let failed=false;try{await decodePackage(bytes);}catch{failed=true;}assert(failed);
});
