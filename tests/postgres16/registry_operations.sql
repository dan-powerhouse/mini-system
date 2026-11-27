\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000061'),('00000000-0000-0000-0000-000000000062');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000061';
select (public.workspace_create('Operations','operations')).id as w \gset
select (public.template_upsert(:'w','agent','assistant','[]')).version;
select (public.entity_create(:'w','{"kind":"agent","type":"assistant","title":"A"}')).id as a \gset
select (public.entity_create(:'w','{"kind":"agent","type":"assistant","title":"B"}')).id as b \gset
select (public.saved_view_create(:'w','My view','personal','agent','{}')).id as pv \gset
select (public.saved_view_create(:'w','Shared view','workspace','agent','{}')).id as sv \gset
select set_config('test.w',:'w',true),set_config('test.a',:'a',true),set_config('test.b',:'b',true),set_config('test.pv',:'pv',true) \gset
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values (:'w','00000000-0000-0000-0000-000000000062','viewer');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000061';
do $$ declare w uuid:=current_setting('test.w')::uuid; a uuid:=current_setting('test.a')::uuid; b uuid:=current_setting('test.b')::uuid; res jsonb; items jsonb; begin
 res:=public.dashboard_summary(w); if res#>>'{countsByKind,agent}'<>'2' or res#>>'{orphanCountsByKind,agent}'<>'2' or res#>>'{countsByKind,process_kind}'<>'0' then raise exception 'dashboard mismatch'; end if;
 raise notice 'PASS: dashboard counts five Registry kinds and orphans';
 items:=jsonb_build_array(jsonb_build_object('id',a,'expectedVersion',1),jsonb_build_object('id',b,'expectedVersion',2));
 begin perform public.entity_bulk_tags(w,items,'add','["demo"]'); raise exception 'stale bulk accepted'; exception when raise_exception then if sqlerrm not like 'VERSION_CONFLICT:%' then raise; end if; end;
 if exists(select 1 from public.entity where workspace_id=w and version<>1) then raise exception 'bulk partial write'; end if;
 raise notice 'PASS: stale bulk item rolls back entire operation';
 items:=jsonb_build_array(jsonb_build_object('id',a,'expectedVersion',1),jsonb_build_object('id',b,'expectedVersion',1));
 res:=public.entity_bulk_tags(w,items,'add','["DEMO"]'); if jsonb_array_length(res->'updated')<>2 or (select count(*) from public.entity where workspace_id=w and version=2 and tags=array['demo'])<>2 then raise exception 'bulk tags failed'; end if;
 raise notice 'PASS: bulk tags reuse normalization and versioned writes';
 perform public.entity_bulk_archive(w,jsonb_build_array(jsonb_build_object('id',a,'expectedVersion',2)));
 if (public.dashboard_summary(w)#>>'{countsByKind,agent}')<>'1' then raise exception 'archive counted'; end if;
 raise notice 'PASS: bulk archive excludes record from dashboard';
 if (select query->>'kind' from public.saved_view where id=current_setting('test.pv')::uuid)<>'agent' then raise exception 'view kind mismatch'; end if;
 begin perform public.saved_view_create(w,'Invalid','personal','agent','{"kind":"object"}'); raise exception 'invalid view accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; end;
 raise notice 'PASS: saved query constrained to Registry kind';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000062';
do $$ declare w uuid:=current_setting('test.w')::uuid; begin
 if (select count(*) from public.saved_view where workspace_id=w)<>1 then raise exception 'personal view exposed'; end if;
 if exists(select 1 from public.audit_log where workspace_id=w and target_id=current_setting('test.pv')::uuid) then raise exception 'personal view audit exposed'; end if;
 begin perform public.entity_bulk_archive(w,'[]'); raise exception 'viewer wrote'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: personal view private and viewer bulk write denied';
end $$;
reset role;
rollback;
