-- Registry dashboard, bulk operations and saved views. Reuse existing validation,
-- workspace locks, version checks and audit routines; no execution data here.
create function public.dashboard_summary(p_workspace_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 return jsonb_build_object(
 'countsByKind',(select jsonb_object_agg(k::text,(select count(*) from public.entity e where e.workspace_id=p_workspace_id and e.kind=k and e.status<>'archived')) from unnest(enum_range(null::public.entity_kind)) k),
 'orphanCountsByKind',(select jsonb_object_agg(k::text,(select count(*) from public.entity e where e.workspace_id=p_workspace_id and e.kind=k and e.status<>'archived' and not exists(select 1 from public.relation r where r.workspace_id=e.workspace_id and (r.from_id=e.id or r.to_id=e.id)))) from unnest(enum_range(null::public.entity_kind)) k),
 'recentActivity',(select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc,a.id desc),'[]') from (select * from public.audit_log where workspace_id=p_workspace_id and (outcome='success' or source='mcp') order by at desc,id desc limit 20) a),
 'staleProcessKinds',(select coalesce(jsonb_agg(to_jsonb(e)-'search_vector' order by e.updated_at,e.id),'[]') from (select e.* from public.entity e join public.workspace w on w.id=e.workspace_id where w.id=p_workspace_id and e.kind='process_kind' and e.status='active' and e.updated_at<now()-make_interval(days=>w.stale_process_kind_days) order by e.updated_at,e.id limit 20) e),
 'staleProcessKindDays',(select stale_process_kind_days from public.workspace where id=p_workspace_id));
end $$;
create function private.validate_bulk_items(items jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'VALIDATION_ERROR: items'; end if;
 if jsonb_array_length(items) not between 1 and 100 then raise exception 'VALIDATION_ERROR: items limit'; end if;
 if exists(select 1 from jsonb_array_elements(items) i where not private.object_keys_allowed(i,array['id','expectedVersion']) or jsonb_typeof(i->'id') is distinct from 'string' or coalesce(i->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(i->'expectedVersion') is distinct from 'number' or coalesce(i->>'expectedVersion','') !~ '^[1-9][0-9]{0,9}$') then raise exception 'VALIDATION_ERROR: invalid bulk item'; end if;
 if exists(select 1 from jsonb_array_elements(items) i where (i->>'expectedVersion')::numeric>2147483647) or (select count(distinct (i->>'id')::uuid) from jsonb_array_elements(items) i)<>jsonb_array_length(items) then raise exception 'VALIDATION_ERROR: duplicate or invalid item'; end if;
end $$;
create function public.entity_bulk_tags(p_workspace_id uuid,p_items jsonb,p_mode text,p_tags jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); item record; before_row public.entity; after_row public.entity; tags_new text[]; input_tags text[]; result jsonb:='[]';
begin
 perform private.validate_bulk_items(p_items);
 if coalesce(p_mode,'') not in ('add','remove','replace') then raise exception 'VALIDATION_ERROR: mode'; end if;
 input_tags:=private.normalize_tags(p_tags);
 for item in select (i->>'id')::uuid as id,(i->>'expectedVersion')::int as v from jsonb_array_elements(p_items) i order by 1 loop
  select * into before_row from public.entity where workspace_id=p_workspace_id and id=item.id for update;
  if not found then raise exception 'NOT_FOUND: %',item.id; end if;
  if before_row.version<>item.v then raise exception 'VERSION_CONFLICT: %',item.id; end if;
  if before_row.status='archived' then raise exception 'ARCHIVED_ENTITY: %',item.id; end if;
  tags_new:=case p_mode when 'add' then array(select distinct t from unnest(before_row.tags||input_tags) t order by t) when 'remove' then array(select t from unnest(before_row.tags) t where not(t=any(input_tags)) order by t) else input_tags end;
  after_row:=public.entity_update(p_workspace_id,item.id,item.v,jsonb_build_object('tags',tags_new));
  result:=result||jsonb_build_array(to_jsonb(after_row)-'search_vector');
 end loop;
 return jsonb_build_object('updated',result);
end $$;
create function public.entity_bulk_archive(p_workspace_id uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); item record; before_row public.entity; after_row public.entity; result jsonb:='[]';
begin
 perform private.validate_bulk_items(p_items);
 for item in select (i->>'id')::uuid as id,(i->>'expectedVersion')::int as v from jsonb_array_elements(p_items) i order by 1 loop
  select * into before_row from public.entity where workspace_id=p_workspace_id and id=item.id for update;
  if not found then raise exception 'NOT_FOUND: %',item.id; end if;
  if before_row.version<>item.v then raise exception 'VERSION_CONFLICT: %',item.id; end if;
  if before_row.status='archived' then raise exception 'ARCHIVED_ENTITY: %',item.id; end if;
  after_row:=public.entity_archive(p_workspace_id,item.id,item.v);
  result:=result||jsonb_build_array(to_jsonb(after_row)-'search_vector');
 end loop;
 return jsonb_build_object('updated',result);
end $$;
create table public.saved_view (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id),
 owner_user_id uuid not null references auth.users(id), name text not null check(length(btrim(name)) between 1 and 300),
 visibility text not null check(visibility in ('personal','workspace')), kind public.entity_kind,
 query jsonb not null check(jsonb_typeof(query)='object' and not(query?'cursor')),
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index saved_view_lookup on public.saved_view(workspace_id,owner_user_id,visibility,kind);
alter table public.saved_view enable row level security;
revoke all on public.saved_view from public,anon,authenticated,service_role;
grant select on public.saved_view to authenticated;
create policy saved_view_read on public.saved_view for select to authenticated using(private.is_member(workspace_id) and (visibility='workspace' or owner_user_id=(select auth.uid())));
-- Query validation delegates to the existing search RPC. Stored queries may not
-- carry expiring cursors or select another workspace, and explicit kind must agree.
create function private.validate_view_query(w uuid,k public.entity_kind,q jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(q) is distinct from 'object' or q?'cursor' or (k is not null and q?'kind' and q->>'kind' is distinct from k::text) then raise exception 'VALIDATION_ERROR: view query'; end if;
 if k is not null then q:=q||jsonb_build_object('kind',k); end if;
 perform public.entity_search(w,q||jsonb_build_object('limit',1));
 -- Validate the saved limit too, not just the small test page.
 if q?'limit' and (jsonb_typeof(q->'limit') is distinct from 'number' or q->>'limit' !~ '^[0-9]{1,3}$' or (q->>'limit')::int not between 1 and 100) then raise exception 'VALIDATION_ERROR: limit'; end if;
 return q;
end $$;
create function public.saved_view_create(p_workspace_id uuid,p_name text,p_visibility text,p_kind public.entity_kind,p_query jsonb) returns public.saved_view
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); a public.saved_view;
begin
 insert into public.saved_view(workspace_id,owner_user_id,name,visibility,kind,query) values(p_workspace_id,u,btrim(p_name),p_visibility,p_kind,private.validate_view_query(p_workspace_id,p_kind,p_query)) returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'saved_view.create','saved_view',a.id,null,to_jsonb(a)-'query'); return a;
end $$;
create function public.saved_view_update(p_workspace_id uuid,p_id uuid,p_expected_version int,p_patch jsonb) returns public.saved_view
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); b public.saved_view; a public.saved_view;
begin
 if not private.object_keys_allowed(p_patch,array['name','visibility','query']) or (p_patch?'name' and jsonb_typeof(p_patch->'name') is distinct from 'string') or (p_patch?'visibility' and jsonb_typeof(p_patch->'visibility') is distinct from 'string') then raise exception 'VALIDATION_ERROR: view patch'; end if;
 select * into b from public.saved_view where workspace_id=p_workspace_id and id=p_id and (owner_user_id=u or (visibility='workspace' and private.can_admin(p_workspace_id))) for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 -- Only the owner may convert a shared view into a personal view.
 if b.owner_user_id<>u and p_patch->>'visibility'='personal' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.saved_view set name=coalesce(btrim(p_patch->>'name'),b.name),visibility=coalesce(p_patch->>'visibility',b.visibility),query=private.validate_view_query(p_workspace_id,b.kind,coalesce(p_patch->'query',b.query)),version=b.version+1,updated_at=now() where id=b.id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'saved_view.update','saved_view',a.id,to_jsonb(b)-'query',to_jsonb(a)-'query'); return a;
