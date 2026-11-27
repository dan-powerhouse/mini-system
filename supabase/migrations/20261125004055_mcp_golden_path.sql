-- Additive MCP Golden Path ontology scope. Existing tokens keep read/write permissions only.
-- New ontology writes require explicitly issued manage + write and current owner/admin role.
alter table private.api_token drop constraint api_token_scopes_check;
alter table private.api_token add constraint api_token_scopes_check check (
 'read'=any(scopes) and scopes <@ array['read','write','manage']::text[]
 and array_position(scopes,null) is null and cardinality(scopes) between 1 and 3
 and (not ('manage'=any(scopes)) or 'write'=any(scopes))
);
create or replace function public.token_issue(p_workspace_id uuid,p_user_id uuid,p_label text,p_scopes text[],p_expires_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); raw text:='egt_'||encode(extensions.gen_random_bytes(32),'hex'); a private.api_token;
begin
 if p_label is null or length(btrim(p_label)) not between 1 and 100 or p_scopes is null or not('read'=any(p_scopes)) or not(p_scopes<@array['read','write','manage']) or ('manage'=any(p_scopes) and not('write'=any(p_scopes))) or array_position(p_scopes,null) is not null or cardinality(p_scopes)<>(select count(distinct x) from unnest(p_scopes) x) or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'VALIDATION_ERROR: token'; end if;
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id) then raise exception 'NOT_FOUND'; end if;
 if 'manage'=any(p_scopes) and not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin')) then raise exception 'FORBIDDEN'; end if;
 insert into private.api_token(workspace_id,user_id,label,prefix,token_hash,scopes,created_by,expires_at) values(p_workspace_id,p_user_id,btrim(p_label),left(raw,12),extensions.digest(raw,'sha256'),p_scopes,u,p_expires_at) returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'token.issue','api_token',a.id,null,to_jsonb(a)-'token_hash');
 return jsonb_build_object('token',raw,'summary',to_jsonb(a)-'token_hash');
end $$;

