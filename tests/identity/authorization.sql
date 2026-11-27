-- Run only after supabase/migrations/20261124205909_identity_provider.sql in a disposable database.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000141','owner@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000142','viewer@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000143','foreign@example.invalid',now());
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000141';
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000141","role":"authenticated"}';
select (public.workspace_create('Identity boundary','identity-boundary')).id as w \gset
select (public.template_upsert(:'w','person','human','[]')).version;
select (public.template_upsert(:'w','app','client','[]')).version;
select (public.entity_create(:'w','{"kind":"person","type":"human","title":"Owner"}')).id as person \gset
select (public.entity_create(:'w','{"kind":"app","type":"client","title":"App"}')).id as app \gset
select set_config('test.w',:'w',true),set_config('test.person',:'person',true),set_config('test.app',:'app',true) \gset
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values(:'w','00000000-0000-0000-0000-000000000142','viewer');
set local role authenticated;
do $$ declare w uuid:=current_setting('test.w')::uuid; p uuid:=current_setting('test.person')::uuid; a jsonb; b jsonb; begin
 if not public.registry_direct_session() or (select count(*) from public.entity where workspace_id=w)<>2 then raise exception 'direct session broken'; end if;
 a:=public.identity_link_person(w,auth.uid(),p);
 b:=public.identity_link_person(w,auth.uid(),p);
 if a<>b or public.identity_current_person(w)->>'personId'<>p::text then raise exception 'link mismatch'; end if;
 perform set_config('test.link',a->>'id',true);
 raise notice 'PASS: existing direct session and idempotent verified Person link';
 begin perform public.identity_link_person(w,'00000000-0000-0000-0000-000000000142',p); raise exception 'duplicate person assigned'; exception when raise_exception then if sqlerrm<>'IDENTITY_LINK_CONFLICT' then raise; end if; end;
 begin perform public.identity_link_person(w,auth.uid(),current_setting('test.app')::uuid); raise exception 'app linked as person'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: duplicate or non-Person link rejected';
end $$;
-- Same owner, but a delegated OAuth token instead of a direct user session.
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000141","role":"authenticated","client_id":"00000000-0000-0000-0000-000000000144"}';
do $$ declare w uuid:=current_setting('test.w')::uuid; p uuid:=current_setting('test.person')::uuid; begin
 if public.registry_direct_session() or exists(select 1 from public.entity where workspace_id=w) or exists(select 1 from public.workspace_member where workspace_id=w) or exists(select 1 from public.people where workspace_id=w) or exists(select 1 from public.audit_log where workspace_id=w) then raise exception 'OAuth read leaked'; end if;
 begin perform public.entity_search(w,'{}'); raise exception 'OAuth search allowed'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform public.audit_recent(w); raise exception 'OAuth audit allowed'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform public.export_create(w); raise exception 'OAuth export allowed'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: OAuth token cannot read Registry tables, views, search, audit or export';
 begin perform public.entity_update(w,p,1,'{"title":"Denied"}'); raise exception 'OAuth write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.workspace_create('Denied','denied'); raise exception 'OAuth workspace create allowed'; exception when insufficient_privilege then null; end;
 begin perform public.member_accept_invitation('bad'); raise exception 'OAuth invitation accepted'; exception when insufficient_privilege then null; end;
 begin perform public.token_issue(w,auth.uid(),'Denied',array['read']); raise exception 'OAuth token minted'; exception when insufficient_privilege then null; end;
 begin perform public.identity_unlink_person(w,current_setting('test.link')::uuid); raise exception 'OAuth unlink allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: OAuth token cannot mutate, join, create workspace or mint machine token';
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000141","role":"authenticated","is_anonymous":true}';
do $$ begin if public.registry_direct_session() or exists(select 1 from public.workspace where id=current_setting('test.w')::uuid) then raise exception 'anonymous session allowed'; end if; raise notice 'PASS: anonymous Auth session cannot access Registry'; end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000142';
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000142","role":"authenticated"}';
do $$ begin
 if public.identity_current_person(current_setting('test.w')::uuid) is not null then raise exception 'another user link exposed'; end if;
 begin perform public.identity_unlink_person(current_setting('test.w')::uuid,current_setting('test.link')::uuid); raise exception 'viewer unlink allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: viewer cannot inspect another link or administer identities';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000141';
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000141","role":"authenticated"}';
do $$ declare w uuid:=current_setting('test.w')::uuid; a jsonb; begin
 a:=public.identity_unlink_person(w,current_setting('test.link')::uuid);
 if a->>'revoked_at' is null or public.identity_current_person(w) is not null then raise exception 'link revocation failed'; end if;
 if (select count(*) from public.audit_log where workspace_id=w and action in ('identity.link','identity.unlink'))<>2 then raise exception 'identity audit missing'; end if;
 raise notice 'PASS: link revocation retains auditable history';
end $$;
reset role;
rollback;
