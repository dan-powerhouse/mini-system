-- CSV exchange transactional core (CONTRACTS 5.13). Binary ZIP validation and
-- Storage transfer are Edge responsibilities. No execution records enter exchange.
create table private.import_job (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id), user_id uuid not null references auth.users(id),
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'), package_path text not null,
 payload jsonb not null, size_bytes int not null check(size_bytes between 1 and 20971520),
 state text not null default 'uploaded' check(state in ('uploaded','previewed','committed','failed','expired')),
 report jsonb, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes'
);
create index import_job_expiry on private.import_job(expires_at);
create table private.export_job (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id), user_id uuid not null references auth.users(id),
 payload jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes'
);
create index export_job_expiry on private.export_job(expires_at);
alter table private.import_job enable row level security;
alter table private.export_job enable row level security;
revoke all on private.import_job,private.export_job from public,anon,authenticated,service_role;
-- Only verified Edge identities may call these trusted entry points. Ordinary
-- authenticated roles cannot supply a user ID or claimed package digest.
create function public.exchange_stage_upload(p_workspace_id uuid,p_user_id uuid,p_upload_id uuid,p_source_hash text,p_size_bytes int,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.import_job; begin
 perform 1 from public.workspace where id=p_workspace_id for update;
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin','editor')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_upload_id is null or not private.object_keys_allowed(p_payload,array['entities','relations']) or jsonb_typeof(p_payload->'entities') is distinct from 'array' or jsonb_typeof(p_payload->'relations') is distinct from 'array' or octet_length(p_payload::text)>20971520 or jsonb_array_length(p_payload->'entities')+jsonb_array_length(p_payload->'relations')>10000 then raise exception 'VALIDATION_ERROR: package bounds'; end if;
 insert into private.import_job(id,workspace_id,user_id,source_hash,package_path,payload,size_bytes) values(p_upload_id,p_workspace_id,p_user_id,p_source_hash,p_workspace_id::text||'/'||p_user_id::text||'/'||p_upload_id::text||'.zip',p_payload,p_size_bytes) returning * into j;
 return jsonb_build_object('uploadId',j.id,'sha256',j.source_hash,'sizeBytes',j.size_bytes);
end $$;
-- Private import routine: exact UUIDs, same constraints and template validator.
-- Provisional rows are inserted before reference validation to support forward/cyclic refs.
-- Caller must hold workspace write lock. Preview always rolls back its subtransaction.
create function private.exchange_apply(w uuid,u uuid,payload jsonb,write_audit boolean) returns jsonb language plpgsql set search_path='' as $$
declare x record; v jsonb; e public.entity; f public.entity; t public.entity; p public.predicate_registry; r public.relation; fs jsonb; ids uuid[]:='{}'; rid uuid; errs jsonb:='[]'; code text; field text; total int:=jsonb_array_length(payload->'entities')+jsonb_array_length(payload->'relations'); begin
 for x in select value, ordinality+1 as rownum from jsonb_array_elements(payload->'entities') with ordinality loop
  v:=x.value; field:='id';
  begin
   if not private.object_keys_allowed(v,array['id','kind','type','title','status','attributes','notes','tags']) then raise exception 'INVALID_ROW'; end if;
   if jsonb_typeof(v->'id') is distinct from 'string' or coalesce(v->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_UUID'; end if;
   rid:=(v->>'id')::uuid;
   field:='kind'; if coalesce(v->>'kind','') not in ('person','object','process_kind','agent','app') then raise exception 'INVALID_KIND'; end if;
   field:='type'; if jsonb_typeof(v->'type') is distinct from 'string' or not exists(select 1 from public.type_templates where workspace_id=w and kind=(v->>'kind')::public.entity_kind and type=v->>'type') then raise exception 'TEMPLATE_NOT_FOUND'; end if;
   field:='title'; if jsonb_typeof(v->'title') is distinct from 'string' or length(btrim(v->>'title')) not between 1 and 300 then raise exception 'INVALID_TITLE'; end if;
   field:='status'; if coalesce(v->>'status','') not in ('active','inactive','archived') then raise exception 'INVALID_STATUS'; end if;
   field:='attributes'; if jsonb_typeof(v->'attributes') is distinct from 'object' then raise exception 'INVALID_ATTRIBUTES'; end if;
   field:='notes'; if not v?'notes' or jsonb_typeof(v->'notes') not in ('null','string') then raise exception 'INVALID_NOTES'; end if;
   field:='tags'; perform private.normalize_tags(v->'tags');
   field:='id';
   insert into public.entity(id,workspace_id,kind,type,title,status,attributes,notes,tags,created_by,updated_by)
   values(rid,w,(v->>'kind')::public.entity_kind,v->>'type',btrim(v->>'title'),(v->>'status')::public.entity_status,v->'attributes',v->>'notes',private.normalize_tags(v->'tags'),u,u);
   ids:=array_append(ids,rid);
  exception when unique_violation then errs:=errs||jsonb_build_array(jsonb_build_object('file','entities.csv','row',x.rownum,'field',field,'code','CONFLICT','message','Entity UUID conflicts with an existing or repeated record'));
  when raise_exception or check_violation or invalid_text_representation or not_null_violation or foreign_key_violation then errs:=errs||jsonb_build_array(jsonb_build_object('file','entities.csv','row',x.rownum,'field',field,'code','VALIDATION_ERROR','message','Invalid entity field'));
  end;
 end loop;
 -- Existing template semantics; imports preserve attributes, never silently apply defaults.
 for x in select value, ordinality+1 as rownum from jsonb_array_elements(payload->'entities') with ordinality loop
  if exists(select 1 from jsonb_array_elements(errs) z where z->>'file'='entities.csv' and (z->>'row')::bigint=x.rownum) then continue; end if;
  select * into e from public.entity where workspace_id=w and id=(x.value->>'id')::uuid;
  select fields into fs from public.type_templates where workspace_id=w and kind=e.kind and type=e.type;
  begin
   perform private.validate_attributes(w,fs,e.attributes,false);
   if write_audit then insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,after) values(w,'user',u,u,'import',gen_random_uuid()::text,'entity.create','entity',e.id,'success',to_jsonb(e)-'search_vector'); end if;
  exception when raise_exception then errs:=errs||jsonb_build_array(jsonb_build_object('file','entities.csv','row',x.rownum,'field','attributes','code','VALIDATION_ERROR','message',sqlerrm)); end;
 end loop;
 for x in select value, ordinality+1 as rownum from jsonb_array_elements(payload->'relations') with ordinality loop
  v:=x.value; field:='id';
  begin
   if not private.object_keys_allowed(v,array['id','from_id','to_id','predicate','attributes','valid_from','valid_to']) or jsonb_typeof(v->'id') is distinct from 'string' or coalesce(v->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_ROW'; end if;
   rid:=(v->>'id')::uuid;
   field:='from_id'; select * into f from public.entity where workspace_id=w and id=(v->>'from_id')::uuid; if not found or (f.status='archived' and not(f.id=any(ids))) then raise exception 'INVALID_ENDPOINT'; end if;
   field:='to_id'; select * into t from public.entity where workspace_id=w and id=(v->>'to_id')::uuid; if not found or (t.status='archived' and not(t.id=any(ids))) or f.id=t.id then raise exception 'INVALID_ENDPOINT'; end if;
   field:='predicate'; select * into p from public.predicate_registry where workspace_id=w and name=v->>'predicate'; if not found or not(f.kind=any(p.from_kinds)) or not(t.kind=any(p.to_kinds)) then raise exception 'INVALID_PREDICATE'; end if;
   field:='attributes'; if jsonb_typeof(v->'attributes') is distinct from 'object' then raise exception 'INVALID_ATTRIBUTES'; end if;
   field:='validity';
   if not(v?'valid_from' and v?'valid_to') or jsonb_typeof(v->'valid_from') not in ('null','string') or jsonb_typeof(v->'valid_to') not in ('null','string') or (v->>'valid_from' is not null and v->>'valid_from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$') or (v->>'valid_to' is not null and v->>'valid_to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$') then raise exception 'INVALID_VALIDITY'; end if;
   if (v->>'valid_from')::timestamptz >= (v->>'valid_to')::timestamptz then raise exception 'INVALID_VALIDITY'; end if;
   field:='id'; insert into public.relation(id,workspace_id,from_id,to_id,predicate,attributes,valid_from,valid_to,created_by,updated_by) values(rid,w,f.id,t.id,p.name,v->'attributes',(v->>'valid_from')::timestamptz,(v->>'valid_to')::timestamptz,u,u) returning * into r;
   if write_audit then insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,after) values(w,'user',u,u,'import',gen_random_uuid()::text,'relation.create','relation',r.id,'success',to_jsonb(r)); end if;
  exception when unique_violation then errs:=errs||jsonb_build_array(jsonb_build_object('file','relations.csv','row',x.rownum,'field',field,'code','CONFLICT','message','Relation UUID or edge conflicts with an existing or repeated record'));
  when raise_exception or check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or not_null_violation or foreign_key_violation then errs:=errs||jsonb_build_array(jsonb_build_object('file','relations.csv','row',x.rownum,'field',field,'code','VALIDATION_ERROR','message','Invalid relation field'));
  end;
 end loop;
 return jsonb_build_object('entityRows',jsonb_array_length(payload->'entities'),'relationRows',jsonb_array_length(payload->'relations'),'validRows',total-jsonb_array_length(errs),'errors',errs,'warnings','[]'::jsonb);
end $$;
create function public.import_preview(p_workspace_id uuid,p_upload_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); j private.import_job; result_report jsonb;
begin
 select * into j from private.import_job where id=p_upload_id and workspace_id=p_workspace_id and user_id=u and expires_at>clock_timestamp() and state='uploaded' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 begin result_report:=private.exchange_apply(p_workspace_id,u,j.payload,false); raise sqlstate 'EG001'; exception when sqlstate 'EG001' then null; end;
 result_report:=result_report||jsonb_build_object('previewId',j.id,'sourceHash',j.source_hash,'expiresAt',j.expires_at);
 update private.import_job set state='previewed',report=result_report where id=j.id; return result_report;
end $$;
create function public.import_commit(p_workspace_id uuid,p_preview_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id); j private.import_job; result_report jsonb;
begin
 select * into j from private.import_job where id=p_preview_id and workspace_id=p_workspace_id and user_id=u and expires_at>clock_timestamp() and state='previewed' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if jsonb_array_length(j.report->'errors')<>0 then raise exception 'IMPORT_VALIDATION_FAILED'; end if;
 result_report:=private.exchange_apply(p_workspace_id,u,j.payload,true);
 if jsonb_array_length(result_report->'errors')<>0 then raise exception 'IMPORT_VALIDATION_FAILED'; end if;
 update private.import_job set state='committed',payload='{}' where id=j.id;
 return jsonb_build_object('entitiesCreated',result_report->'entityRows','relationsCreated',result_report->'relationRows');
end $$;
create function public.export_create(p_workspace_id uuid,p_kinds public.entity_kind[] default null,p_include_archived boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); j private.export_job; payload jsonb;
begin
 if not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 if p_include_archived is null or (p_kinds is not null and (cardinality(p_kinds)=0 or array_position(p_kinds,null) is not null)) then raise exception 'VALIDATION_ERROR: export options'; end if;
 -- One SQL statement takes a consistent MVCC snapshot of both sets.
 with selected as materialized(select id,kind,type,title,status,attributes,notes,tags from public.entity where workspace_id=p_workspace_id and (p_kinds is null or kind=any(p_kinds)) and (p_include_archived or status<>'archived') order by id limit 10001),
 edges as (select id,from_id,to_id,predicate,attributes,valid_from,valid_to from public.relation where workspace_id=p_workspace_id and from_id in(select id from selected) and to_id in(select id from selected) order by id limit 10001)
 select jsonb_build_object('entities',(select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from selected s),'relations',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from edges r)) into payload;
 if jsonb_array_length(payload->'entities')+jsonb_array_length(payload->'relations')>10000 or octet_length(payload::text)>20971520 then raise exception 'PAYLOAD_TOO_LARGE'; end if;
 insert into private.export_job(workspace_id,user_id,payload) values(p_workspace_id,u,payload) returning * into j;
 return jsonb_build_object('exportId',j.id,'expiresAt',j.expires_at);
