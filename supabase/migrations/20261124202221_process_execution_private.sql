-- Optional native execution provisioning candidate. Run only after
-- execution-native.sql and after reviewing §14 decisions; no client grants.
-- PGMQ is the transport; process and attempt rows are authoritative.
-- Ack-at-claim and explicit recovery are candidate policies, not automatic retries.

create table private.process_request(
 workspace_id uuid not null, process_id uuid primary key, request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 foreign key(workspace_id,process_id) references public.process(workspace_id,id)
);
alter table private.process_request enable row level security;
revoke all on private.process_request from public,anon,authenticated,service_role;
create table private.process_delivery(
 workspace_id uuid not null, process_id uuid primary key, message_id bigint not null unique,
 foreign key(workspace_id,process_id) references public.process(workspace_id,id)
);
create table private.process_attempt(
 workspace_id uuid not null, process_id uuid not null, attempt_no int not null check(attempt_no>0),
 edge_id text not null, fence uuid not null unique, lease_until timestamptz not null,
 started_at timestamptz not null, finished_at timestamptz, outcome text check(outcome in ('succeeded','failed','expired','cancelled')),
 completion_id uuid, completion_hash text, completion_result jsonb,
 primary key(process_id,attempt_no),
 foreign key(workspace_id,process_id) references public.process(workspace_id,id),
 check((outcome is null)=(finished_at is null)),
 check((completion_id is null)=(completion_hash is null) and (completion_id is null)=(completion_result is null))
);
create unique index process_one_open_attempt on private.process_attempt(process_id) where finished_at is null;
create index process_lease_expiry on private.process_attempt(lease_until) where finished_at is null;
create table private.process_event(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, process_id uuid not null,
 at timestamptz not null default clock_timestamp(), actor_user_id uuid, edge_id text,
 action text not null, before_status public.process_status, after_status public.process_status not null,
 version int not null, attempt_no int not null,
 foreign key(workspace_id,process_id) references public.process(workspace_id,id)
);
create index process_event_history on private.process_event(workspace_id,process_id,at,id);
alter table private.process_delivery enable row level security;
alter table private.process_attempt enable row level security;
alter table private.process_event enable row level security;
revoke all on private.process_delivery,private.process_attempt,private.process_event from public,anon,authenticated,service_role;

create function private.process_record_event(p public.process,p_previous public.process_status,p_action text,p_user uuid default null,p_edge text default null)
returns void language sql set search_path='' as $$
 insert into private.process_event(workspace_id,process_id,actor_user_id,edge_id,action,before_status,after_status,version,attempt_no)
 values(p.workspace_id,p.id,p_user,p_edge,p_action,p_previous,p.status,p.version,p.attempt_count)
$$;

-- Future Center adapter must verify that requested_by represents its principal.
-- Admin membership is a conservative internal candidate, not an exposed API.
create function private.process_create(p_workspace_id uuid,p_kind_id uuid,p_kind_version int,
 p_requester_id uuid,p_requester_kind public.entity_kind,p_key text,p_inputs jsonb,
 p_agent_id uuid default null,p_edge_id text default null,p_priority int default 0,
 p_max_attempts int default 1,p_scheduled_at timestamptz default null)
