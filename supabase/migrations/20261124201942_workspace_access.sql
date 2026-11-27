-- Native Supabase Auth membership; credentials and invitations are private.
create table private.api_token (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id),
 user_id uuid not null references auth.users(id), label text not null check(length(btrim(label)) between 1 and 100),
 prefix text not null, token_hash bytea not null unique, scopes text[] not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 last_used_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
 check('read'=any(scopes) and scopes <@ array['read','write'] and array_position(scopes,null) is null and cardinality(scopes) between 1 and 2),
 check(expires_at is null or expires_at>created_at)
);
create index api_token_member on private.api_token(workspace_id,user_id);
create table private.workspace_invitation (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspace(id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
 role public.workspace_role not null check(role<>'owner'), token_hash bytea not null unique,
 invited_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null, accepted_at timestamptz, revoked_at timestamptz
);
create index invitation_workspace on private.workspace_invitation(workspace_id,email);
create table private.security_event_log (id uuid primary key default gen_random_uuid(), at timestamptz not null default now(), request_id uuid not null, event text not null, metadata jsonb not null default '{}');
create table private.api_rate_bucket (token_id uuid not null references private.api_token(id), request_id uuid not null, at timestamptz not null default clock_timestamp(), primary key(token_id,request_id));
create index api_rate_bucket_window on private.api_rate_bucket(token_id,at);
do $$ declare t text; begin foreach t in array array['api_token','workspace_invitation','security_event_log','api_rate_bucket'] loop execute format('alter table private.%I enable row level security',t); execute format('revoke all on private.%I from public,anon,authenticated,service_role',t); end loop; end $$;
create function public.workspace_update(p_workspace_id uuid,p_patch jsonb) returns public.workspace language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b public.workspace; a public.workspace;
begin
 if not private.object_keys_allowed(p_patch,array['name','slug','staleProcessKindDays']) or (p_patch?'name' and jsonb_typeof(p_patch->'name') is distinct from 'string') or (p_patch?'slug' and jsonb_typeof(p_patch->'slug') is distinct from 'string') or (p_patch?'staleProcessKindDays' and (jsonb_typeof(p_patch->'staleProcessKindDays') is distinct from 'number' or (p_patch->>'staleProcessKindDays') !~ '^[0-9]{1,4}$')) then raise exception 'VALIDATION_ERROR: workspace'; end if;
 select * into b from public.workspace where id=p_workspace_id;
 update public.workspace set name=coalesce(btrim(p_patch->>'name'),name),slug=coalesce(btrim(p_patch->>'slug'),slug),stale_process_kind_days=coalesce((p_patch->>'staleProcessKindDays')::int,stale_process_kind_days),updated_at=now() where id=p_workspace_id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'workspace.update','workspace',a.id,to_jsonb(b),to_jsonb(a)); return a;
end $$;
create function public.member_update_role(p_workspace_id uuid,p_user_id uuid,p_role public.workspace_role) returns public.workspace_member language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b public.workspace_member; a public.workspace_member;
begin
 select * into b from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.role='owner' or p_role is null or p_role='owner' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.workspace_member set role=p_role,updated_at=now() where workspace_id=p_workspace_id and user_id=p_user_id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'member.role','workspace_member',p_user_id,to_jsonb(b),to_jsonb(a)); return a;
end $$;
create function public.member_remove(p_workspace_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b public.workspace_member;
begin
 select * into b from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.role='owner' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update private.api_token set revoked_at=now() where workspace_id=p_workspace_id and user_id=p_user_id and revoked_at is null;
 delete from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id;
 perform private.audit_mutation(p_workspace_id,u,'member.remove','workspace_member',p_user_id,to_jsonb(b),null);
end $$;
create function public.member_transfer_owner(p_workspace_id uuid,p_new_owner uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b public.workspace_member;
begin
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=u and role='owner') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into b from public.workspace_member where workspace_id=p_workspace_id and user_id=p_new_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_new_owner=u then return; end if;
 update public.workspace_member set role='admin',updated_at=now() where workspace_id=p_workspace_id and user_id=u;
 update public.workspace_member set role='owner',updated_at=now() where workspace_id=p_workspace_id and user_id=p_new_owner;
 perform private.audit_mutation(p_workspace_id,u,'member.transfer_owner','workspace_member',p_new_owner,jsonb_build_object('owner',u),jsonb_build_object('owner',p_new_owner));
end $$;
-- Delivery remains external to SQL; return the one-time invitation to the authorized administrator only.
create function public.member_invite(p_workspace_id uuid,p_email text,p_role public.workspace_role) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); raw text:='egi_'||encode(extensions.gen_random_bytes(32),'hex'); a private.workspace_invitation; email_norm text:=lower(btrim(p_email));
begin
 if email_norm is null or length(email_norm)>254 or email_norm !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_role is null or p_role='owner' then raise exception 'VALIDATION_ERROR: invitation'; end if;
 update private.workspace_invitation set revoked_at=now() where workspace_id=p_workspace_id and email=email_norm and accepted_at is null and revoked_at is null;
 insert into private.workspace_invitation(workspace_id,email,role,token_hash,invited_by,expires_at) values(p_workspace_id,email_norm,p_role,extensions.digest(raw,'sha256'),u,now()+interval '7 days') returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'member.invite','workspace_invitation',a.id,null,to_jsonb(a)-'token_hash');
 return jsonb_build_object('invitationId',a.id,'expiresAt',a.expires_at,'token',raw);
