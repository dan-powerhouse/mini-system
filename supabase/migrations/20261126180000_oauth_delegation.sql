-- Delegated MCP access through the native Supabase OAuth 2.1 server
-- (docs/DELEGATED_AUTHORIZATION.md C01-C05).
--
-- An OAuth access token is identity only. Registry access additionally requires
-- an explicit, audited grant that a workspace member issues for one OAuth client,
-- listing exact operations, with an expiry. Every dispatch rechecks, in the same
-- transaction as the business operation: membership and current role, grant
-- (operation, expiry, revocation, optional App), confirmed native account,
-- registered client, live native session bound to that client and unrevoked
-- native consent.
--
-- Identity comes only from the JWT that PostgREST has already verified
-- (request.jwt.claims: sub, client_id, session_id). No caller-supplied user,
-- client or session identifier is accepted. No OAuth token becomes a direct
-- Registry session: domain RPCs keep rejecting OAuth principals directly.
--
-- Policy defaults (owner may tighten later):
--  * a member delegates only their own access, from a direct (non-OAuth) session,
--    and only to a client they have already consented to;
--  * expiry at most 90 days; mutations only for non-viewer roles;
--  * a new grant for the same workspace/user/client supersedes the active one;
--  * the grantee or a workspace owner/admin may revoke;
--  * template/predicate management (manage scope) is not delegable.

create table private.oauth_application_grant (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspace(id),
 user_id uuid not null references auth.users(id),
 client_id uuid not null,
 app_id uuid,
 operations text[] not null,
 created_at timestamptz not null default clock_timestamp(),
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id),
 foreign key(workspace_id,app_id) references public.entity(workspace_id,id),
 check(cardinality(operations) between 1 and 19 and array_position(operations,null) is null and operations <@ array[
  'search_entities','get_entity','traverse','resource_predicates','resource_template',
  'get_context','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views','get_entity_history',
  'create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation']::text[]),
 check(expires_at>created_at and expires_at<=created_at+interval '90 days'),
 check((revoked_at is null)=(revoked_by is null))
);
create unique index oauth_application_grant_active on private.oauth_application_grant(workspace_id,user_id,client_id) where revoked_at is null;
create index oauth_application_grant_lookup on private.oauth_application_grant(user_id,client_id) where revoked_at is null;
create index oauth_application_grant_created_by_idx on private.oauth_application_grant(created_by);
create index oauth_application_grant_revoked_by_idx on private.oauth_application_grant(revoked_by) where revoked_by is not null;
create index oauth_application_grant_app_idx on private.oauth_application_grant(workspace_id,app_id) where app_id is not null;

-- Per-request tickets: rolling rate limit and exactly-once audit binding.
create table private.oauth_request (
 grant_id uuid not null references private.oauth_application_grant(id),
 request_id uuid primary key,
 at timestamptz not null default clock_timestamp(),
 completed_at timestamptz
);
create index oauth_request_window on private.oauth_request(grant_id,at);
alter table private.oauth_application_grant enable row level security;
alter table private.oauth_request enable row level security;
revoke all on private.oauth_application_grant,private.oauth_request from public,anon,authenticated,service_role;

create function private.oauth_mutation(op text) returns boolean language sql immutable set search_path='' as $$
 select op in ('create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation')
$$;

-- Verified OAuth principal of the current request, or nulls.
create function private.oauth_principal(out u uuid,out c uuid,out s uuid) language plpgsql stable set search_path='' as $$
declare j jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
begin
 if j->>'role' is distinct from 'authenticated' or coalesce(j->>'is_anonymous','false')<>'false' then return; end if;
 begin u:=(j->>'sub')::uuid; c:=(j->>'client_id')::uuid; s:=(j->>'session_id')::uuid;
 exception when invalid_text_representation then u:=null; c:=null; s:=null; end;
end $$;

-- Full recheck (C01 candidate semantics); caller holds the workspace lock.
create function private.oauth_grant_check(w uuid,u uuid,c uuid,s uuid,op text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g private.oauth_application_grant; r public.workspace_role; n timestamptz:=clock_timestamp();
begin
 if w is null or u is null or c is null or s is null or op is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.workspace where id=w for share;
 select role into r from public.workspace_member where workspace_id=w and user_id=u for share;
 if r is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into g from private.oauth_application_grant where workspace_id=w and user_id=u and client_id=c and revoked_at is null for share;
 if not found or g.expires_at<=n or not(op=any(g.operations)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if r='viewer' and private.oauth_mutation(op) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if g.app_id is not null and not exists(select 1 from public.entity where workspace_id=w and id=g.app_id and kind='app' and status='active') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=u and not is_anonymous and deleted_at is null and (banned_until is null or banned_until<=n) and (email_confirmed_at is not null or phone_confirmed_at is not null)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from auth.oauth_clients where id=c and deleted_at is null) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from auth.sessions where id=s and user_id=u and oauth_client_id=c and (not_after is null or not_after>n)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from auth.oauth_consents where user_id=u and client_id=c and revoked_at is null) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return g.id;
