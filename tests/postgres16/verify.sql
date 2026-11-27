\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select (public.workspace_create('Workspace A','workspace-a')).id as a \gset
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select (public.workspace_create('Workspace B','workspace-b')).id as b \gset
reset role;
insert into public.type_templates(workspace_id,kind,type,updated_by) values
 (:'a','person','employee','00000000-0000-0000-0000-000000000001'),(:'a','app','api','00000000-0000-0000-0000-000000000001'),(:'b','agent','assistant','00000000-0000-0000-0000-000000000002');
insert into public.entity(id,workspace_id,kind,type,title,created_by,updated_by) values
 ('10000000-0000-0000-0000-000000000001',:'a','person','employee','Alice','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002',:'a','app','api','App A','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003',:'b','agent','assistant','Agent B','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
insert into public.predicate_registry(workspace_id,name,from_kinds,to_kinds,description,created_by,updated_by) values(:'a','uses',array['person']::public.entity_kind[],array['app']::public.entity_kind[],'uses','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into public.relation(workspace_id,from_id,to_id,predicate,created_by,updated_by) values(:'a','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','uses','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
set constraints all immediate;
-- Database structural violations must fail, even under a privileged test fixture actor.
do $$ declare w uuid; u uuid:='00000000-0000-0000-0000-000000000001'; a uuid:='10000000-0000-0000-0000-000000000001'; b uuid:='10000000-0000-0000-0000-000000000002'; c uuid:='10000000-0000-0000-0000-000000000003'; begin
 select id into w from public.workspace where slug='workspace-a';
 begin insert into public.relation(workspace_id,from_id,to_id,predicate,created_by,updated_by) values(w,a,c,'uses',u,u); raise exception 'cross-workspace edge accepted'; exception when foreign_key_violation then raise notice 'PASS: cross-workspace endpoint'; end;
 begin insert into public.relation(workspace_id,from_id,to_id,predicate,created_by,updated_by) values(w,a,b,'uses',u,u); raise exception 'duplicate edge accepted'; exception when unique_violation then raise notice 'PASS: duplicate edge'; end;
 begin insert into public.relation(workspace_id,from_id,to_id,predicate,created_by,updated_by) values(w,a,a,'uses',u,u); raise exception 'self edge accepted'; exception when check_violation then raise notice 'PASS: self edge'; end;
 begin update public.relation set valid_from='2026-01-02',valid_to='2026-01-01' where workspace_id=w; raise exception 'invalid interval accepted'; exception when check_violation then raise notice 'PASS: invalid interval'; end;
 begin update public.entity set kind='app',version=version+1 where id=a; raise exception 'kind change accepted'; exception when raise_exception then if sqlerrm<>'ENTITY_IDENTITY_IMMUTABLE' then raise; end if; raise notice 'PASS: immutable kind'; end;
 begin update public.entity set title='No version bump' where id=a; raise exception 'unversioned update accepted'; exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; raise notice 'PASS: version increment'; end;
 begin delete from public.workspace_member where workspace_id=w and role='owner'; raise exception 'owner removal accepted'; exception when raise_exception then if sqlerrm<>'LAST_OWNER' then raise; end if; raise notice 'PASS: sole owner protected'; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
 if (select count(*) from public.workspace)<>1 or (select count(*) from public.entity)<>2 or (select count(*) from public.agents)<>0 or (select count(*) from public.apps)<>1 or (select count(*) from public.audit_log)<>1 then raise exception 'workspace isolation failed'; end if;
 raise notice 'PASS: workspace A RLS, invoker views and own bootstrap audit';
 begin update public.entity set title='Bypass'; raise exception 'DML accepted'; exception when insufficient_privilege then raise notice 'PASS: authenticated direct update denied'; end;
 begin delete from public.audit_log; raise exception 'audit delete accepted'; exception when insufficient_privilege then raise notice 'PASS: audit deletion denied'; end;
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
 if (select count(*) from public.entity)<>1 or (select count(*) from public.people)<>0 or (select count(*) from public.relation)<>0 then raise exception 'workspace B isolation failed'; end if;
 raise notice 'PASS: workspace B RLS and edge isolation';
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform count(*) from public.entity; raise exception 'anon read accepted'; exception when insufficient_privilege then raise notice 'PASS: anonymous read denied'; end;
 begin perform public.workspace_create('Bad','bad'); raise exception 'anon bootstrap accepted'; exception when insufficient_privilege then raise notice 'PASS: anonymous RPC denied'; end;
end $$;
reset role;
rollback;