returns public.process language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); p public.process; digest text;
begin
 if p_key is null or length(btrim(p_key)) not between 1 and 256 or p_key<>btrim(p_key)
 or jsonb_typeof(p_inputs) is distinct from 'object' or octet_length(p_inputs::text)>1048576
 or p_priority is null or p_priority not between 0 and 100 or p_max_attempts is null or p_max_attempts<1
 or (p_edge_id is not null and (length(btrim(p_edge_id)) not between 1 and 256 or p_edge_id<>btrim(p_edge_id)))
 or p_requester_kind is null or p_requester_kind not in ('person','agent','app')
 then raise exception 'VALIDATION_ERROR: process'; end if;
 digest:=encode(extensions.digest(jsonb_build_object('kind',p_kind_id,'kindVersion',p_kind_version,
 'requester',p_requester_id,'requesterKind',p_requester_kind,'inputs',p_inputs,'agent',p_agent_id,'edge',p_edge_id,
 'priority',p_priority,'maxAttempts',p_max_attempts,'scheduledEpoch',extract(epoch from p_scheduled_at))::text,'sha256'),'hex');
 select * into p from public.process where workspace_id=p_workspace_id and idempotency_key=p_key;
 if found then
  if not exists(select 1 from private.process_request r where r.process_id=p.id and r.request_hash=digest) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return p;
 end if;
 if not exists(select 1 from public.process_kind_version v join public.entity k on (k.workspace_id,k.id)=(v.workspace_id,v.process_kind_id)
 where v.workspace_id=p_workspace_id and v.process_kind_id=p_kind_id and v.version=p_kind_version and k.status='active')
 then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from public.entity where workspace_id=p_workspace_id and id=p_requester_id and kind=p_requester_kind and status='active')
 or (p_agent_id is not null and not exists(select 1 from public.entity where workspace_id=p_workspace_id and id=p_agent_id and kind='agent' and status='active'))
 then raise exception 'NOT_FOUND'; end if;
 insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,idempotency_key,inputs,assigned_agent_id,assigned_edge_id,priority,max_attempts,scheduled_at)
 values(p_workspace_id,p_kind_id,p_kind_version,p_requester_id,p_requester_kind,p_key,p_inputs,p_agent_id,p_edge_id,p_priority,p_max_attempts,p_scheduled_at) returning * into p;
 insert into private.process_request values(p.workspace_id,p.id,digest);
 perform private.process_record_event(p,null,'process.create',u);
 return p;
end $$;

create function private.process_dispatch(p_workspace_id uuid,p_process_id uuid,p_expected_version int)
returns public.process language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); p public.process; prior public.process_status; msg bigint;
begin
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status='queued' and exists(select 1 from private.process_delivery where process_id=p.id) then
  if p_expected_version is null or p_expected_version not in (p.version,p.version-1) then raise exception 'VERSION_CONFLICT'; end if;
  return p;
 end if;
 if p.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if p.status not in ('created','retry_waiting') or p.attempt_count>=p.max_attempts
 or (p.scheduled_at is not null and p.scheduled_at>clock_timestamp()) then raise exception 'INVALID_PROCESS_STATE'; end if;
 prior:=p.status;
 select pgmq.send('entitygraph_process',jsonb_build_object('processId',p.id)) into strict msg;
 insert into private.process_delivery values(p.workspace_id,p.id,msg);
 update public.process set status='queued',updated_at=clock_timestamp(),version=version+1 where id=p.id returning * into p;
 perform private.process_record_event(p,prior,'process.dispatch',u);
 return p;
end $$;

