-- First operational domain slice: human RPCs only. No opaque credentials or MCP yet.
-- Serialize writes within a workspace; future member/ontology/edge mutation RPCs must use the same lock.
create function private.can_admin(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_member m where m.workspace_id=w and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))
$$;
revoke all on function private.can_admin(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_admin(uuid) to authenticated;
drop policy member_read on public.workspace_member;
create policy member_read on public.workspace_member for select to authenticated using (user_id=(select auth.uid()) or private.can_admin(workspace_id));

create function private.require_write(w uuid, admin_only boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.workspace_role;
begin
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if not exists(select 1 from public.workspace_member where workspace_id=w and user_id=u) then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.workspace where id=w for update;
 select role into r from public.workspace_member where workspace_id=w and user_id=u for share;
 if r is null then raise exception 'NOT_FOUND'; end if;
 if r='viewer' or (admin_only and r not in ('owner','admin')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return u;
end $$;
create function private.audit_mutation(w uuid,u uuid,act text,typ text,tid uuid,b jsonb,a jsonb) returns void language sql set search_path='' as $$
 insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,before,after)
 values(w,'user',u,u,'rpc',gen_random_uuid()::text,act,typ,tid,'success',b,a)
$$;
create function private.object_keys_allowed(v jsonb, allowed text[]) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='object' then not exists(select 1 from jsonb_object_keys(v) k where not(k=any(allowed))) else false end
$$;
create function private.field_ok(w uuid,f jsonb,v jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare dt text:=f->>'dataType'; txt text; ref uuid;
begin
 if v is null or v='null'::jsonb then return false; end if;
 if dt='text' then return jsonb_typeof(v)='string'; end if;
 if dt='number' then return jsonb_typeof(v)='number'; end if;
 if dt='date' then
  txt:=v#>>'{}';
  if jsonb_typeof(v)<>'string' or txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  begin return to_char(txt::date,'YYYY-MM-DD')=txt; exception when datetime_field_overflow or invalid_datetime_format then return false; end;
 end if;
 if dt='select' then return jsonb_typeof(v)='string' and (f->'options') @> jsonb_build_array(v); end if;
 if dt='multiselect' then
  if jsonb_typeof(v)<>'array' then return false; end if;
  return (f->'options') @> v and (select count(*)=count(distinct x) from jsonb_array_elements(v) x);
 end if;
 if dt='entity_ref' then
  if jsonb_typeof(v)<>'string' then return false; end if;
  txt:=v#>>'{}'; if txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  ref:=txt::uuid;
  return exists(select 1 from public.entity e where e.workspace_id=w and e.id=ref and (not(f?'entityRefKind') or e.kind::text=f->>'entityRefKind'));
 end if;
 return false;
end $$;
create function private.validate_fields(w uuid,fs jsonb) returns void language plpgsql stable set search_path='' as $$
declare f jsonb; dt text; seen text[]:='{}'; opt jsonb;
begin
 if jsonb_typeof(fs) is distinct from 'array' then raise exception 'VALIDATION_ERROR: fields must be an array'; end if;
 for f in select value from jsonb_array_elements(fs) loop
  if not private.object_keys_allowed(f,array['name','dataType','required','options','default','entityRefKind']) or jsonb_typeof(f->'name') is distinct from 'string' or (f->>'name') !~ '^[a-z][a-z0-9_]*$' or (f->>'name')=any(seen) then raise exception 'VALIDATION_ERROR: invalid or duplicate field name'; end if;
  seen:=array_append(seen,f->>'name'); dt:=f->>'dataType';
  if dt is null or dt not in ('text','number','date','select','multiselect','entity_ref') or (f?'required' and jsonb_typeof(f->'required') is distinct from 'boolean') then raise exception 'VALIDATION_ERROR: invalid field type'; end if;
  if dt in ('select','multiselect') then
   opt:=f->'options';
   if jsonb_typeof(opt) is distinct from 'array' then raise exception 'VALIDATION_ERROR: options required'; end if;
   if jsonb_array_length(opt)=0 or exists(select 1 from jsonb_array_elements(opt) x where jsonb_typeof(x)<>'string' or btrim(x#>>'{}')='') or (select count(*)<>count(distinct x) from jsonb_array_elements(opt) x) then raise exception 'VALIDATION_ERROR: invalid options'; end if;
  elsif f?'options' then raise exception 'VALIDATION_ERROR: unexpected options'; end if;
  if f?'entityRefKind' and (dt<>'entity_ref' or coalesce(f->>'entityRefKind','') not in ('person','object','process_kind','agent','app')) then raise exception 'VALIDATION_ERROR: invalid entityRefKind'; end if;
  if f?'default' and not private.field_ok(w,f,f->'default') then raise exception 'VALIDATION_ERROR: invalid default'; end if;
 end loop;
end $$;
create function private.validate_attributes(w uuid,fs jsonb,attrs jsonb,apply_defaults boolean) returns jsonb language plpgsql stable set search_path='' as $$
declare f jsonb; n text; result jsonb:=attrs;
begin
 if jsonb_typeof(attrs) is distinct from 'object' then raise exception 'VALIDATION_ERROR: attributes must be object'; end if;
 if exists(select 1 from jsonb_object_keys(attrs) k where not exists(select 1 from jsonb_array_elements(fs) z where z->>'name'=k)) then raise exception 'VALIDATION_ERROR: unknown attribute'; end if;
 for f in select value from jsonb_array_elements(fs) loop
  n:=f->>'name';
  if apply_defaults and not(result?n) and f?'default' then result:=result||jsonb_build_object(n,f->'default'); end if;
  if result?n then
   if not private.field_ok(w,f,result->n) then raise exception 'VALIDATION_ERROR: invalid attribute %',n; end if;
  elsif coalesce((f->>'required')::boolean,false) then raise exception 'VALIDATION_ERROR: missing attribute %',n; end if;
 end loop;
 return result;
end $$;
create function public.template_upsert(p_workspace_id uuid,p_kind public.entity_kind,p_type text,p_fields jsonb,p_expected_version integer default null) returns public.type_templates language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); oldrow public.type_templates; newrow public.type_templates; e record;
begin
 perform private.validate_fields(p_workspace_id,p_fields);
 select * into oldrow from public.type_templates where workspace_id=p_workspace_id and kind=p_kind and type=p_type;
 if found then
  if p_expected_version is distinct from oldrow.version then raise exception 'VERSION_CONFLICT'; end if;
  for e in select attributes from public.entity where workspace_id=p_workspace_id and kind=p_kind and type=p_type loop
   begin perform private.validate_attributes(p_workspace_id,p_fields,e.attributes,false); exception when raise_exception then raise exception 'CONFLICT: template would invalidate existing entity'; end;
  end loop;
  update public.type_templates set fields=p_fields,version=version+1,updated_by=u,updated_at=now() where workspace_id=p_workspace_id and kind=p_kind and type=p_type returning * into newrow;
 else
  if p_expected_version is not null then raise exception 'VERSION_CONFLICT'; end if;
  insert into public.type_templates(workspace_id,kind,type,fields,updated_by) values(p_workspace_id,p_kind,p_type,p_fields,u) returning * into newrow;
 end if;
 perform private.audit_mutation(p_workspace_id,u,'template.upsert','type_templates',null,case when oldrow.version is null then null else to_jsonb(oldrow) end,to_jsonb(newrow));
 return newrow;
end $$;
create function private.normalize_tags(v jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare result text[];
begin
 if jsonb_typeof(v) is distinct from 'array' then raise exception 'VALIDATION_ERROR: tags must be array'; end if;
 if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or btrim(x#>>'{}')='') then raise exception 'VALIDATION_ERROR: invalid tag'; end if;
 select coalesce(array_agg(distinct lower(btrim(x)) order by lower(btrim(x))),'{}') into result from jsonb_array_elements_text(v) x;
 return result;
end $$;
create function public.entity_create(p_workspace_id uuid,p_input jsonb) returns public.entity language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); fs jsonb; result public.entity; k public.entity_kind; t text;
begin
 if not private.object_keys_allowed(p_input,array['kind','type','title','status','attributes','notes','tags']) or jsonb_typeof(p_input->'kind') is distinct from 'string' or jsonb_typeof(p_input->'type') is distinct from 'string' or jsonb_typeof(p_input->'title') is distinct from 'string' or (p_input?'notes' and jsonb_typeof(p_input->'notes') not in ('string','null')) or (p_input?'status' and coalesce(p_input->>'status','') not in ('active','inactive')) then raise exception 'VALIDATION_ERROR: entity input'; end if;
 if p_input->>'kind' not in ('person','object','process_kind','agent','app') then raise exception 'VALIDATION_ERROR: kind'; end if;
 k:=(p_input->>'kind')::public.entity_kind; t:=btrim(p_input->>'type');
 select fields into fs from public.type_templates where workspace_id=p_workspace_id and kind=k and type=t;
 if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
 insert into public.entity(workspace_id,kind,type,title,status,attributes,notes,tags,created_by,updated_by)
 values(p_workspace_id,k,t,btrim(p_input->>'title'),coalesce(p_input->>'status','active')::public.entity_status,private.validate_attributes(p_workspace_id,fs,coalesce(p_input->'attributes','{}'::jsonb),true),p_input->>'notes',private.normalize_tags(coalesce(p_input->'tags','[]'::jsonb)),u,u) returning * into result;
 perform private.audit_mutation(p_workspace_id,u,'entity.create','entity',result.id,null,to_jsonb(result)-'search_vector'); return result;
end $$;
create function public.entity_update(p_workspace_id uuid,p_id uuid,p_expected_version int,p_patch jsonb) returns public.entity language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); oldrow public.entity; result public.entity; fs jsonb; t text;
begin
 if not private.object_keys_allowed(p_patch,array['type','title','status','attributes','notes','tags']) or (p_patch?'type' and jsonb_typeof(p_patch->'type') is distinct from 'string') or (p_patch?'title' and jsonb_typeof(p_patch->'title') is distinct from 'string') or (p_patch?'notes' and jsonb_typeof(p_patch->'notes') not in ('string','null')) or (p_patch?'status' and coalesce(p_patch->>'status','') not in ('active','inactive')) then raise exception 'VALIDATION_ERROR: entity patch'; end if;
 select * into oldrow from public.entity where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if oldrow.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if oldrow.status='archived' then raise exception 'ARCHIVED_ENTITY'; end if;
 t:=coalesce(btrim(p_patch->>'type'),oldrow.type);
 select fields into fs from public.type_templates where workspace_id=p_workspace_id and kind=oldrow.kind and type=t;
 if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
 update public.entity set type=t,title=coalesce(btrim(p_patch->>'title'),oldrow.title),status=coalesce(p_patch->>'status',oldrow.status::text)::public.entity_status,
 attributes=private.validate_attributes(p_workspace_id,fs,coalesce(p_patch->'attributes',oldrow.attributes),false),notes=case when p_patch?'notes' then p_patch->>'notes' else oldrow.notes end,
 tags=case when p_patch?'tags' then private.normalize_tags(p_patch->'tags') else oldrow.tags end,version=oldrow.version+1,updated_by=u,updated_at=now() where workspace_id=p_workspace_id and id=p_id returning * into result;
 perform private.audit_mutation(p_workspace_id,u,'entity.update','entity',p_id,to_jsonb(oldrow)-'search_vector',to_jsonb(result)-'search_vector'); return result;
end $$;
create function public.entity_archive(p_workspace_id uuid,p_id uuid,p_expected_version int) returns public.entity language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); oldrow public.entity; result public.entity;
begin
 select * into oldrow from public.entity where workspace_id=p_workspace_id and id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if oldrow.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if oldrow.status='archived' then raise exception 'ARCHIVED_ENTITY'; end if;
 update public.entity set status='archived',version=version+1,updated_by=u,updated_at=now() where workspace_id=p_workspace_id and id=p_id returning * into result;
 perform private.audit_mutation(p_workspace_id,u,'entity.archive','entity',p_id,to_jsonb(oldrow)-'search_vector',to_jsonb(result)-'search_vector'); return result;
end $$;
-- Explicit grants; private validation/write helpers are not exposed to client roles.
revoke all on all functions in schema private from public,anon,authenticated,service_role;
grant execute on function private.is_member(uuid),private.can_admin(uuid) to authenticated;
revoke all on function public.template_upsert(uuid,public.entity_kind,text,jsonb,integer), public.entity_create(uuid,jsonb), public.entity_update(uuid,uuid,int,jsonb), public.entity_archive(uuid,uuid,int) from public,anon,authenticated,service_role;
grant execute on function public.template_upsert(uuid,public.entity_kind,text,jsonb,integer), public.entity_create(uuid,jsonb), public.entity_update(uuid,uuid,int,jsonb), public.entity_archive(uuid,uuid,int) to authenticated;