end $$;

create function private.oauth_audit(g private.oauth_application_grant,r uuid,act text,ok boolean,meta jsonb default '{}') returns void language sql set search_path='' as $$
 insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,outcome,metadata)
 values(g.workspace_id,'token',g.id,g.user_id,'mcp',r::text,act,case when ok then 'success' else 'failure' end,meta||jsonb_build_object('oauthClientId',g.client_id))
 on conflict (request_id) where source='mcp' do nothing
$$;

-- Domain mutations called inside the OAuth dispatcher are attributed to the grant.
create or replace function private.audit_mutation(w uuid,u uuid,act text,typ text,tid uuid,b jsonb,a jsonb) returns void language plpgsql set search_path='' as $$
declare rid text:=nullif(current_setting('entitygraph.mcp_request',true),''); tok text:=nullif(current_setting('entitygraph.mcp_token',true),''); og text:=nullif(current_setting('entitygraph.oauth_grant',true),''); cid uuid;
begin
 if current_setting('role',true)='service_role' and rid is not null and tok is not null then
  if not exists(select 1 from private.api_token t join private.api_rate_bucket q on q.token_id=t.id where t.id=tok::uuid and q.request_id=rid::uuid and q.completed_at is null and t.workspace_id=w and t.user_id=u) then raise exception 'FORBIDDEN'; end if;
  insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,before,after) values(w,'token',tok::uuid,u,'mcp',rid,act,typ,tid,'success',b,a);
 elsif rid is not null and og is not null then
  select g.client_id into cid from private.oauth_application_grant g join private.oauth_request q on q.grant_id=g.id where g.id=og::uuid and q.request_id=rid::uuid and q.completed_at is null and g.workspace_id=w and g.user_id=u and g.revoked_at is null;
  if not found then raise exception 'FORBIDDEN'; end if;
  insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,before,after,metadata) values(w,'token',og::uuid,u,'mcp',rid,act,typ,tid,'success',b,a,jsonb_build_object('oauthClientId',cid));
 else
  insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,before,after) values(w,'user',u,u,'rpc',gen_random_uuid()::text,act,typ,tid,'success',b,a);
 end if;
end $$;

