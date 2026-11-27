\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000012'),('00000000-0000-0000-0000-000000000013'),('00000000-0000-0000-0000-000000000014');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
select (public.workspace_create('A','rpc-a')).id as a \gset
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000014';
select (public.workspace_create('B','rpc-b')).id as b \gset
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values (:'a','00000000-0000-0000-0000-000000000012','editor'),(:'a','00000000-0000-0000-0000-000000000013','viewer');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
select (public.template_upsert(:'a','agent','assistant','[{"name":"provider","dataType":"text","required":true},{"name":"tier","dataType":"select","options":["local","cloud"],"default":"cloud"},{"name":"started","dataType":"date"}]')).version;
select (public.template_upsert(:'a','app','api','[]')).version;
select (public.entity_create(:'a','{"kind":"app","type":"api","title":"Test App"}')).id;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000012';
do $$ declare w uuid; e public.entity; before_count int; begin
 select id into w from public.workspace where slug='rpc-a';
 if (select count(*) from public.workspace_member)<>1 then raise exception 'membership disclosure'; end if;
 raise notice 'PASS: editor sees only own membership';
 begin perform public.template_upsert(w,'agent','forbidden','[]'); raise exception 'editor template accepted'; exception when insufficient_privilege then raise notice 'PASS: editor cannot change ontology'; end;
 e:=public.entity_create(w,'{"kind":"agent","type":"assistant","title":"  Test Agent  ","attributes":{"provider":"Example"},"tags":[" A ","a","B"]}');
 if e.version<>1 or e.title<>'Test Agent' or e.attributes->>'tier'<>'cloud' or e.tags<>array['a','b'] then raise exception 'bad create defaults'; end if;
 raise notice 'PASS: entity create validates and applies defaults/tags';
 select count(*) into before_count from public.audit_log;
 begin perform public.entity_create(w,'{"kind":"agent","type":"assistant","title":"Missing"}'); raise exception 'missing field accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; raise notice 'PASS: missing required field rejected'; end;
 begin perform public.entity_create(w,'{"kind":"agent","type":"assistant","title":"Bad","attributes":{"provider":"X","unknown":1}}'); raise exception 'unknown accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; raise notice 'PASS: unknown attribute rejected'; end;
 begin perform public.entity_create(w,'{"kind":"agent","type":"assistant","title":"Bad date","attributes":{"provider":"X","started":"2026-02-30"}}'); raise exception 'bad date accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; raise notice 'PASS: invalid calendar date rejected'; end;
 begin perform public.entity_update(w,e.id,0,'{"title":"stale"}'); raise exception 'stale accepted'; exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; raise notice 'PASS: stale update rejected'; end;
 if (select count(*) from public.audit_log)<>before_count then raise exception 'failed mutation created success audit'; end if;
 raise notice 'PASS: failures leave mutation audit unchanged';
 e:=public.entity_update(w,e.id,1,'{"title":"Updated"}');
 if e.version<>2 or e.title<>'Updated' or e.attributes->>'provider'<>'Example' then raise exception 'bad update'; end if;
 raise notice 'PASS: patch preserves fields and increments version';
 e:=public.entity_archive(w,e.id,2);
 if e.status<>'archived' or e.version<>3 then raise exception 'bad archive'; end if;
 raise notice 'PASS: soft archive';
 begin perform public.entity_update(w,e.id,3,'{"title":"revive"}'); raise exception 'archive editable'; exception when raise_exception then if sqlerrm<>'ARCHIVED_ENTITY' then raise; end if; raise notice 'PASS: archived edit rejected'; end;
 if (select count(*) from public.audit_log where target_id=e.id and outcome='success')<>3 then raise exception 'audit mismatch'; end if;
 raise notice 'PASS: three successful mutations, three audit events';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000013';
do $$ declare w uuid; begin
 select id into w from public.workspace where slug='rpc-a';
 begin perform public.entity_create(w,'{"kind":"app","type":"api","title":"Forbidden"}'); raise exception 'viewer write accepted'; exception when insufficient_privilege then raise notice 'PASS: viewer cannot create'; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
do $$ declare w uuid; begin
 select id into w from public.workspace where slug='rpc-a';
 if (select count(*) from public.workspace_member)<>3 then raise exception 'owner member access failed'; end if;
 raise notice 'PASS: owner sees workspace members';
 begin perform public.template_upsert(w,'agent','assistant','[{"name":"new_required","dataType":"text","required":true}]',1); raise exception 'invalid template accepted'; exception when raise_exception then if sqlerrm not like 'CONFLICT:%' then raise; end if; raise notice 'PASS: template change rejects existing invalidation'; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000014';
do $$ declare w uuid; begin
 select id into w from public.workspace where slug='rpc-b';
 if (select count(*) from public.entity)<>0 then raise exception 'workspace B read leak'; end if;
 begin perform public.entity_update(w,'10000000-0000-0000-0000-000000000001',1,'{}'); raise exception 'unknown entity update accepted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; raise notice 'PASS: out-of-scope lookup returns NOT_FOUND'; end;
end $$;
reset role;
rollback;
