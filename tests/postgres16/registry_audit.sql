\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000101'),('00000000-0000-0000-0000-000000000102'),('00000000-0000-0000-0000-000000000103');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select (public.workspace_create('Audit test','audit-test')).id as w \gset
select (public.template_upsert(:'w','agent','assistant','[]')).version;
select (public.entity_create(:'w','{"kind":"agent","type":"assistant","title":"A"}')).id as e \gset
select (public.entity_update(:'w',:'e',1,'{"title":"B"}')).version;
select (public.saved_view_create(:'w','Private','personal','agent','{}')).id as v \gset
select set_config('test.w',:'w',true),set_config('test.e',:'e',true),set_config('test.v',:'v',true) \gset
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values (:'w','00000000-0000-0000-0000-000000000102','viewer');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
do $$ declare w uuid:=current_setting('test.w')::uuid; e uuid:=current_setting('test.e')::uuid; a jsonb; b jsonb; c text; begin
 a:=public.audit_for_entity(w,e,1); c:=a->>'nextCursor';
 b:=public.audit_for_entity(w,e,1,c);
 if jsonb_array_length(a->'items')<>1 or c is null or jsonb_array_length(b->'items')<>1 or b#>>'{items,0,id}'=a#>>'{items,0,id}' or b->>'nextCursor' is not null then raise exception 'entity history pagination failed'; end if;
 raise notice 'PASS: stable paginated entity history';
 begin perform public.audit_for_entity(w,e,1,c||'a'); raise exception 'tampered cursor accepted'; exception when raise_exception then if sqlerrm<>'VALIDATION_ERROR: cursor' then raise; end if; end;
 begin perform public.audit_recent(w,jsonb_build_object('cursor',c)); raise exception 'mismatched cursor accepted'; exception when raise_exception then if sqlerrm<>'VALIDATION_ERROR: cursor' then raise; end if; end;
 raise notice 'PASS: tampered and mismatched audit cursors rejected';
 a:=public.audit_recent(w,'{"actionPrefix":"entity.","actorUserId":"00000000-0000-0000-0000-000000000101"}');
 if jsonb_array_length(a->'items')<>2 then raise exception 'admin filter failed'; end if;
 raise notice 'PASS: administrative audit filters';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
do $$ declare w uuid:=current_setting('test.w')::uuid; a jsonb; begin
 a:=public.audit_recent(w);
 if exists(select 1 from jsonb_array_elements(a->'items') x where x->>'target_id'=current_setting('test.v')) then raise exception 'private audit exposed'; end if;
 begin perform public.audit_recent(w,'{"source":"rpc"}'); raise exception 'viewer administrative filter accepted'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: viewer audit access preserves private view and administrative boundaries';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000103';
do $$ begin
 begin perform public.audit_recent(current_setting('test.w')::uuid); raise exception 'foreign audit exposed'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: foreign workspace audit denied';
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.audit_recent(current_setting('test.w')::uuid); raise exception 'anonymous audit exposed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: anonymous audit denied';
end $$;
reset role;
rollback;
