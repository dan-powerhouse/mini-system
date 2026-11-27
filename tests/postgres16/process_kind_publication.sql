\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000111'),('00000000-0000-0000-0000-000000000112'),('00000000-0000-0000-0000-000000000113');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000111';
select (public.workspace_create('Publication test','publication-test')).id as w \gset
select (public.template_upsert(:'w','process_kind','review','[]')).version;
select (public.template_upsert(:'w','person','employee','[]')).version;
select (public.entity_create(:'w','{"kind":"process_kind","type":"review","title":"Review"}')).id as k \gset
select (public.entity_create(:'w','{"kind":"person","type":"employee","title":"Requester"}')).id as p \gset
select set_config('test.w',:'w',true),set_config('test.k',:'k',true),set_config('test.p',:'p',true) \gset
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values (:'w','00000000-0000-0000-0000-000000000112','editor');
set local role service_role;
do $$ declare w uuid:=current_setting('test.w')::uuid; k uuid:=current_setting('test.k')::uuid;
u uuid:='00000000-0000-0000-0000-000000000111'; upload uuid:='10000000-0000-0000-0000-000000000111'; v public.process_kind_version;
begin
 v:=public.process_kind_publish(w,u,k,1,0,upload,repeat('a',64),'{"title":"Review"}');
 if v.version<>1 or v.package_path<>w::text||'/'||k::text||'/'||upload::text||'.zip' then raise exception 'bad publication'; end if;
 raise notice 'PASS: version allocated atomically and path server-derived';
 v:=public.process_kind_publish(w,u,k,1,0,upload,repeat('a',64),'{"title":"Review"}');
 if v.version<>1 then raise exception 'duplicate publication'; end if;
 begin perform public.process_kind_publish(w,u,k,1,0,upload,repeat('b',64),'{}'); raise exception 'expected conflict'; exception when raise_exception then if sqlerrm<>'PUBLICATION_CONFLICT' then raise; end if; end;
 raise notice 'PASS: publication replay is idempotent; altered replay rejected';
 begin perform public.process_kind_publish(w,u,k,1,0,gen_random_uuid(),repeat('c',64),'{}'); raise exception 'expected stale conflict'; exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
 begin perform public.process_kind_publish(w,u,k,2,1,gen_random_uuid(),repeat('c',64),'{}'); raise exception 'expected draft conflict'; exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
 raise notice 'PASS: stale entity and publication revisions rejected';
 begin perform public.process_kind_publish(w,'00000000-0000-0000-0000-000000000112',k,1,1,gen_random_uuid(),repeat('c',64),'{}'); raise exception 'editor allowed'; exception when insufficient_privilege then null; end;
 begin perform public.process_kind_publish(w,'00000000-0000-0000-0000-000000000113',k,1,1,gen_random_uuid(),repeat('c',64),'{}'); raise exception 'foreign actor allowed'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform public.process_kind_publish(w,u,current_setting('test.p')::uuid,1,0,gen_random_uuid(),repeat('c',64),'{}'); raise exception 'person published'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: editor, foreign actor and non-Process Kind rejected';
 begin perform public.process_kind_publish(w,u,k,1,1,gen_random_uuid(),'bad','{}'); raise exception 'invalid digest'; exception when raise_exception then if sqlerrm<>'VALIDATION_ERROR: publication' then raise; end if; end;
end $$;
reset role;
insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,idempotency_key) values(:'w',:'k',1,:'p','person','publication-test');
set local role service_role;
do $$ declare w uuid:=current_setting('test.w')::uuid; k uuid:=current_setting('test.k')::uuid;
u uuid:='00000000-0000-0000-0000-000000000111'; a jsonb; v public.process_kind_version;
begin
 v:=public.process_kind_publish(w,u,k,1,1,gen_random_uuid(),repeat('b',64),'{}');
 if v.version<>2 then raise exception 'expected second version'; end if;
 a:=public.process_kind_publications(w,u,k,null,1);
 if jsonb_array_length(a)<>1 or a#>>'{0,version}'<>'2' or (a->0)?'package_path' then raise exception 'bad publication page'; end if;
 if public.process_kind_publications(w,u,k,2,1)#>>'{0,version}'<>'1' then raise exception 'bad next page'; end if;
 raise notice 'PASS: second publication and bounded metadata pages';
end $$;
reset role;
do $$ declare w uuid:=current_setting('test.w')::uuid; k uuid:=current_setting('test.k')::uuid; begin
 if (select count(*) from public.audit_log where workspace_id=w and action='process_kind.publish')<>2 then raise exception 'publication audit count'; end if;
 if not exists(select 1 from public.process p join public.process_kind_version v on (p.workspace_id,p.process_kind_id,p.process_kind_version)=(v.workspace_id,v.process_kind_id,v.version) where p.workspace_id=w and v.package_sha256=repeat('a',64)) then raise exception 'execution repinned'; end if;
 if (select version from public.entity where id=k)<>1 then raise exception 'registry draft changed'; end if;
 raise notice 'PASS: atomic audit, old execution pin and unchanged draft version';
end $$;
set local role authenticated;
do $$ begin
 begin perform public.process_kind_publish(current_setting('test.w')::uuid,auth.uid(),current_setting('test.k')::uuid,1,2,gen_random_uuid(),repeat('a',64),'{}'); raise exception 'client publish allowed'; exception when insufficient_privilege then null; end;
 begin perform public.process_kind_publications(current_setting('test.w')::uuid,auth.uid(),current_setting('test.k')::uuid); raise exception 'client listing allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: direct clients cannot forge publication or list privileged metadata';
end $$;
reset role;
rollback;