-- Closed-world Golden Path operations: never accept a workspace override or a generic RPC name.
create function private.mcp_golden_tool(w uuid,u uuid,r public.workspace_role,scopes text[],op text,a jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare data jsonb; t public.type_templates; p public.predicate_registry; lim int;
begin
 if u is distinct from auth.uid() or not private.is_member(w) or not ('read'=any(scopes)) then raise exception 'FORBIDDEN'; end if;
 if jsonb_typeof(a) is distinct from 'object' then raise exception 'VALIDATION_ERROR'; end if;
 if op in ('create_template','create_predicate') and (r not in ('owner','admin') or not('manage'=any(scopes)) or not('write'=any(scopes))) then raise exception 'FORBIDDEN'; end if;
 case op
 when 'get_entity_history' then
  if not private.object_keys_allowed(a,array['id','limit','cursor']) or jsonb_typeof(a->'id') is distinct from 'string' then raise exception 'VALIDATION_ERROR'; end if;
  if a?'limit' and (jsonb_typeof(a->'limit') is distinct from 'number' or (a->>'limit')!~'^[0-9]{1,2}$') then raise exception 'VALIDATION_ERROR'; end if;
  lim:=coalesce((a->>'limit')::int,25); if lim not between 1 and 50 then raise exception 'VALIDATION_ERROR'; end if;
  if a?'cursor' and (jsonb_typeof(a->'cursor') is distinct from 'string' or length(a->>'cursor') not between 1 and 2048) then raise exception 'VALIDATION_ERROR'; end if;
  if not exists(select 1 from public.entity where workspace_id=w and id=(a->>'id')::uuid) then raise exception 'NOT_FOUND'; end if;
  data:=public.audit_recent(w,jsonb_strip_nulls(jsonb_build_object('targetType','entity','targetId',a->>'id','limit',lim,'cursor',a->>'cursor')));
  -- Preserve native audit cursor and history; project only event metadata and versions, never snapshots.
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',x.value->'id','at',x.value->'at','action',x.value->'action','source',x.value->'source','actorType',x.value->'actor_type','targetId',x.value->'target_id','outcome',x.value->'outcome','beforeVersion',x.value#>'{before,version}','afterVersion',x.value#>'{after,version}') order by x.ord),'[]'),'nextCursor',data->'nextCursor') into data from jsonb_array_elements(data->'items') with ordinality x(value,ord);
 when 'create_template' then
  if not private.object_keys_allowed(a,array['kind','type','fields']) or jsonb_typeof(a->'kind') is distinct from 'string' or jsonb_typeof(a->'type') is distinct from 'string' or length(a->>'type') not between 1 and 100 or jsonb_typeof(a->'fields') is distinct from 'array' or jsonb_array_length(a->'fields')>100 then raise exception 'VALIDATION_ERROR'; end if;
  t:=public.template_upsert(w,(a->>'kind')::public.entity_kind,a->>'type',a->'fields',null);
  data:=jsonb_build_object('kind',t.kind,'type',t.type,'version',t.version,'fields',t.fields,'updatedAt',t.updated_at);
 when 'create_predicate' then
  if not private.object_keys_allowed(a,array['name','description','fromKinds','toKinds','directed','symmetricHelper']) or jsonb_typeof(a->'name') is distinct from 'string' or length(a->>'name') not between 1 and 100 or jsonb_typeof(a->'description') is distinct from 'string' or length(a->>'description')>1000 or jsonb_typeof(a->'fromKinds') is distinct from 'array' or jsonb_typeof(a->'toKinds') is distinct from 'array' or jsonb_array_length(a->'fromKinds') not between 1 and 5 or jsonb_array_length(a->'toKinds') not between 1 and 5 or jsonb_typeof(a->'directed') is distinct from 'boolean' or (a?'symmetricHelper' and jsonb_typeof(a->'symmetricHelper') not in ('string','null')) then raise exception 'VALIDATION_ERROR'; end if;
  if exists(select 1 from jsonb_array_elements((a->'fromKinds')||(a->'toKinds')) x where jsonb_typeof(x)<>'string') then raise exception 'VALIDATION_ERROR'; end if;
  p:=public.predicate_upsert(w,a->>'name',array(select jsonb_array_elements_text(a->'fromKinds')::public.entity_kind),array(select jsonb_array_elements_text(a->'toKinds')::public.entity_kind),(a->>'directed')::boolean,a->>'description',a->>'symmetricHelper',null);
  data:=jsonb_build_object('name',p.name,'description',p.description,'fromKinds',p.from_kinds,'toKinds',p.to_kinds,'directed',p.directed,'symmetricHelper',p.symmetric_helper,'version',p.version);
 else raise exception 'VALIDATION_ERROR';
 end case;
 return data;
end $$;
revoke all on function private.mcp_golden_tool(uuid,uuid,public.workspace_role,text[],text,jsonb) from public,anon,authenticated,service_role;

-- Review candidate. Only the existing ticketed dispatcher may invoke this helper.
create or replace function private.mcp_read_tool(w uuid,u uuid,r public.workspace_role,scopes text[],op text,a jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare lim int; after_key text; k text; items jsonb; next_key text; result jsonb; n int;
begin
 if u is distinct from auth.uid() or not private.is_member(w) or not ('read'=any(scopes)) then raise exception 'FORBIDDEN'; end if;
 if jsonb_typeof(a) is distinct from 'object' then raise exception 'VALIDATION_ERROR'; end if;
 case op
 when 'get_context' then
  if a<>'{}'::jsonb then raise exception 'VALIDATION_ERROR'; end if;
  select jsonb_build_object('workspace',jsonb_build_object('id',id,'name',name,'slug',slug),'role',r,'scopes',scopes,
   'allowedTools',to_jsonb(array['get_context','search_entities','get_entity','traverse','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views','get_entity_history']::text[] || case when r<>'viewer' and 'write'=any(scopes) then array['create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation']::text[] else array[]::text[] end || case when r in ('owner','admin') and 'manage'=any(scopes) and 'write'=any(scopes) then array['create_template','create_predicate']::text[] else array[]::text[] end),
   'kinds',to_jsonb(enum_range(null::public.entity_kind)), 'workspaceBound',true) into result from public.workspace where id=w;
 when 'get_template' then
  if not private.object_keys_allowed(a,array['kind','type']) or coalesce(a->>'kind','') not in ('person','object','process_kind','agent','app') or jsonb_typeof(a->'type') is distinct from 'string' or length(a->>'type') not between 1 and 100 then raise exception 'VALIDATION_ERROR'; end if;
  select jsonb_build_object('kind',t.kind,'type',t.type,'version',t.version,'fields',t.fields,'updatedAt',t.updated_at) into result from public.type_templates t where t.workspace_id=w and t.kind::text=a->>'kind' and t.type=a->>'type';
  if result is null then raise exception 'NOT_FOUND'; end if;
 when 'get_dashboard' then
  if a<>'{}'::jsonb then raise exception 'VALIDATION_ERROR'; end if;
  -- Do not include dashboard_summary's raw audit snapshots in an LLM summary.
  result:=public.dashboard_summary(w)-'recentActivity'-'staleProcessKinds';
  select result||jsonb_build_object('staleProcessKinds',coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'type',x.type,'version',x.version,'updatedAt',x.updated_at) order by x.updated_at,x.id),'[]')) into result from (select e.id,e.title,e.type,e.version,e.updated_at from public.entity e join public.workspace ws on ws.id=e.workspace_id where e.workspace_id=w and e.kind='process_kind' and e.status='active' and e.updated_at<now()-make_interval(days=>ws.stale_process_kind_days) order by e.updated_at,e.id limit 20) x;
 when 'run_path_report' then
  if not private.object_keys_allowed(a,array['startId','steps','maxResults']) or jsonb_typeof(a->'startId') is distinct from 'string' or jsonb_typeof(a->'steps') is distinct from 'array' then raise exception 'VALIDATION_ERROR'; end if;
  if a?'maxResults' and (jsonb_typeof(a->'maxResults')<>'number' or (a->>'maxResults')!~'^[0-9]{1,3}$') then raise exception 'VALIDATION_ERROR'; end if;
  lim:=coalesce((a->>'maxResults')::int,25); if lim not between 1 and 100 then raise exception 'VALIDATION_ERROR'; end if;
  -- Fetch one extra path to distinguish an exact page from a truncated report.
  result:=public.registry_path_report(w,(a->>'startId')::uuid,a->'steps',lim+1);
  n:=jsonb_array_length(result);
  select jsonb_build_object('paths',coalesce(jsonb_agg(jsonb_build_object(
   'entities',(select jsonb_agg(jsonb_build_object('id',e.value->'id','title',e.value->'title','kind',e.value->'kind','type',e.value->'type','status',e.value->'status','version',e.value->'version') order by e.ord) from jsonb_array_elements(x.value->'entities') with ordinality e(value,ord)),
   'relations',(select jsonb_agg(jsonb_build_object('id',rel.value->'id','fromId',rel.value->'from_id','toId',rel.value->'to_id','predicate',rel.value->'predicate','version',rel.value->'version','validFrom',rel.value->'valid_from','validTo',rel.value->'valid_to') order by rel.ord) from jsonb_array_elements(x.value->'relations') with ordinality rel(value,ord))
  ) order by x.ord),'[]'),'truncated',n>lim) into result from jsonb_array_elements(result) with ordinality x(value,ord) where x.ord<=lim;
 when 'list_templates','list_predicates','list_saved_views' then
  if not private.object_keys_allowed(a,case when op='list_templates' then array['kind','after','limit'] else array['after','limit'] end) then raise exception 'VALIDATION_ERROR'; end if;
  if a?'limit' and (jsonb_typeof(a->'limit')<>'number' or (a->>'limit')!~'^[0-9]{1,2}$') then raise exception 'VALIDATION_ERROR'; end if;
  lim:=coalesce((a->>'limit')::int,25); if lim not between 1 and 50 then raise exception 'VALIDATION_ERROR'; end if;
  if a?'after' and (jsonb_typeof(a->'after') is distinct from 'string' or length(a->>'after') not between 1 and 140) then raise exception 'VALIDATION_ERROR'; end if;
  after_key:=coalesce(a->>'after',''); k:=a->>'kind';
  if a?'kind' and (k is null or k not in ('person','object','process_kind','agent','app')) then raise exception 'VALIDATION_ERROR'; end if;
  with candidates as (
   select t.kind::text||':'||t.type as page_key,jsonb_build_object('kind',t.kind,'type',t.type,'version',t.version,'fieldCount',jsonb_array_length(t.fields)) as dto from public.type_templates t where op='list_templates' and t.workspace_id=w and (k is null or t.kind::text=k)
   union all
   select p.name,jsonb_build_object('name',p.name,'description',p.description,'fromKinds',p.from_kinds,'toKinds',p.to_kinds,'directed',p.directed,'symmetricHelper',p.symmetric_helper,'version',p.version) from public.predicate_registry p where op='list_predicates' and p.workspace_id=w
   union all
   select s.id::text,jsonb_build_object('id',s.id,'name',s.name,'visibility',s.visibility,'kind',s.kind,'query',s.query,'version',s.version,'isMine',s.owner_user_id=u) from public.saved_view s where op='list_saved_views' and s.workspace_id=w and (s.visibility='workspace' or s.owner_user_id=u)
  ), page as (select *,row_number() over(order by page_key collate "C") as rn from candidates where page_key collate "C">after_key collate "C" order by page_key collate "C" limit lim+1)
  select coalesce(jsonb_agg(dto order by rn) filter(where rn<=lim),'[]'),count(*),max(page_key) filter(where rn=lim) into items,n,next_key from page;
  result:=jsonb_build_object('items',items,'nextAfter',case when n>lim then next_key end);
 else raise exception 'VALIDATION_ERROR';
 end case;
 return result;
