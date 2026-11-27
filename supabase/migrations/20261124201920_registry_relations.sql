-- Registry relationship vocabulary and edge operations. Shared workspace write lock
-- serializes these operations with entity/template changes. No new services.
create function public.predicate_upsert(p_workspace_id uuid,p_name text,p_from_kinds public.entity_kind[],p_to_kinds public.entity_kind[],p_directed boolean,p_description text,p_symmetric_helper text default null,p_expected_version int default null)
returns public.predicate_registry language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b public.predicate_registry; a public.predicate_registry;
begin
 if p_name is null or p_name !~ '^[a-z][a-z0-9_]*$' or coalesce(cardinality(p_from_kinds),0)=0 or coalesce(cardinality(p_to_kinds),0)=0 or array_position(p_from_kinds,null) is not null or array_position(p_to_kinds,null) is not null or p_directed is null or p_description is null then raise exception 'VALIDATION_ERROR: predicate'; end if;
 if p_symmetric_helper is not null and (p_symmetric_helper=p_name or not exists(select 1 from public.predicate_registry where workspace_id=p_workspace_id and name=p_symmetric_helper)) then raise exception 'VALIDATION_ERROR: helper'; end if;
 select * into b from public.predicate_registry where workspace_id=p_workspace_id and name=p_name for update;
 if found then
  if b.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if exists(select 1 from public.relation r join public.entity f on (f.workspace_id,f.id)=(r.workspace_id,r.from_id) join public.entity t on (t.workspace_id,t.id)=(r.workspace_id,r.to_id) where r.workspace_id=p_workspace_id and r.predicate=p_name and (not(f.kind=any(p_from_kinds)) or not(t.kind=any(p_to_kinds)))) then raise exception 'CONFLICT: predicate would invalidate existing relation'; end if;
  update public.predicate_registry set from_kinds=p_from_kinds,to_kinds=p_to_kinds,directed=p_directed,description=p_description,symmetric_helper=p_symmetric_helper,version=version+1,updated_by=u,updated_at=now() where workspace_id=p_workspace_id and name=p_name returning * into a;
 else
  if p_expected_version is not null then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.predicate_registry(workspace_id,name,from_kinds,to_kinds,directed,description,symmetric_helper,created_by,updated_by) values(p_workspace_id,p_name,p_from_kinds,p_to_kinds,p_directed,p_description,p_symmetric_helper,u,u) returning * into a;
 end if;
 perform private.audit_mutation(p_workspace_id,u,'predicate.upsert','predicate_registry',null,case when b.version is null then null else to_jsonb(b) end,to_jsonb(a)); return a;
end $$;
create function public.predicate_delete(p_workspace_id uuid,p_name text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b public.predicate_registry;
begin
 select * into b from public.predicate_registry where workspace_id=p_workspace_id and name=p_name for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.relation where workspace_id=p_workspace_id and predicate=p_name) or exists(select 1 from public.predicate_registry where workspace_id=p_workspace_id and symmetric_helper=p_name) then raise exception 'CONFLICT: predicate in use'; end if;
 delete from public.predicate_registry where workspace_id=p_workspace_id and name=p_name;
 perform private.audit_mutation(p_workspace_id,u,'predicate.delete','predicate_registry',null,to_jsonb(b),null);