end $$;
create function public.member_accept_invitation(p_token text) returns public.workspace_member language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a private.workspace_invitation; m public.workspace_member; w uuid; email_norm text;
begin
 if u is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^egi_[0-9a-f]{64}$' then raise exception 'NOT_FOUND'; end if;
 select workspace_id into w from private.workspace_invitation where token_hash=extensions.digest(p_token,'sha256');
 if not found then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.workspace where id=w for update;
 select * into a from private.workspace_invitation where token_hash=extensions.digest(p_token,'sha256') and workspace_id=w for update;
 -- Supabase Auth, not caller-supplied email; require confirmation.
 select lower(btrim(email)) into email_norm from auth.users where id=u and email_confirmed_at is not null;
 if not found or email_norm is distinct from a.email or a.accepted_at is not null or a.revoked_at is not null or a.expires_at<=now() then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from public.workspace_member where workspace_id=w and user_id=u) then raise exception 'CONFLICT: already a member'; end if;
 insert into public.workspace_member(workspace_id,user_id,role) values(w,u,a.role) returning * into m;
 update private.workspace_invitation set accepted_at=now() where id=a.id;
 perform private.audit_mutation(w,u,'member.accept','workspace_member',u,null,to_jsonb(m)); return m;
end $$;
create function public.token_issue(p_workspace_id uuid,p_user_id uuid,p_label text,p_scopes text[],p_expires_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); raw text:='egt_'||encode(extensions.gen_random_bytes(32),'hex'); a private.api_token;
begin
 if p_label is null or length(btrim(p_label)) not between 1 and 100 or p_scopes is null or not('read'=any(p_scopes)) or not(p_scopes<@array['read','write']) or array_position(p_scopes,null) is not null or cardinality(p_scopes)<>(select count(distinct x) from unnest(p_scopes) x) or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'VALIDATION_ERROR: token'; end if;
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id) then raise exception 'NOT_FOUND'; end if;
 insert into private.api_token(workspace_id,user_id,label,prefix,token_hash,scopes,created_by,expires_at) values(p_workspace_id,p_user_id,btrim(p_label),left(raw,12),extensions.digest(raw,'sha256'),p_scopes,u,p_expires_at) returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'token.issue','api_token',a.id,null,to_jsonb(a)-'token_hash');
 return jsonb_build_object('token',raw,'summary',to_jsonb(a)-'token_hash');
end $$;
create function public.token_list(p_workspace_id uuid,p_user_id uuid default null) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_admin(p_workspace_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return query select to_jsonb(t)-'token_hash' from private.api_token t where t.workspace_id=p_workspace_id and (p_user_id is null or t.user_id=p_user_id) order by t.created_at desc,t.id;
end $$;
create function public.token_revoke(p_workspace_id uuid,p_token_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_write(p_workspace_id,true); b private.api_token; a private.api_token;
begin
 select * into b from private.api_token where workspace_id=p_workspace_id and id=p_token_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if b.revoked_at is not null then return; end if;
 update private.api_token set revoked_at=now() where id=p_token_id returning * into a;
 perform private.audit_mutation(p_workspace_id,u,'token.revoke','api_token',a.id,to_jsonb(b)-'token_hash',to_jsonb(a)-'token_hash');
end $$;
revoke all on function public.workspace_update(uuid,jsonb),public.member_update_role(uuid,uuid,public.workspace_role),public.member_remove(uuid,uuid),public.member_transfer_owner(uuid,uuid),public.member_invite(uuid,text,public.workspace_role),public.member_accept_invitation(text),public.token_issue(uuid,uuid,text,text[],timestamptz),public.token_list(uuid,uuid),public.token_revoke(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.workspace_update(uuid,jsonb),public.member_update_role(uuid,uuid,public.workspace_role),public.member_remove(uuid,uuid),public.member_transfer_owner(uuid,uuid),public.member_invite(uuid,text,public.workspace_role),public.member_accept_invitation(text),public.token_issue(uuid,uuid,text,text[],timestamptz),public.token_list(uuid,uuid),public.token_revoke(uuid,uuid) to authenticated;