end $$;
revoke all on function private.mcp_read_tool(uuid,uuid,public.workspace_role,text[],text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.mcp_dispatch(p_token_id uuid,p_request_id uuid,p_operation text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.api_token; ticket private.api_rate_bucket; r public.workspace_role; w uuid; result jsonb; code text; mut boolean; prior_sub text; prior_claims text; prior_req text; prior_token text;
begin
 select workspace_id into w from private.api_token where id=p_token_id;
 if not found then raise exception 'UNAUTHENTICATED'; end if;
 perform 1 from public.workspace where id=w for update;
 select * into t from private.api_token where id=p_token_id and workspace_id=w for update;
 select * into ticket from private.api_rate_bucket where token_id=t.id and request_id=p_request_id for update;
 if not found or ticket.completed_at is not null or ticket.at<clock_timestamp()-interval '5 minutes' then raise exception 'INVALID_REQUEST_TICKET'; end if;
 select role into r from public.workspace_member where workspace_id=w and user_id=t.user_id;
 mut:=p_operation in ('create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation','create_template','create_predicate');
 prior_sub:=current_setting('request.jwt.claim.sub',true); prior_claims:=current_setting('request.jwt.claims',true); prior_req:=current_setting('entitygraph.mcp_request',true); prior_token:=current_setting('entitygraph.mcp_token',true);
 begin
  if t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp()) or r is null then raise exception 'UNAUTHENTICATED'; end if;
  if mut and (r='viewer' or not('write'=any(t.scopes))) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_args) is distinct from 'object' then raise exception 'VALIDATION_ERROR'; end if;
  perform set_config('request.jwt.claim.sub',t.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',t.user_id,'role','authenticated')::text,true);
  perform set_config('entitygraph.mcp_request',p_request_id::text,true);
  perform set_config('entitygraph.mcp_token',t.id::text,true);
  case p_operation
   when 'search_entities' then result:=public.entity_search(w,p_args);
   when 'get_entity' then result:=public.entity_get(w,(p_args->>'id')::uuid);
   when 'create_entity' then result:=jsonb_build_object('entity',to_jsonb(public.entity_create(w,p_args))-'search_vector');
   when 'update_entity' then result:=jsonb_build_object('entity',to_jsonb(public.entity_update(w,(p_args->>'id')::uuid,(p_args->>'expectedVersion')::int,p_args-'id'-'expectedVersion'))-'search_vector');
   when 'archive_entity' then result:=jsonb_build_object('entity',to_jsonb(public.entity_archive(w,(p_args->>'id')::uuid,(p_args->>'expectedVersion')::int))-'search_vector');
   when 'create_relation' then result:=jsonb_build_object('relation',to_jsonb(public.relation_create(w,(p_args->>'fromId')::uuid,(p_args->>'toId')::uuid,p_args->>'predicate',coalesce(p_args->'attributes','{}'),(p_args->>'validFrom')::timestamptz,(p_args->>'validTo')::timestamptz)));
   when 'update_relation' then result:=jsonb_build_object('relation',to_jsonb(public.relation_update(w,(p_args->>'id')::uuid,(p_args->>'expectedVersion')::int,p_args-'id'-'expectedVersion')));
   when 'delete_relation' then perform public.relation_delete(w,(p_args->>'id')::uuid); result:='{"success":true}';
   when 'traverse' then result:=public.registry_traverse(w,(p_args->>'startId')::uuid,(p_args->>'depth')::int,coalesce(p_args->>'direction','both'),case when p_args?'predicates' then array(select jsonb_array_elements_text(p_args->'predicates')) end,coalesce((p_args->>'maxNodes')::int,500));
   when 'resource_predicates' then select coalesce(jsonb_agg(to_jsonb(p) order by name),'[]') into result from public.predicate_registry p where workspace_id=w;
   when 'resource_template' then select to_jsonb(x) into result from public.type_templates x where workspace_id=w and kind::text=p_args->>'kind' and type=p_args->>'type'; if result is null then raise exception 'NOT_FOUND'; end if;
   when 'get_context','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views' then result:=private.mcp_read_tool(w,t.user_id,r,t.scopes,p_operation,p_args);
   when 'get_entity_history','create_template','create_predicate' then result:=private.mcp_golden_tool(w,t.user_id,r,t.scopes,p_operation,p_args);
   else raise exception 'VALIDATION_ERROR';
  end case;
  if octet_length(result::text)>1000000 then raise exception 'RESULT_TOO_LARGE'; end if;
  if mut and not exists(select 1 from public.audit_log where request_id=p_request_id::text and source='mcp' and actor_id=t.id) then raise exception 'AUDIT_REQUIRED'; end if;
 exception when others then
  code:=case when sqlerrm like 'VALIDATION_ERROR%' or sqlstate in ('22P02','22007','22008','23514','23502') then 'VALIDATION_ERROR' when sqlstate='23505' then 'CONFLICT' when sqlerrm in ('NOT_FOUND','UNAUTHENTICATED','FORBIDDEN','VERSION_CONFLICT','TEMPLATE_NOT_FOUND','PREDICATE_NOT_FOUND','RELATION_KIND_MISMATCH','ARCHIVED_ENTITY','RESULT_TOO_LARGE','PATH_NOT_CONFIGURED') then sqlerrm when sqlerrm like 'CONFLICT:%' then 'CONFLICT' else 'INTERNAL_ERROR' end;
 end;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true); perform set_config('request.jwt.claims',coalesce(prior_claims,''),true); perform set_config('entitygraph.mcp_request',coalesce(prior_req,''),true); perform set_config('entitygraph.mcp_token',coalesce(prior_token,''),true);
 if code is not null then perform private.mcp_audit(t,p_request_id,'mcp.'||p_operation,false,jsonb_build_object('code',code)); else if not mut then perform private.mcp_audit(t,p_request_id,'mcp.'||p_operation,true); end if; end if;
 update private.api_rate_bucket set completed_at=clock_timestamp() where token_id=t.id and request_id=p_request_id;
 if code is not null then return jsonb_build_object('ok',false,'code',code); end if;
 return jsonb_build_object('ok',true,'result',result);
end $$;
