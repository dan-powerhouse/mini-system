-- Operational storage only. No dispatch, publication or execution API grants.
-- Composite foreign keys enforce workspace and Registry kind at the database boundary.
alter table public.entity add constraint entity_workspace_id_kind_unique unique(workspace_id,id,kind);
create table public.process_kind_version (
 workspace_id uuid not null,
 process_kind_id uuid not null,
 registry_kind public.entity_kind not null default 'process_kind' check(registry_kind='process_kind'),
 version integer not null check(version>0),
 package_path text not null check(length(btrim(package_path))>0),
 package_sha256 text not null check(package_sha256 ~ '^[0-9a-f]{64}$'),
 specification jsonb not null check(jsonb_typeof(specification)='object'),
 published_at timestamptz not null default now(),
 published_by uuid not null references auth.users(id),
 primary key(workspace_id,process_kind_id,version),
 foreign key(workspace_id,process_kind_id,registry_kind) references public.entity(workspace_id,id,kind)
);
create function private.immutable_process_kind_version() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'PUBLISHED_STANDARD_IMMUTABLE'; end $$;
create trigger immutable_process_kind_version before update or delete on public.process_kind_version for each row execute function private.immutable_process_kind_version();
create type public.process_status as enum ('created','queued','running','retry_waiting','succeeded','failed','cancelled');
create table public.process (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 process_kind_id uuid not null, process_kind_version integer not null,
 requested_by uuid not null, requested_by_kind public.entity_kind not null check(requested_by_kind in ('person','agent','app')),
 assigned_agent_id uuid, assigned_agent_kind public.entity_kind not null default 'agent' check(assigned_agent_kind='agent'),
 assigned_edge_id text check(assigned_edge_id is null or length(btrim(assigned_edge_id))>0),
 status public.process_status not null default 'created', priority integer not null default 0 check(priority between 0 and 100),
 inputs jsonb not null default '{}' check(jsonb_typeof(inputs)='object'), outputs jsonb check(outputs is null or jsonb_typeof(outputs)='object'),
 progress numeric not null default 0 check(progress between 0 and 100),
 attempt_count integer not null default 0, max_attempts integer not null default 1 check(max_attempts>0),
 idempotency_key text not null check(length(btrim(idempotency_key)) between 1 and 256),
 created_at timestamptz not null default now(), scheduled_at timestamptz, started_at timestamptz, heartbeat_at timestamptz, completed_at timestamptz,
 updated_at timestamptz not null default now(), error jsonb check(error is null or jsonb_typeof(error)='object'), version integer not null default 1 check(version>0),
 unique(workspace_id,id), unique(workspace_id,idempotency_key),
 foreign key(workspace_id,process_kind_id,process_kind_version) references public.process_kind_version(workspace_id,process_kind_id,version),
 foreign key(workspace_id,requested_by,requested_by_kind) references public.entity(workspace_id,id,kind),
 foreign key(workspace_id,assigned_agent_id,assigned_agent_kind) references public.entity(workspace_id,id,kind),
 check(attempt_count between 0 and max_attempts),
 check((status in ('succeeded','failed','cancelled'))=(completed_at is not null)),
 check(status not in ('running','retry_waiting','succeeded','failed') or (started_at is not null and attempt_count>0)),
 check(status<>'retry_waiting' or attempt_count<max_attempts),
 check(status<>'succeeded' or progress=100),
 check(started_at is null or started_at>=created_at),
 check(heartbeat_at is null or (started_at is not null and heartbeat_at>=started_at)),
 check(completed_at is null or (completed_at>=created_at and (started_at is null or completed_at>=started_at))),
 check(updated_at>=created_at)
);
create index process_queue_lookup on public.process(workspace_id,status,priority desc,scheduled_at,id);
create index process_standard_lookup on public.process(workspace_id,process_kind_id,process_kind_version);
create function private.process_identity_invariants() returns trigger language plpgsql set search_path='' as $$
begin
 if (old.id,old.workspace_id,old.process_kind_id,old.process_kind_version,old.requested_by,old.requested_by_kind,old.idempotency_key,old.created_at) is distinct from (new.id,new.workspace_id,new.process_kind_id,new.process_kind_version,new.requested_by,new.requested_by_kind,new.idempotency_key,new.created_at) then raise exception 'PROCESS_IDENTITY_IMMUTABLE'; end if;
 if new.version<>old.version+1 then raise exception 'VERSION_CONFLICT'; end if;
 return new;
end $$;
create trigger process_identity_invariants before update on public.process for each row execute function private.process_identity_invariants();
alter table public.process_kind_version enable row level security;
alter table public.process enable row level security;
-- Deny all application access until audited publishing and execution authorization are implemented.
revoke all on public.process_kind_version,public.process from public,anon,authenticated,service_role;
revoke all on function private.immutable_process_kind_version(),private.process_identity_invariants() from public,anon,authenticated,service_role;
