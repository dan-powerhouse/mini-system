\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000091'),('00000000-0000-0000-0000-000000000092');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000091';
select (public.workspace_create('Exchange','exchange-test')).id as w \gset
select set_config('test.w',:'w',true);
select public.template_upsert(:'w','object','asset','[{"name":"related","dataType":"entity_ref","entityRefKind":"object"}]');
select public.predicate_upsert(:'w','contains',array['object']::public.entity_kind[],array['object']::public.entity_kind[],true,'Contains');
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000092';
select (public.workspace_create('Other Exchange','other-exchange')).id as other \gset
select set_config('test.other',:'other',true);
select public.template_upsert(:'other','object','asset','[]');
select public.entity_create(:'other','{"kind":"object","type":"asset","title":"Foreign record"}');
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values(:'w','00000000-0000-0000-0000-000000000092','editor');
select set_config('test.payload','{"entities":[{"id":"10000000-0000-0000-0000-000000000091","kind":"object","type":"asset","title":"First","status":"active","attributes":{"related":"10000000-0000-0000-0000-000000000092"},"notes":"Line one\nLine two","tags":["test"]},{"id":"10000000-0000-0000-0000-000000000092","kind":"object","type":"asset","title":"Second","status":"archived","attributes":{"related":"10000000-0000-0000-0000-000000000091"},"notes":null,"tags":[]}],"relations":[{"id":"20000000-0000-0000-0000-000000000091","from_id":"10000000-0000-0000-0000-000000000091","to_id":"10000000-0000-0000-0000-000000000092","predicate":"contains","attributes":{"quantity":1},"valid_from":"2025-01-01T00:00:00Z","valid_to":null}]}',true);
set local role service_role;
select public.exchange_stage_upload(:'w','00000000-0000-0000-0000-000000000091','30000000-0000-0000-0000-000000000091',repeat('a',64),1000,current_setting('test.payload')::jsonb);
select public.exchange_stage_upload(:'w','00000000-0000-0000-0000-000000000091','30000000-0000-0000-0000-000000000092',repeat('b',64),1000,jsonb_set(current_setting('test.payload')::jsonb,'{entities,0,attributes}','{"unknown":1}'));
select public.exchange_stage_upload(:'w','00000000-0000-0000-0000-000000000091','30000000-0000-0000-0000-000000000093',repeat('c',64),1000,current_setting('test.payload')::jsonb);
reset role;
update private.import_job set expires_at=now()-interval '1 second' where id='30000000-0000-0000-0000-000000000093';
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000091';
do $$ declare w uuid:=current_setting('test.w')::uuid; a jsonb; b jsonb; begin
 begin perform public.exchange_stage_upload(w,auth.uid(),gen_random_uuid(),repeat('d',64),1000,'{}'); raise exception 'untrusted stage'; exception when insufficient_privilege then null; end;
 a:=public.import_preview(w,'30000000-0000-0000-0000-000000000091');
 if (a->>'validRows')::int<>3 or jsonb_array_length(a->'errors')<>0 or exists(select 1 from public.entity where workspace_id=w) or exists(select 1 from public.audit_log where workspace_id=w and source='import') then raise exception 'preview incorrect: %',a; end if;
 raise notice 'PASS: preview preserves UUID references without domain writes or audit';
 b:=public.import_preview(w,'30000000-0000-0000-0000-000000000092');
 if b#>>'{errors,0,file}'<>'entities.csv' or b#>>'{errors,0,row}'<>'2' or b#>>'{errors,0,field}'<>'attributes' then raise exception 'missing row error: %',b; end if;
 begin perform public.import_commit(w,'30000000-0000-0000-0000-000000000092'); raise exception 'bad import committed'; exception when raise_exception then if sqlerrm<>'IMPORT_VALIDATION_FAILED' then raise; end if; end;
 raise notice 'PASS: invalid field preview and commit denial';
 begin perform public.import_preview(w,'30000000-0000-0000-0000-000000000093'); raise exception 'expired preview allowed'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: expired upload denied';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000092';
do $$ begin
 begin perform public.import_commit(current_setting('test.w')::uuid,'30000000-0000-0000-0000-000000000091'); raise exception 'foreign commit'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: another workspace member cannot consume preview';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000091';
do $$ declare w uuid:=current_setting('test.w')::uuid; a jsonb; begin
 a:=public.import_commit(w,'30000000-0000-0000-0000-000000000091');
 if a->>'entitiesCreated'<>'2' or a->>'relationsCreated'<>'1' or not exists(select 1 from public.relation where workspace_id=w and id='20000000-0000-0000-0000-000000000091') or (select count(*) from public.audit_log where workspace_id=w and source='import')<>3 then raise exception 'commit not atomic or IDs changed'; end if;
 begin perform public.import_commit(w,'30000000-0000-0000-0000-000000000091'); raise exception 'repeated commit'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: exact IDs, archived snapshot edge, individual audit and single-use commit';
 -- An archived entity nobody references stays out of the default export.
 perform public.entity_archive(w,(public.entity_create(w,'{"kind":"object","type":"asset","title":"Unreferenced"}')).id,1);
 a:=public.export_create(w,null,true); perform set_config('test.export',a->>'exportId',true);
 a:=public.export_create(w); perform set_config('test.active_export',a->>'exportId',true);
