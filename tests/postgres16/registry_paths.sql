\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000081'),('00000000-0000-0000-0000-000000000082');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000081';
select (public.workspace_create('Path test','path-test')).id as w \gset
select set_config('test.w',:'w',true);
do $$ declare w uuid:=current_setting('test.w')::uuid; a public.entity; b public.entity; c public.entity; d public.entity; x jsonb; begin
 perform public.template_upsert(w,'person','employee','[]');
 perform public.template_upsert(w,'object','asset','[]');
 perform public.template_upsert(w,'process_kind','standard','[]');
 a:=public.entity_create(w,'{"kind":"process_kind","type":"standard","title":"Standard"}');
 b:=public.entity_create(w,'{"kind":"object","type":"asset","title":"Asset"}');
 c:=public.entity_create(w,'{"kind":"person","type":"employee","title":"Owner"}');
 d:=public.entity_create(w,'{"kind":"person","type":"employee","title":"Second owner"}');
 perform set_config('test.start',a.id::text,true);
 perform public.predicate_upsert(w,'requires',array['process_kind']::public.entity_kind[],array['object']::public.entity_kind[],true,'Requires');
 perform public.predicate_upsert(w,'owns',array['person']::public.entity_kind[],array['object']::public.entity_kind[],true,'Owns');
 perform public.predicate_upsert(w,'manages',array['person']::public.entity_kind[],array['person']::public.entity_kind[],false,'Manages');
 perform public.relation_create(w,a.id,b.id,'requires');
 perform public.relation_create(w,c.id,b.id,'owns'); perform public.relation_create(w,d.id,b.id,'owns');
 perform public.relation_create(w,c.id,d.id,'manages');
 x:=public.registry_path_report(w,a.id,'[{"predicate":"requires","direction":"outgoing"},{"predicate":"owns","direction":"incoming"}]');
 if jsonb_array_length(x)<>2 or x#>>'{0,entities,0,id}'<>a.id::text or x#>>'{0,entities,1,id}'<>b.id::text or x#>>'{0,relations,1,predicate}'<>'owns' then raise exception 'incorrect ordered path'; end if;
 raise notice 'PASS: ordered paths preserve entity and relation sequence';
 x:=public.registry_path_report(w,a.id,'[{"predicate":"requires","direction":"outgoing"},{"predicate":"owns","direction":"incoming"}]',1);
 if jsonb_array_length(x)<>1 then raise exception 'cap failed'; end if;
 raise notice 'PASS: path result cap';
 x:=public.registry_path_report(w,d.id,'[{"predicate":"manages","direction":"outgoing"}]');
 if x#>>'{0,entities,1,id}'<>c.id::text then raise exception 'undirected path failed'; end if;
 raise notice 'PASS: undirected paths follow either endpoint';
 begin perform public.registry_path_report(w,a.id,'[{"predicate":"missing","direction":"outgoing"}]'); raise exception 'missing predicate accepted'; exception when raise_exception then if sqlerrm<>'PATH_NOT_CONFIGURED' then raise; end if; end;
 begin perform public.registry_path_report(w,a.id,'[{"predicate":"requires","direction":"incoming"}]'); raise exception 'illegal direction accepted'; exception when raise_exception then if sqlerrm<>'PATH_NOT_CONFIGURED' then raise; end if; end;
 begin perform public.registry_path_report(w,a.id,'[]'); raise exception 'empty path accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; end;
 raise notice 'PASS: absent predicates, incompatible kinds and invalid bounds rejected';
 perform public.entity_archive(w,c.id,1);
 x:=public.registry_path_report(w,a.id,'[{"predicate":"requires","direction":"outgoing"},{"predicate":"owns","direction":"incoming"}]');
 if jsonb_array_length(x)<>1 or x#>>'{0,entities,2,id}'<>d.id::text then raise exception 'archive filtering failed'; end if;
 raise notice 'PASS: archived adjacent entity omitted';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000082';
do $$ begin
 begin perform public.registry_path_report(current_setting('test.w')::uuid,current_setting('test.start')::uuid,'[{"predicate":"requires","direction":"outgoing"}]'); raise exception 'foreign path accepted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: foreign workspace path rejected';
end $$;
reset role;
rollback;
