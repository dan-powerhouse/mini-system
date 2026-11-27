-- Publication is service-only; the disabled publish Edge adapter verifies Auth,
-- validates bytes, uploads once (no upsert), and attests the digest to this RPC.
-- Exact skill package format and activation remain subject to owner review.
alter table public.process_kind_version add constraint process_kind_package_path_unique unique(package_path);

create function public.process_kind_publish(
 p_workspace_id uuid,p_user_id uuid,p_process_kind_id uuid,p_expected_entity_version int,
 p_expected_publication_version int,p_upload_id uuid,p_sha256 text,p_specification jsonb
) returns public.process_kind_version language plpgsql security definer set search_path='' as $$
declare r public.workspace_role; k public.entity; v public.process_kind_version; latest int; path text;
begin
 if p_user_id is null or p_upload_id is null or p_expected_entity_version is null or p_expected_entity_version<1
 or p_expected_publication_version is null or p_expected_publication_version<0 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p_specification) is distinct from 'object' or octet_length(p_specification::text)>1048576
 then raise exception 'VALIDATION_ERROR: publication'; end if;
 -- Same lock order as Registry writes; membership cannot change between authorization and commit.
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id) then raise exception 'NOT_FOUND'; end if;
 perform 1 from public.workspace where id=p_workspace_id for update;
 select role into r from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id for share;
 if r is null then raise exception 'NOT_FOUND'; end if;
 if r not in ('owner','admin') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into k from public.entity where workspace_id=p_workspace_id and id=p_process_kind_id and kind='process_kind';
 if not found then raise exception 'NOT_FOUND'; end if;
 path:=p_workspace_id::text||'/'||p_process_kind_id::text||'/'||p_upload_id::text||'.zip';
 select * into v from public.process_kind_version where package_path=path;
 if found then
  if (v.workspace_id,v.process_kind_id,v.published_by,v.package_sha256,v.specification,v.version)
  is distinct from (p_workspace_id,p_process_kind_id,p_user_id,p_sha256,p_specification,p_expected_publication_version+1)
  then raise exception 'PUBLICATION_CONFLICT'; end if;
  return v; -- idempotent replay, no second audit
 end if;
 if k.status<>'active' then raise exception 'VALIDATION_ERROR: active Process Kind required'; end if;
 if k.version<>p_expected_entity_version then raise exception 'VERSION_CONFLICT'; end if;
 select coalesce(max(version),0) into latest from public.process_kind_version where workspace_id=p_workspace_id and process_kind_id=p_process_kind_id;
 if latest<>p_expected_publication_version then raise exception 'VERSION_CONFLICT'; end if;
 insert into public.process_kind_version(workspace_id,process_kind_id,version,package_path,package_sha256,specification,published_by)
 values(p_workspace_id,p_process_kind_id,latest+1,path,p_sha256,p_specification,p_user_id) returning * into v;
 -- Audit the version and digest, not opaque package contents or credentials.
 perform private.audit_mutation(p_workspace_id,p_user_id,'process_kind.publish','process_kind_version',p_process_kind_id,null,to_jsonb(v)-'specification');
 return v;
end $$;

-- Narrow metadata read for the disabled publication adapter; no worker access.
create function public.process_kind_publications(p_workspace_id uuid,p_user_id uuid,p_process_kind_id uuid,p_before int default null,p_limit int default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.workspace_member where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin'))
 then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from public.entity where workspace_id=p_workspace_id and id=p_process_kind_id and kind='process_kind') then raise exception 'NOT_FOUND'; end if;
 if p_limit is null or p_limit not between 1 and 100 or (p_before is not null and p_before<1) then raise exception 'VALIDATION_ERROR: page'; end if;
 select coalesce(jsonb_agg(to_jsonb(v)-'specification'-'package_path' order by v.version desc),'[]') into result
 from (select * from public.process_kind_version where workspace_id=p_workspace_id and process_kind_id=p_process_kind_id
 and (p_before is null or version<p_before) order by version desc limit p_limit) v;
 return result;
end $$;
revoke all on function public.process_kind_publish(uuid,uuid,uuid,int,int,uuid,text,jsonb),
 public.process_kind_publications(uuid,uuid,uuid,int,int) from public,anon,authenticated,service_role;
grant execute on function public.process_kind_publish(uuid,uuid,uuid,int,int,uuid,text,jsonb),
 public.process_kind_publications(uuid,uuid,uuid,int,int) to service_role;
