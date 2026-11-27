-- First slice only. No direct client DML; additional mutation RPCs arrive with tests.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
create type public.entity_kind as enum ('person','object','process_kind','agent','app');
create type public.entity_status as enum ('active','inactive','archived');
create type public.workspace_role as enum ('owner','admin','editor','viewer');
create table public.workspace (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 300),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), stale_process_kind_days int not null default 90 check (stale_process_kind_days>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workspace_member (
 workspace_id uuid not null references public.workspace(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict, role public.workspace_role not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(workspace_id,user_id)
);
create unique index workspace_one_owner on public.workspace_member(workspace_id) where role='owner';
create index workspace_member_user on public.workspace_member(user_id,workspace_id);
-- Exactly one owner at transaction end; bootstrap and future transfer are atomic.
create function private.check_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 if tg_table_name='workspace' then w:=new.id; elsif tg_op='DELETE' then w:=old.workspace_id; else w:=new.workspace_id; end if;
 if tg_table_name='workspace_member' and tg_op='UPDATE' then
  if old.workspace_id<>new.workspace_id or old.user_id<>new.user_id then raise exception 'MEMBERSHIP_ID_IMMUTABLE'; end if;
 end if;
 if exists(select 1 from public.workspace where id=w) and (select count(*) from public.workspace_member where workspace_id=w and role='owner')<>1 then raise exception 'LAST_OWNER'; end if;
 return null;
end $$;
create constraint trigger workspace_owner_check after insert on public.workspace deferrable initially deferred for each row execute function private.check_owner();
create constraint trigger membership_owner_check after insert or update or delete on public.workspace_member deferrable initially deferred for each row execute function private.check_owner();
create table public.type_templates (
 workspace_id uuid not null references public.workspace(id) on delete restrict, kind public.entity_kind not null,
 type text not null check(type ~ '^[a-z][a-z0-9_]*$'), version int not null default 1 check(version>=1),
 fields jsonb not null default '[]' check(jsonb_typeof(fields)='array'), updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 primary key(workspace_id,kind,type)
);
create table public.predicate_registry (
 workspace_id uuid not null references public.workspace(id) on delete restrict, name text not null check(name ~ '^[a-z][a-z0-9_]*$'),
 from_kinds public.entity_kind[] not null check(cardinality(from_kinds)>0 and array_position(from_kinds,null) is null),
 to_kinds public.entity_kind[] not null check(cardinality(to_kinds)>0 and array_position(to_kinds,null) is null),
 directed boolean not null default true, symmetric_helper text, description text not null, version int not null default 1 check(version>=1),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(workspace_id,name), foreign key(workspace_id,symmetric_helper) references public.predicate_registry(workspace_id,name)
);
create table public.entity (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id) on delete restrict,
 kind public.entity_kind not null, type text not null, title text not null check(length(btrim(title)) between 1 and 300),
 status public.entity_status not null default 'active', attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object'),
 notes text, tags text[] not null default '{}' check(array_position(tags,null) is null), version int not null default 1 check(version>=1),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 search_vector tsvector generated always as (setweight(to_tsvector('simple'::regconfig,title),'A') || setweight(to_tsvector('simple'::regconfig,coalesce(notes,'')),'B') || setweight(jsonb_to_tsvector('simple'::regconfig,attributes,'["string"]'::jsonb),'C')) stored,
 unique(workspace_id,id), foreign key(workspace_id,kind,type) references public.type_templates(workspace_id,kind,type)
);
create function private.entity_invariants() returns trigger language plpgsql set search_path='' as $$
begin
 if old.kind<>new.kind or old.workspace_id<>new.workspace_id or old.id<>new.id then raise exception 'ENTITY_IDENTITY_IMMUTABLE'; end if;
 if old.status='archived' then raise exception 'ARCHIVED_ENTITY'; end if;
 if new.version<>old.version+1 then raise exception 'VERSION_CONFLICT'; end if;
 return new;
end $$;
create trigger entity_invariants before update on public.entity for each row execute function private.entity_invariants();
create table public.relation (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id) on delete restrict,
 from_id uuid not null, to_id uuid not null, predicate text not null, attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object'),
 valid_from timestamptz, valid_to timestamptz, version int not null default 1 check(version>=1),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,from_id,predicate,to_id), check(from_id<>to_id), check(valid_from is null or valid_to is null or valid_to>valid_from),
 foreign key(workspace_id,from_id) references public.entity(workspace_id,id), foreign key(workspace_id,to_id) references public.entity(workspace_id,id),
 foreign key(workspace_id,predicate) references public.predicate_registry(workspace_id,name)
);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id) on delete restrict,
 at timestamptz not null default now(), actor_type text not null check(actor_type in ('user','token','system')), actor_id uuid, effective_user_id uuid,
 source text not null, request_id text not null, action text not null, target_type text, target_id uuid,
 outcome text not null check(outcome in ('success','failure')), before jsonb, after jsonb, metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object')
);
create index entity_list_idx on public.entity(workspace_id,kind,status,updated_at desc,id);
create index entity_search_idx on public.entity using gin(search_vector);
create index entity_attrs_idx on public.entity using gin(attributes);
create index entity_tags_idx on public.entity using gin(tags);
create index relation_from_idx on public.relation(workspace_id,from_id,predicate);
create index relation_to_idx on public.relation(workspace_id,to_id,predicate);
create index audit_target_idx on public.audit_log(workspace_id,target_type,target_id,at desc);
create index audit_recent_idx on public.audit_log(workspace_id,at desc);
-- RLS helper bypasses membership RLS only to resolve the verified JWT user.
create function private.is_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_member m where m.workspace_id=w and m.user_id=(select auth.uid()))
$$;
-- Only the membership check is callable by authenticated RLS policies.
revoke all on all functions in schema private from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
do $$ declare t text; begin
 foreach t in array array['workspace','workspace_member','type_templates','predicate_registry','entity','relation','audit_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy member_read on public.%I for select to authenticated using (private.is_member(%I))',t,case when t='workspace' then 'id' else 'workspace_id' end);
 end loop;
end $$;
-- Invoker views cannot bypass the table's RLS.
create view public.people with (security_invoker=true) as select * from public.entity where kind='person';
create view public.objects with (security_invoker=true) as select * from public.entity where kind='object';
create view public.process_kinds with (security_invoker=true) as select * from public.entity where kind='process_kind';
create view public.agents with (security_invoker=true) as select * from public.entity where kind='agent';
create view public.apps with (security_invoker=true) as select * from public.entity where kind='app';
revoke all on public.people,public.objects,public.process_kinds,public.agents,public.apps from public,anon,authenticated,service_role;
grant select on public.people,public.objects,public.process_kinds,public.agents,public.apps to authenticated;
-- First actual mutation RPC: no caller-controlled identity, role or source.
create function public.workspace_create(p_name text,p_slug text) returns public.workspace language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w public.workspace;
begin
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 insert into public.workspace(name,slug) values(btrim(p_name),p_slug) returning * into w;
 insert into public.workspace_member(workspace_id,user_id,role) values(w.id,u,'owner');
 insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,after)
 values(w.id,'user',u,u,'rpc',gen_random_uuid()::text,'workspace.create','workspace',w.id,'success',to_jsonb(w));
 return w;
end $$;
revoke all on function public.workspace_create(text,text) from public,anon,authenticated,service_role;
grant execute on function public.workspace_create(text,text) to authenticated;
