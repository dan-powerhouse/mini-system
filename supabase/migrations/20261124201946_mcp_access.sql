-- Trusted Edge-to-database adapter. No service_role grants on the domain tables.
-- Auth, rolling rate limit, dispatch and exactly-once audit are bound to a request UUID
-- minted by the Edge function; the digest is never returned to a client.
alter table private.api_rate_bucket add column completed_at timestamptz;
create unique index api_rate_request_id on private.api_rate_bucket(request_id);
create unique index mcp_audit_request on public.audit_log(request_id) where source='mcp';
create function private.mcp_audit(t private.api_token,r uuid,act text,ok boolean,meta jsonb default '{}') returns void language sql set search_path='' as $$
 insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,outcome,metadata)
 values(t.workspace_id,'token',t.id,t.user_id,'mcp',r::text,act,case when ok then 'success' else 'failure' end,meta) on conflict (request_id) where source='mcp' do nothing
$$;
-- Existing mutation functions remain authoritative. Only the trusted service role
-- can set the request context, and only via the fixed dispatcher below.
create or replace function private.audit_mutation(w uuid,u uuid,act text,typ text,tid uuid,b jsonb,a jsonb) returns void language plpgsql set search_path='' as $$
declare rid text:=nullif(current_setting('entitygraph.mcp_request',true),''); tok text:=nullif(current_setting('entitygraph.mcp_token',true),'');
begin
 if current_setting('role',true)='service_role' and rid is not null and tok is not null then
  if not exists(select 1 from private.api_token t join private.api_rate_bucket q on q.token_id=t.id where t.id=tok::uuid and q.request_id=rid::uuid and q.completed_at is null and t.workspace_id=w and t.user_id=u) then raise exception 'FORBIDDEN'; end if;
  insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,before,after) values(w,'token',tok::uuid,u,'mcp',rid,act,typ,tid,'success',b,a);
 else
  insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,before,after) values(w,'user',u,u,'rpc',gen_random_uuid()::text,act,typ,tid,'success',b,a);
 end if;
end $$;
create function public.mcp_begin(p_digest text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.api_token; w uuid; n timestamptz:=clock_timestamp();
begin
 if p_request_id is null then raise exception 'VALIDATION_ERROR'; end if;
 if p_digest is not null and p_digest ~ '^[0-9a-f]{64}$' then
  select workspace_id into w from private.api_token where token_hash=decode(p_digest,'hex');
  if found then
   perform 1 from public.workspace where id=w for update;
   select * into t from private.api_token where token_hash=decode(p_digest,'hex') and workspace_id=w for update;
  end if;
 end if;
 if t.id is null or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=n) or not exists(select 1 from public.workspace_member where workspace_id=t.workspace_id and user_id=t.user_id) then
  insert into private.security_event_log(request_id,event) values(p_request_id,'invalid_mcp_credentials'); return jsonb_build_object('ok',false,'code','UNAUTHENTICATED');
 end if;
 -- Retain request tickets for a day, durable audit rows remain separate.
 delete from private.api_rate_bucket where token_id=t.id and at<n-interval '1 day';
 if (select count(*) from private.api_rate_bucket where token_id=t.id and at>n-interval '60 seconds')>=60 then
  perform private.mcp_audit(t,p_request_id,'mcp.rate_limit',false,jsonb_build_object('code','RATE_LIMITED')); return jsonb_build_object('ok',false,'code','RATE_LIMITED');
 end if;
 insert into private.api_rate_bucket(token_id,request_id,at) values(t.id,p_request_id,n);
 update private.api_token set last_used_at=n where id=t.id and (last_used_at is null or last_used_at<=n-interval '60 seconds');
 return jsonb_build_object('ok',true,'tokenId',t.id);
end $$;
create function public.mcp_dispatch(p_token_id uuid,p_request_id uuid,p_operation text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   else raise exception 'VALIDATION_ERROR';
  end case;
  if octet_length(result::text)>1000000 then raise exception 'RESULT_TOO_LARGE'; end if;
  if mut and not exists(select 1 from public.audit_log where request_id=p_request_id::text and source='mcp' and actor_id=t.id) then raise exception 'AUDIT_REQUIRED'; end if;
 exception when others then
  code:=case when sqlerrm like 'VALIDATION_ERROR%' or sqlstate in ('22P02','22007','22008','23514','23502') then 'VALIDATION_ERROR' when sqlstate='23505' then 'CONFLICT' when sqlerrm in ('NOT_FOUND','UNAUTHENTICATED','FORBIDDEN','VERSION_CONFLICT','TEMPLATE_NOT_FOUND','PREDICATE_NOT_FOUND','RELATION_KIND_MISMATCH','ARCHIVED_ENTITY','RESULT_TOO_LARGE') then sqlerrm when sqlerrm like 'CONFLICT:%' then 'CONFLICT' else 'INTERNAL_ERROR' end;
 end;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true); perform set_config('request.jwt.claims',coalesce(prior_claims,''),true); perform set_config('entitygraph.mcp_request',coalesce(prior_req,''),true); perform set_config('entitygraph.mcp_token',coalesce(prior_token,''),true);
 if code is not null then perform private.mcp_audit(t,p_request_id,'mcp.'||p_operation,false,jsonb_build_object('code',code)); else if not mut then perform private.mcp_audit(t,p_request_id,'mcp.'||p_operation,true); end if; end if;
 update private.api_rate_bucket set completed_at=clock_timestamp() where token_id=t.id and request_id=p_request_id;
 if code is not null then return jsonb_build_object('ok',false,'code',code); end if;
 return jsonb_build_object('ok',true,'result',result);
end $$;
-- Finalize protocol-only requests, including schema validation failures before tool dispatch.
create function public.mcp_finish(p_token_id uuid,p_request_id uuid,p_method text,p_ok boolean) returns void language plpgsql security definer set search_path='' as $$
declare t private.api_token; q private.api_rate_bucket; act text;
begin
 select * into t from private.api_token where id=p_token_id;
 select * into q from private.api_rate_bucket where token_id=p_token_id and request_id=p_request_id for update;
 if not found then raise exception 'INVALID_REQUEST_TICKET'; end if;
 if q.completed_at is not null then return; end if;
 act:=case when p_method in ('server/discover','tools/list','tools/call','resources/list','resources/templates/list','resources/read','ping') then p_method else 'other' end;
 perform private.mcp_audit(t,p_request_id,'mcp.'||act,coalesce(p_ok,false));
 update private.api_rate_bucket set completed_at=clock_timestamp() where token_id=p_token_id and request_id=p_request_id;
end $$;
revoke all on function private.mcp_audit(private.api_token,uuid,text,boolean,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.mcp_begin(text,uuid),public.mcp_dispatch(uuid,uuid,text,jsonb),public.mcp_finish(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mcp_begin(text,uuid),public.mcp_dispatch(uuid,uuid,text,jsonb),public.mcp_finish(uuid,uuid,text,boolean) to service_role;