-- An authorized dispatcher (not a Registry entity) must select the target Process.
-- This private function consumes only the matching native PGMQ message.
create function private.process_claim(p_workspace_id uuid,p_process_id uuid,p_edge_id text,p_lease_seconds int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.process; a private.process_attempt; msg record; expected bigint; t timestamptz; found_message boolean:=false;
begin
 if p_edge_id is null or length(btrim(p_edge_id)) not between 1 and 256 or p_edge_id<>btrim(p_edge_id)
 or p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then raise exception 'VALIDATION_ERROR: lease'; end if;
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status<>'queued' then
  -- A redelivered message for a running or terminal Process must never create
  -- another attempt. Reconcile visible stale messages in a bounded transaction.
  for i in 1..16 loop
   select * into msg from pgmq.read('entitygraph_process',p_lease_seconds,1,jsonb_build_object('processId',p.id));
   if not found then exit; end if;
   if not pgmq.delete('entitygraph_process',msg.msg_id) then raise exception 'QUEUE_ACK_FAILED'; end if;
  end loop;
  return null;
 end if;
 if p.attempt_count>=p.max_attempts then raise exception 'INVALID_PROCESS_STATE'; end if;
 if p.assigned_edge_id is not null and p.assigned_edge_id<>p_edge_id then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select message_id into expected from private.process_delivery where process_id=p.id;
 if expected is null then raise exception 'QUEUE_RECONCILIATION_REQUIRED'; end if;
 -- Native queue may redeliver; unexpected duplicate messages are discarded.
 for i in 1..16 loop
  select * into msg from pgmq.read('entitygraph_process',p_lease_seconds,1,jsonb_build_object('processId',p.id));
  if not found then exit; end if;
  if not pgmq.delete('entitygraph_process',msg.msg_id) then raise exception 'QUEUE_ACK_FAILED'; end if;
  if msg.msg_id=expected then found_message:=true; exit; end if;
 end loop;
 if not found_message then return null; end if;
 -- Queue acknowledgement and the durable running lease commit together.
 delete from private.process_delivery where process_id=p.id;
 t:=clock_timestamp();
 update public.process set status='running',assigned_edge_id=p_edge_id,
  attempt_count=attempt_count+1,progress=0,started_at=coalesce(started_at,t),heartbeat_at=t,
  updated_at=t,error=null,version=version+1 where id=p.id returning * into p;
 insert into private.process_attempt(workspace_id,process_id,attempt_no,edge_id,fence,lease_until,started_at)
 values(p.workspace_id,p.id,p.attempt_count,p_edge_id,gen_random_uuid(),t+make_interval(secs=>p_lease_seconds),t) returning * into a;
 perform private.process_record_event(p,'queued','process.claim',null,p_edge_id);
 return jsonb_build_object('process',to_jsonb(p),'fence',a.fence,'leaseUntil',a.lease_until);
end $$;

create function private.process_heartbeat(p_workspace_id uuid,p_process_id uuid,p_fence uuid,p_progress numeric,p_lease_seconds int)
returns public.process language plpgsql security definer set search_path='' as $$
declare p public.process; a private.process_attempt; t timestamptz;
begin
 if p_progress is null or p_progress not between 0 and 100 or p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then raise exception 'VALIDATION_ERROR: heartbeat'; end if;
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into a from private.process_attempt where process_id=p.id and attempt_no=p.attempt_count;
 t:=clock_timestamp();
 if p.status<>'running' or p_fence is null or a.fence is null or a.fence is distinct from p_fence or a.finished_at is not null or a.lease_until<=t then raise exception 'LEASE_LOST'; end if;
 if p_progress<p.progress then raise exception 'VALIDATION_ERROR: progress regression'; end if;
 update private.process_attempt set lease_until=greatest(lease_until,t+make_interval(secs=>p_lease_seconds)) where process_id=p.id and attempt_no=p.attempt_count;
 update public.process set progress=p_progress,heartbeat_at=t,updated_at=t,version=version+1 where id=p.id returning * into p;
 perform private.process_record_event(p,'running','process.heartbeat',null,a.edge_id);
 return p;
end $$;

create function private.process_finish(p_workspace_id uuid,p_process_id uuid,p_fence uuid,p_completion_id uuid,
 p_success boolean,p_outputs jsonb default null,p_error jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.process; a private.process_attempt; t timestamptz; digest text; next_status public.process_status; result jsonb;
begin
 if p_fence is null or p_completion_id is null or p_success is null
 or (p_success and (jsonb_typeof(p_outputs) is distinct from 'object' or p_error is not null))
 or (not p_success and (jsonb_typeof(p_error) is distinct from 'object' or p_outputs is not null))
 or octet_length(coalesce(p_outputs,p_error)::text)>1048576 then raise exception 'VALIDATION_ERROR: completion'; end if;
 digest:=encode(extensions.digest(jsonb_build_object('success',p_success,'outputs',p_outputs,'error',p_error)::text,'sha256'),'hex');
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into a from private.process_attempt where process_id=p.id and fence=p_fence;
 if a.completion_id=p_completion_id then
  if a.completion_hash is distinct from digest then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return a.completion_result;
 end if;
 t:=clock_timestamp();
 if p.status<>'running' or a.fence is distinct from p_fence or a.attempt_no<>p.attempt_count or a.finished_at is not null or a.lease_until<=t
 then raise exception 'LEASE_LOST'; end if;
 next_status:=case when p_success then 'succeeded'::public.process_status when p.attempt_count<p.max_attempts then 'retry_waiting'::public.process_status else 'failed'::public.process_status end;
 update public.process set status=next_status,outputs=p_outputs,error=p_error,
 progress=case when p_success then 100 else progress end,completed_at=case when next_status in ('succeeded','failed') then t end,
 updated_at=t,version=version+1 where id=p.id returning * into p;
 result:=jsonb_build_object('processId',p.id,'status',p.status,'version',p.version,'attempt',p.attempt_count);
 update private.process_attempt set finished_at=t,outcome=case when p_success then 'succeeded' else 'failed' end,
 completion_id=p_completion_id,completion_hash=digest,completion_result=result where process_id=p.id and attempt_no=p.attempt_count;
 perform private.process_record_event(p,'running','process.finish',null,a.edge_id);
 return result;
end $$;

-- No automatic retry; a trusted recovery caller marks an expired attempt and
-- an explicit Center dispatch may later enqueue the same Process ID.
create function private.process_expire(p_workspace_id uuid,p_process_id uuid)
returns public.process language plpgsql security definer set search_path='' as $$
declare p public.process; a private.process_attempt; t timestamptz; next_status public.process_status;
begin
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status<>'running' then return p; end if;
 select * into a from private.process_attempt where process_id=p.id and attempt_no=p.attempt_count;
 t:=clock_timestamp();
 if a.fence is null or a.finished_at is not null then raise exception 'LEASE_INVARIANT'; end if;
 if a.lease_until>t then return p; end if;
 next_status:=case when p.attempt_count<p.max_attempts then 'retry_waiting'::public.process_status else 'failed'::public.process_status end;
 update private.process_attempt set finished_at=t,outcome='expired' where process_id=p.id and attempt_no=p.attempt_count;
 update public.process set status=next_status,error='{"code":"LEASE_EXPIRED"}',completed_at=case when next_status='failed' then t end,updated_at=t,version=version+1 where id=p.id returning * into p;
 perform private.process_record_event(p,'running','process.expire',null,a.edge_id);
 return p;
end $$;

create function private.process_cancel(p_workspace_id uuid,p_process_id uuid,p_expected_version int)
returns public.process language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); p public.process; old_status public.process_status; msg bigint; t timestamptz;
begin
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status='cancelled' then return p; end if;
 if p.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if p.status in ('succeeded','failed') then raise exception 'INVALID_PROCESS_STATE'; end if;
 old_status:=p.status; t:=clock_timestamp();
 select message_id into msg from private.process_delivery where process_id=p.id;
 if msg is not null then perform pgmq.delete('entitygraph_process',msg); delete from private.process_delivery where process_id=p.id; end if;
 if p.status='running' then update private.process_attempt set finished_at=t,outcome='cancelled' where process_id=p.id and attempt_no=p.attempt_count and finished_at is null; end if;
 update public.process set status='cancelled',completed_at=t,updated_at=t,version=version+1 where id=p.id returning * into p;
 perform private.process_record_event(p,old_status,'process.cancel',u);
 return p;
end $$;

-- Explicit repair of a queued delivery whose native message was lost. State
-- remains queued; the old message is removed before creating the replacement.
create function private.process_reconcile(p_workspace_id uuid,p_process_id uuid,p_expected_version int)
returns public.process language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); p public.process; msg bigint;
begin
 select * into p from public.process where workspace_id=p_workspace_id and id=p_process_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if p.status<>'queued' then raise exception 'INVALID_PROCESS_STATE'; end if;
 select message_id into msg from private.process_delivery where process_id=p.id;
 if msg is not null then perform pgmq.delete('entitygraph_process',msg); delete from private.process_delivery where process_id=p.id; end if;
 select pgmq.send('entitygraph_process',jsonb_build_object('processId',p.id)) into strict msg;
 insert into private.process_delivery values(p.workspace_id,p.id,msg);
 update public.process set updated_at=clock_timestamp(),version=version+1 where id=p.id returning * into p;
 perform private.process_record_event(p,'queued','process.reconcile',u);
 return p;
end $$;

-- No worker, browser, service-role or MCP access is activated here.
revoke all on function private.process_record_event(public.process,public.process_status,text,uuid,text),
 private.process_create(uuid,uuid,int,uuid,public.entity_kind,text,jsonb,uuid,text,int,int,timestamptz),
 private.process_dispatch(uuid,uuid,int),private.process_claim(uuid,uuid,text,int),
 private.process_heartbeat(uuid,uuid,uuid,numeric,int),private.process_finish(uuid,uuid,uuid,uuid,boolean,jsonb,jsonb),
 private.process_expire(uuid,uuid),private.process_cancel(uuid,uuid,int),private.process_reconcile(uuid,uuid,int)
 from public,anon,authenticated,service_role;