-- Grant lifecycle (direct sessions only; OAuth tokens cannot manage grants).
create function public.oauth_grant_issue(p_workspace_id uuid,p_client_id uuid,p_operations text[],p_expires_at timestamptz,p_app_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.workspace_role; old private.oauth_application_grant; g private.oauth_application_grant; n timestamptz:=clock_timestamp();
begin
 if not private.registry_direct_principal() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 perform 1 from public.workspace where id=p_workspace_id for update;
 select role into r from public.workspace_member where workspace_id=p_workspace_id and user_id=u;
 if r is null then raise exception 'NOT_FOUND'; end if;
 if p_client_id is null or p_operations is null or p_expires_at is null or p_expires_at<=n or p_expires_at>n+interval '90 days'
    or cardinality(p_operations)<>(select count(distinct x) from unnest(p_operations) x) then raise exception 'VALIDATION_ERROR: grant'; end if;
 if r='viewer' and exists(select 1 from unnest(p_operations) x where private.oauth_mutation(x)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from auth.oauth_clients where id=p_client_id and deleted_at is null)
    or not exists(select 1 from auth.oauth_consents where user_id=u and client_id=p_client_id and revoked_at is null) then raise exception 'NOT_FOUND'; end if;
 if p_app_id is not null and not exists(select 1 from public.entity where workspace_id=p_workspace_id and id=p_app_id and kind='app' and status='active') then raise exception 'VALIDATION_ERROR: app'; end if;
 select * into old from private.oauth_application_grant where workspace_id=p_workspace_id and user_id=u and client_id=p_client_id and revoked_at is null for update;
 if found then
  update private.oauth_application_grant set revoked_at=n,revoked_by=u where id=old.id;
  perform private.audit_mutation(p_workspace_id,u,'oauth_grant.supersede','oauth_grant',old.id,to_jsonb(old),null);
 end if;
 insert into private.oauth_application_grant(workspace_id,user_id,client_id,app_id,operations,created_by,created_at,expires_at)
 values(p_workspace_id,u,p_client_id,p_app_id,p_operations,u,n,p_expires_at) returning * into g;
 perform private.audit_mutation(p_workspace_id,u,'oauth_grant.issue','oauth_grant',g.id,null,to_jsonb(g));
 return to_jsonb(g);
exception when check_violation then raise exception 'VALIDATION_ERROR: grant';
end $$;

create function public.oauth_grant_revoke(p_workspace_id uuid,p_grant_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b private.oauth_application_grant; a private.oauth_application_grant;
begin
 if not private.registry_direct_principal() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 perform 1 from public.workspace where id=p_workspace_id for update;
 select * into b from private.oauth_application_grant where workspace_id=p_workspace_id and id=p_grant_id for update;
 if not found or not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=u) then raise exception 'NOT_FOUND'; end if;
 if b.user_id<>u and not private.can_admin(p_workspace_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if b.revoked_at is not null then return; end if;
 update private.oauth_application_grant set revoked_at=clock_timestamp(),revoked_by=u where id=b.id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'oauth_grant.revoke','oauth_grant',a.id,to_jsonb(b),to_jsonb(a));
end $$;

create function public.oauth_grant_list(p_workspace_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.registry_direct_principal() or not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 return query select to_jsonb(g)||jsonb_build_object('clientName',c.client_name)
  from private.oauth_application_grant g left join auth.oauth_clients c on c.id=g.client_id
  where g.workspace_id=p_workspace_id and (g.user_id=auth.uid() or private.can_admin(p_workspace_id))
  order by g.created_at desc,g.id;
end $$;

-- Workspaces this OAuth principal may use (for the MCP handshake and workspace choice).
create function public.mcp_oauth_session() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p record; n timestamptz:=clock_timestamp();
begin
 select * into p from private.oauth_principal();
 if p.u is null or p.c is null or p.s is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
 if not exists(select 1 from auth.sessions where id=p.s and user_id=p.u and oauth_client_id=p.c and (not_after is null or not_after>n))
    or not exists(select 1 from auth.oauth_consents where user_id=p.u and client_id=p.c and revoked_at is null) then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
 return jsonb_build_object('ok',true,'workspaces',coalesce((select jsonb_agg(jsonb_build_object('workspaceId',g.workspace_id,'operations',to_jsonb(g.operations),'expiresAt',g.expires_at) order by g.workspace_id)
  from private.oauth_application_grant g join public.workspace_member m on m.workspace_id=g.workspace_id and m.user_id=g.user_id
  where g.user_id=p.u and g.client_id=p.c and g.revoked_at is null and g.expires_at>n),'[]'));
end $$;

-- The single OAuth dispatcher. Same fixed operation set and domain RPCs as
-- mcp_dispatch; identity from the verified JWT only.
create function public.mcp_oauth_dispatch(p_request_id uuid,p_operation text,p_args jsonb,p_workspace_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p record; w uuid:=p_workspace_id; g private.oauth_application_grant; r public.workspace_role; result jsonb; code text; mut boolean; scopes text[]; k int;
 prior_sub text; prior_claims text; prior_req text; prior_grant text; n timestamptz:=clock_timestamp();
begin
 select * into p from private.oauth_principal();
 if p.u is null or p.c is null or p.s is null or p_request_id is null then return jsonb_build_object('ok',false,'code','UNAUTHENTICATED'); end if;
 if p_operation is null or jsonb_typeof(p_args) is distinct from 'object' then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 if w is null then
  select count(*),min(workspace_id::text)::uuid into k,w from private.oauth_application_grant where user_id=p.u and client_id=p.c and revoked_at is null and expires_at>n;
  if k>1 then return jsonb_build_object('ok',false,'code','WORKSPACE_REQUIRED'); end if;
  if w is null then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 end if;
 mut:=private.oauth_mutation(p_operation);
 -- Mutations take the workspace write lock first (same order as require_write).
 if mut then perform 1 from public.workspace where id=w for update; else perform 1 from public.workspace where id=w for share; end if;
 begin
  select * into g from private.oauth_application_grant where id=private.oauth_grant_check(w,p.u,p.c,p.s,p_operation);
 exception when insufficient_privilege then
  -- Audit the refusal against the member's active grant when one exists;
  -- otherwise record it as a security event (no workspace actor to attribute).
  select * into g from private.oauth_application_grant where workspace_id=w and user_id=p.u and client_id=p.c and revoked_at is null;
  if found then perform private.oauth_audit(g,p_request_id,'mcp.'||left(p_operation,64),false,jsonb_build_object('code','FORBIDDEN'));
  else insert into private.security_event_log(request_id,event,metadata) values(p_request_id,'oauth_grant_denied',jsonb_build_object('operation',left(p_operation,64)));
  end if;
  return jsonb_build_object('ok',false,'code','FORBIDDEN');
 end;
 delete from private.oauth_request where grant_id=g.id and at<n-interval '1 day';
 if (select count(*) from private.oauth_request where grant_id=g.id and at>n-interval '60 seconds')>=60 then
  perform private.oauth_audit(g,p_request_id,'mcp.rate_limit',false,jsonb_build_object('code','RATE_LIMITED'));
  return jsonb_build_object('ok',false,'code','RATE_LIMITED');
 end if;
 begin
  insert into private.oauth_request(grant_id,request_id,at) values(g.id,p_request_id,n);
 exception when unique_violation then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end;
 select role into r from public.workspace_member where workspace_id=w and user_id=p.u;
 scopes:=case when exists(select 1 from unnest(g.operations) x where private.oauth_mutation(x)) then array['read','write'] else array['read'] end;
 prior_sub:=current_setting('request.jwt.claim.sub',true); prior_claims:=current_setting('request.jwt.claims',true); prior_req:=current_setting('entitygraph.mcp_request',true); prior_grant:=current_setting('entitygraph.oauth_grant',true);
 begin
  -- Run the domain RPCs as the member's direct principal for this statement only.
  perform set_config('request.jwt.claim.sub',p.u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p.u,'role','authenticated')::text,true);
  perform set_config('entitygraph.mcp_request',p_request_id::text,true);
  perform set_config('entitygraph.oauth_grant',g.id::text,true);
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
   when 'resource_predicates' then select coalesce(jsonb_agg(to_jsonb(x) order by name),'[]') into result from public.predicate_registry x where workspace_id=w;
   when 'resource_template' then select to_jsonb(x) into result from public.type_templates x where workspace_id=w and kind::text=p_args->>'kind' and type=p_args->>'type'; if result is null then raise exception 'NOT_FOUND'; end if;
   when 'get_context','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views' then result:=private.mcp_read_tool(w,p.u,r,scopes,p_operation,p_args);
   when 'get_entity_history' then result:=private.mcp_golden_tool(w,p.u,r,scopes,p_operation,p_args);
   else raise exception 'VALIDATION_ERROR';
  end case;
  if octet_length(result::text)>1000000 then raise exception 'RESULT_TOO_LARGE'; end if;
  if mut and not exists(select 1 from public.audit_log where request_id=p_request_id::text and source='mcp' and actor_id=g.id) then raise exception 'AUDIT_REQUIRED'; end if;
 exception when others then
  code:=case when sqlerrm like 'VALIDATION_ERROR%' or sqlstate in ('22P02','22007','22008','23514','23502') then 'VALIDATION_ERROR' when sqlstate='23505' then 'CONFLICT' when sqlerrm in ('NOT_FOUND','UNAUTHENTICATED','FORBIDDEN','VERSION_CONFLICT','TEMPLATE_NOT_FOUND','PREDICATE_NOT_FOUND','RELATION_KIND_MISMATCH','ARCHIVED_ENTITY','RESULT_TOO_LARGE','PATH_NOT_CONFIGURED') then sqlerrm when sqlerrm like 'CONFLICT:%' then 'CONFLICT' else 'INTERNAL_ERROR' end;
 end;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true); perform set_config('request.jwt.claims',coalesce(prior_claims,''),true); perform set_config('entitygraph.mcp_request',coalesce(prior_req,''),true); perform set_config('entitygraph.oauth_grant',coalesce(prior_grant,''),true);
 if code is not null then perform private.oauth_audit(g,p_request_id,'mcp.'||p_operation,false,jsonb_build_object('code',code)); elsif not mut then perform private.oauth_audit(g,p_request_id,'mcp.'||p_operation,true); end if;
 update private.oauth_request set completed_at=clock_timestamp() where request_id=p_request_id;
 if code is not null then return jsonb_build_object('ok',false,'code',code); end if;
 return jsonb_build_object('ok',true,'workspaceId',w,'result',result);
end $$;

revoke all on function private.oauth_mutation(text),private.oauth_principal(),private.oauth_grant_check(uuid,uuid,uuid,uuid,text),private.oauth_audit(private.oauth_application_grant,uuid,text,boolean,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.oauth_grant_issue(uuid,uuid,text[],timestamptz,uuid),public.oauth_grant_revoke(uuid,uuid),public.oauth_grant_list(uuid),public.mcp_oauth_session(),public.mcp_oauth_dispatch(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.oauth_grant_issue(uuid,uuid,text[],timestamptz,uuid),public.oauth_grant_revoke(uuid,uuid),public.oauth_grant_list(uuid),public.mcp_oauth_session(),public.mcp_oauth_dispatch(uuid,text,jsonb,uuid) to authenticated;