end $$;
create function public.exchange_read_export(p_export_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.export_job;
begin
 select * into j from private.export_job where id=p_export_id and user_id=p_user_id and expires_at>clock_timestamp();
 if not found or not exists(select 1 from public.workspace_member where workspace_id=j.workspace_id and user_id=p_user_id) then raise exception 'NOT_FOUND'; end if;
 return j.payload||jsonb_build_object('sourceWorkspaceId',j.workspace_id,'exportedAt',j.created_at);
end $$;
revoke all on function private.exchange_apply(uuid,uuid,jsonb,boolean),public.exchange_stage_upload(uuid,uuid,uuid,text,int,jsonb),public.exchange_read_export(uuid,uuid),public.import_preview(uuid,uuid),public.import_commit(uuid,uuid),public.export_create(uuid,public.entity_kind[],boolean) from public,anon,authenticated,service_role;
grant execute on function public.exchange_stage_upload(uuid,uuid,uuid,text,int,jsonb),public.exchange_read_export(uuid,uuid) to service_role;
grant execute on function public.import_preview(uuid,uuid),public.import_commit(uuid,uuid),public.export_create(uuid,public.entity_kind[],boolean) to authenticated;
-- Cleanup is deliberately two-phase: the Edge function deletes the native
-- Storage object, then removes the expired job. Never DELETE storage.objects directly.
create function public.exchange_cleanup_candidates(p_limit int default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR: cleanup limit'; end if;
 delete from private.export_job where id in(select id from private.export_job where expires_at<=clock_timestamp() order by expires_at,id limit p_limit);
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'path',x.package_path) order by x.expires_at,x.id),'[]') into result
 from (select id,package_path,expires_at from private.import_job where expires_at<=clock_timestamp() order by expires_at,id limit p_limit) x;
 return result;
end $$;
create function public.exchange_cleanup_finish(p_upload_id uuid) returns void
language sql security definer set search_path='' as $$
 delete from private.import_job where id=p_upload_id and expires_at<=clock_timestamp()
$$;
revoke all on function public.exchange_cleanup_candidates(int),public.exchange_cleanup_finish(uuid) from public,anon,authenticated,service_role;
grant execute on function public.exchange_cleanup_candidates(int),public.exchange_cleanup_finish(uuid) to service_role;
