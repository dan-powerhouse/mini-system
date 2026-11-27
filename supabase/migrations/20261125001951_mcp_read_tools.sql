-- Review candidate. Only the existing ticketed dispatcher may invoke this helper.
create function private.mcp_read_tool(w uuid,u uuid,r public.workspace_role,scopes text[],op text,a jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare lim int; after_key text; k text; items jsonb; next_key text; result jsonb; n int;
begin
 if u is distinct from auth.uid() or not private.is_member(w) or not ('read'=any(scopes)) then raise exception 'FORBIDDEN'; end if;
 if jsonb_typeof(a) is distinct from 'object' then raise exception 'VALIDATION_ERROR'; end if;
 case op
 when 'get_context' then
  if a<>'{}'::jsonb then raise exception 'VALIDATION_ERROR'; end if;
  select jsonb_build_object('workspace',jsonb_build_object('id',id,'name',name,'slug',slug),'role',r,'scopes',scopes,
   'allowedTools',to_jsonb(array['get_context','search_entities','get_entity','traverse','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views']::text[] || case when r<>'viewer' and 'write'=any(scopes) then array['create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation']::text[] else array[]::text[] end),
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
 mut:=p_operation in ('create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation');
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