end $$;
reset role;
set local role service_role;
do $$ declare a jsonb; b jsonb; begin
 a:=public.exchange_read_export(current_setting('test.export')::uuid,'00000000-0000-0000-0000-000000000091');
 b:=public.exchange_read_export(current_setting('test.active_export')::uuid,'00000000-0000-0000-0000-000000000091');
 -- Default export: active First plus archived Second, which First references
 -- through entity_ref (Acceptance 68 portability); the unreferenced archived
 -- entity is filtered out. Full export contains all three.
 if jsonb_array_length(a->'entities')<>3 or jsonb_array_length(a->'relations')<>1 or jsonb_array_length(b->'entities')<>2 or jsonb_array_length(b->'relations')<>1
    or exists(select 1 from jsonb_array_elements(b->'entities') x where x->>'title'='Unreferenced')
    or a->>'sourceWorkspaceId'<>current_setting('test.w') then raise exception 'export scope incorrect'; end if;
 begin perform public.exchange_read_export(current_setting('test.export')::uuid,'00000000-0000-0000-0000-000000000092'); raise exception 'foreign export'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: export workspace and user isolation, archive filter with referenced dependencies and closed endpoints';
 perform public.exchange_stage_upload(current_setting('test.w')::uuid,'00000000-0000-0000-0000-000000000091','30000000-0000-0000-0000-000000000094',repeat('d',64),1000,current_setting('test.payload')::jsonb);
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000091';
do $$ declare a jsonb; w uuid:=current_setting('test.w')::uuid; begin
 a:=public.import_preview(w,'30000000-0000-0000-0000-000000000094');
 if a#>>'{errors,0,code}'<>'CONFLICT' then raise exception 'UUID conflict not reported'; end if;
 raise notice 'PASS: UUID collision cannot silently overwrite';
end $$;
-- A valid preview must be revalidated against changed template rules at commit.
select public.template_upsert(current_setting('test.w')::uuid,'object','revalidate','[]');
reset role;
set local role service_role;
select public.exchange_stage_upload(current_setting('test.w')::uuid,'00000000-0000-0000-0000-000000000091','30000000-0000-0000-0000-000000000095',repeat('e',64),1000,'{"entities":[{"id":"10000000-0000-0000-0000-000000000095","kind":"object","type":"revalidate","title":"First","status":"active","attributes":{},"notes":null,"tags":[]},{"id":"10000000-0000-0000-0000-000000000096","kind":"object","type":"asset","title":"Second","status":"active","attributes":{},"notes":null,"tags":[]}],"relations":[]}');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000091';
do $$ declare w uuid:=current_setting('test.w')::uuid; a jsonb; begin
 a:=public.import_preview(w,'30000000-0000-0000-0000-000000000095');
 if (a->>'validRows')::int<>2 then raise exception 'initial preview invalid'; end if;
 perform public.template_upsert(w,'object','revalidate','[{"name":"required_new","dataType":"text","required":true}]',1);
 begin perform public.import_commit(w,'30000000-0000-0000-0000-000000000095'); raise exception 'stale preview committed'; exception when raise_exception then if sqlerrm<>'IMPORT_VALIDATION_FAILED' then raise; end if; end;
 if exists(select 1 from public.entity where workspace_id=w and id in ('10000000-0000-0000-0000-000000000095','10000000-0000-0000-0000-000000000096')) or (select count(*) from public.audit_log where workspace_id=w and source='import')<>3 then raise exception 'failed import left partial writes'; end if;
 raise notice 'PASS: changed ontology invalidates preview and atomic commit rolls back all rows and audit';
 begin perform public.exchange_cleanup_candidates(); raise exception 'cleanup exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare a jsonb; begin
 a:=public.exchange_cleanup_candidates();
 if jsonb_array_length(a)<>1 or a#>>'{0,id}'<>'30000000-0000-0000-0000-000000000093' then raise exception 'cleanup scope incorrect'; end if;
 perform public.exchange_cleanup_finish('30000000-0000-0000-0000-000000000093');
 perform public.exchange_cleanup_finish('30000000-0000-0000-0000-000000000095');
 if jsonb_array_length(public.exchange_cleanup_candidates())<>0 then raise exception 'cleanup finish failed'; end if;
 raise notice 'PASS: cleanup service only, candidates expired, live jobs retained';
end $$;
reset role;
do $$ begin
 if not exists(select 1 from private.import_job where id='30000000-0000-0000-0000-000000000095') then raise exception 'unexpired job deleted'; end if;
end $$;
rollback;