end $$;
create function public.saved_view_delete(p_workspace_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); b public.saved_view;
begin
 delete from public.saved_view where workspace_id=p_workspace_id and id=p_id and (owner_user_id=u or (visibility='workspace' and private.can_admin(p_workspace_id))) returning * into b;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform private.audit_mutation(p_workspace_id,u,'saved_view.delete','saved_view',b.id,to_jsonb(b)-'query',null);
end $$;
revoke all on function private.validate_bulk_items(jsonb),private.validate_view_query(uuid,public.entity_kind,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dashboard_summary(uuid),public.entity_bulk_tags(uuid,jsonb,text,jsonb),public.entity_bulk_archive(uuid,jsonb),public.saved_view_create(uuid,text,text,public.entity_kind,jsonb),public.saved_view_update(uuid,uuid,int,jsonb),public.saved_view_delete(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.dashboard_summary(uuid),public.entity_bulk_tags(uuid,jsonb,text,jsonb),public.entity_bulk_archive(uuid,jsonb),public.saved_view_create(uuid,text,text,public.entity_kind,jsonb),public.saved_view_update(uuid,uuid,int,jsonb),public.saved_view_delete(uuid,uuid) to authenticated;
-- Audit snapshots must not reveal personal saved views to other workspace members.
drop policy member_read on public.audit_log;
create policy member_read on public.audit_log for select to authenticated using (
 private.is_member(workspace_id) and (target_type is distinct from 'saved_view' or effective_user_id=(select auth.uid()) or (coalesce(before->>'visibility','')<>'personal' and coalesce(after->>'visibility','')<>'personal'))
);
