-- Identity provider boundary: native OAuth identity is not Registry authorization.
create function private.registry_direct_principal() returns boolean
language sql stable set search_path='' as $$
 select auth.uid() is not null
   and (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id') is null
   and coalesce(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous','false')='false'
$$;
revoke all on function private.registry_direct_principal() from public,anon,authenticated,service_role;
grant execute on function private.registry_direct_principal() to authenticated;
create or replace function private.is_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.registry_direct_principal() and exists(select 1 from public.workspace_member m where m.workspace_id=w and m.user_id=(select auth.uid()))
$$;
create or replace function private.can_admin(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.registry_direct_principal() and exists(select 1 from public.workspace_member m where m.workspace_id=w and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))
$$;
create or replace function private.require_write(w uuid, admin_only boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.workspace_role;
begin
 if not private.registry_direct_principal() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if not exists(select 1 from public.workspace_member where workspace_id=w and user_id=u) then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.workspace where id=w for update;
 select role into r from public.workspace_member where workspace_id=w and user_id=u for share;
 if r is null then raise exception 'NOT_FOUND'; end if;
 if r='viewer' or (admin_only and r not in ('owner','admin')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return u;
end $$;
create or replace function public.workspace_create(p_name text,p_slug text) returns public.workspace language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w public.workspace;
begin
 if not private.registry_direct_principal() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 insert into public.workspace(name,slug) values(btrim(p_name),p_slug) returning * into w;
 insert into public.workspace_member(workspace_id,user_id,role) values(w.id,u,'owner');
 insert into public.audit_log(workspace_id,actor_type,actor_id,effective_user_id,source,request_id,action,target_type,target_id,outcome,after)
 values(w.id,'user',u,u,'rpc',gen_random_uuid()::text,'workspace.create','workspace',w.id,'success',to_jsonb(w));
 return w;
end $$;
create or replace function public.member_accept_invitation(p_token text) returns public.workspace_member language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a private.workspace_invitation; m public.workspace_member; w uuid; email_norm text;
begin
 if not private.registry_direct_principal() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^egi_[0-9a-f]{64}$' then raise exception 'NOT_FOUND'; end if;
 select workspace_id into w from private.workspace_invitation where token_hash=extensions.digest(p_token,'sha256');
 if not found then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.workspace where id=w for update;
 select * into a from private.workspace_invitation where token_hash=extensions.digest(p_token,'sha256') and workspace_id=w for update;
 select lower(btrim(email)) into email_norm from auth.users where id=u and email_confirmed_at is not null;
 if not found or email_norm is distinct from a.email or a.accepted_at is not null or a.revoked_at is not null or a.expires_at<=now() then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.workspace_member where workspace_id=w and user_id=u) then raise exception 'CONFLICT: already a member'; end if;
 insert into public.workspace_member(workspace_id,user_id,role) values(w,u,a.role) returning * into m;
 update private.workspace_invitation set accepted_at=now() where id=a.id;
 perform private.audit_mutation(w,u,'member.accept','workspace_member',u,null,to_jsonb(m)); return m;
end $$;
do $$ declare t text; begin
 foreach t in array array['workspace','workspace_member','type_templates','predicate_registry','entity','relation','audit_log','saved_view','process','process_kind_version'] loop
  execute format('create policy direct_registry_principal on public.%I as restrictive for all to authenticated using ((select private.registry_direct_principal())) with check ((select private.registry_direct_principal()))',t);
 end loop;
end $$;
create function public.registry_direct_session() returns boolean
language sql stable security invoker set search_path='' as $$ select private.registry_direct_principal() $$;
revoke all on function public.registry_direct_session() from public,anon,authenticated,service_role;
grant execute on function public.registry_direct_session() to authenticated;
create table private.person_identity_link(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 user_id uuid not null references auth.users(id), person_id uuid not null,
 linked_at timestamptz not null default clock_timestamp(), linked_by uuid not null references auth.users(id),
 revoked_at timestamptz, revoked_by uuid references auth.users(id),
 foreign key(workspace_id,person_id) references public.entity(workspace_id,id),
 check((revoked_at is null)=(revoked_by is null))
);
create unique index person_identity_active_user on private.person_identity_link(workspace_id,user_id) where revoked_at is null;
create unique index person_identity_active_person on private.person_identity_link(workspace_id,person_id) where revoked_at is null;
alter table private.person_identity_link enable row level security;
revoke all on private.person_identity_link from public,anon,authenticated,service_role;
create function public.identity_link_person(p_workspace_id uuid,p_user_id uuid,p_person_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); a private.person_identity_link;
begin
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id) then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and (email_confirmed_at is not null or phone_confirmed_at is not null) and not is_anonymous and deleted_at is null) then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from public.entity where workspace_id=p_workspace_id and id=p_person_id and kind='person' and status='active') then raise exception 'NOT_FOUND'; end if;
 select * into a from private.person_identity_link where workspace_id=p_workspace_id and user_id=p_user_id and revoked_at is null;
 if found then if a.person_id<>p_person_id then raise exception 'IDENTITY_LINK_CONFLICT'; end if; return to_jsonb(a); end if;
 if exists(select 1 from private.person_identity_link where workspace_id=p_workspace_id and person_id=p_person_id and revoked_at is null) then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
 insert into private.person_identity_link(workspace_id,user_id,person_id,linked_by) values(p_workspace_id,p_user_id,p_person_id,u) returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'identity.link','person_identity_link',a.id,null,to_jsonb(a));
 return to_jsonb(a);
end $$;
create function public.identity_unlink_person(p_workspace_id uuid,p_link_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b private.person_identity_link; a private.person_identity_link;
begin
 select * into b from private.person_identity_link where workspace_id=p_workspace_id and id=p_link_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.revoked_at is not null then return to_jsonb(b); end if;
 update private.person_identity_link set revoked_at=clock_timestamp(),revoked_by=u where id=b.id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'identity.unlink','person_identity_link',a.id,to_jsonb(b),to_jsonb(a));
 return to_jsonb(a);
end $$;
create function public.identity_current_person(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 select jsonb_build_object('personId',l.person_id,'linkedAt',l.linked_at) into r from private.person_identity_link l
 join public.entity e on (e.workspace_id,e.id)=(l.workspace_id,l.person_id)
 where l.workspace_id=p_workspace_id and l.user_id=auth.uid() and l.revoked_at is null and e.kind='person' and e.status='active';
 return r;
end $$;
revoke all on function public.identity_link_person(uuid,uuid,uuid),public.identity_unlink_person(uuid,uuid),public.identity_current_person(uuid) from public,anon,authenticated,service_role;
grant execute on function public.identity_link_person(uuid,uuid,uuid),public.identity_unlink_person(uuid,uuid),public.identity_current_person(uuid) to authenticated;