end $$;
create function public.relation_create(p_workspace_id uuid,p_from_id uuid,p_to_id uuid,p_predicate text,p_attributes jsonb default '{}',p_valid_from timestamptz default null,p_valid_to timestamptz default null)
returns public.relation language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); f public.entity; t public.entity; p public.predicate_registry; a public.relation;
begin
 if p_from_id is null or p_to_id is null or p_from_id=p_to_id or jsonb_typeof(p_attributes) is distinct from 'object' or (p_valid_from is not null and p_valid_to is not null and p_valid_to<=p_valid_from) then raise exception 'VALIDATION_ERROR: relation'; end if;
 select * into f from public.entity where workspace_id=p_workspace_id and id=p_from_id for share;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into t from public.entity where workspace_id=p_workspace_id and id=p_to_id for share;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into p from public.predicate_registry where workspace_id=p_workspace_id and name=p_predicate for share;
 if not found then raise exception 'PREDICATE_NOT_FOUND'; end if;
 if f.status='archived' or t.status='archived' then raise exception 'ARCHIVED_ENTITY'; end if;
 if not(f.kind=any(p.from_kinds)) or not(t.kind=any(p.to_kinds)) then raise exception 'RELATION_KIND_MISMATCH'; end if;
 if exists(select 1 from public.relation where workspace_id=p_workspace_id and from_id=p_from_id and to_id=p_to_id and predicate=p_predicate) then raise exception 'CONFLICT: duplicate relation'; end if;
 insert into public.relation(workspace_id,from_id,to_id,predicate,attributes,valid_from,valid_to,created_by,updated_by) values(p_workspace_id,p_from_id,p_to_id,p_predicate,p_attributes,p_valid_from,p_valid_to,u,u) returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'relation.create','relation',a.id,null,to_jsonb(a)); return a;
end $$;
create function public.relation_update(p_workspace_id uuid,p_id uuid,p_expected_version int,p_patch jsonb)
returns public.relation language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); b public.relation; a public.relation; vf timestamptz; vt timestamptz;
begin
 if not private.object_keys_allowed(p_patch,array['attributes','validFrom','validTo']) or (p_patch?'attributes' and jsonb_typeof(p_patch->'attributes') is distinct from 'object') or (p_patch?'validFrom' and jsonb_typeof(p_patch->'validFrom') not in ('string','null')) or (p_patch?'validTo' and jsonb_typeof(p_patch->'validTo') not in ('string','null')) then raise exception 'VALIDATION_ERROR: relation patch'; end if;
 select * into b from public.relation where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 begin
  vf:=case when p_patch?'validFrom' then (p_patch->>'validFrom')::timestamptz else b.valid_from end;
  vt:=case when p_patch?'validTo' then (p_patch->>'validTo')::timestamptz else b.valid_to end;
 exception when invalid_datetime_format or datetime_field_overflow then raise exception 'VALIDATION_ERROR: validity date'; end;
 if vf is not null and vt is not null and vt<=vf then raise exception 'VALIDATION_ERROR: validity range'; end if;
 update public.relation set attributes=coalesce(p_patch->'attributes',b.attributes),valid_from=vf,valid_to=vt,version=version+1,updated_by=u,updated_at=now() where workspace_id=p_workspace_id and id=p_id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'relation.update','relation',a.id,to_jsonb(b),to_jsonb(a)); return a;
end $$;
create function public.relation_delete(p_workspace_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); b public.relation;
begin
 select * into b from public.relation where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 delete from public.relation where workspace_id=p_workspace_id and id=p_id;
 perform private.audit_mutation(p_workspace_id,u,'relation.delete','relation',b.id,to_jsonb(b),null);
end $$;
-- A native Data API/RPC read, with caller RLS and workspace membership enforced.
create function public.entity_get(p_workspace_id uuid,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.entity;
begin
 select * into e from public.entity where workspace_id=p_workspace_id and id=p_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 return jsonb_build_object('entity',to_jsonb(e)-'search_vector','relations',jsonb_build_object('incoming',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.relation r where r.workspace_id=p_workspace_id and r.to_id=p_id),'outgoing',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.relation r where r.workspace_id=p_workspace_id and r.from_id=p_id)));
end $$;
revoke all on function public.predicate_upsert(uuid,text,public.entity_kind[],public.entity_kind[],boolean,text,text,int),public.predicate_delete(uuid,text),public.relation_create(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz),public.relation_update(uuid,uuid,int,jsonb),public.relation_delete(uuid,uuid),public.entity_get(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.predicate_upsert(uuid,text,public.entity_kind[],public.entity_kind[],boolean,text,text,int),public.predicate_delete(uuid,text),public.relation_create(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz),public.relation_update(uuid,uuid,int,jsonb),public.relation_delete(uuid,uuid),public.entity_get(uuid,uuid) to authenticated;
