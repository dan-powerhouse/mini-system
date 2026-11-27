-- Native audit read API. No client DML and no UI-specific business logic.
create index audit_recent_page_idx on public.audit_log(workspace_id,at desc,id desc);
create function public.audit_recent(p_workspace_id uuid,p_query jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); lim int; qhash text; body jsonb; cur jsonb; c text; items jsonb; last_row jsonb; n int; next_cursor text; tid uuid; actor uuid;
begin
 if u is null or not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 if not private.object_keys_allowed(p_query,array['targetType','targetId','actorUserId','source','actionPrefix','limit','cursor']) then raise exception 'VALIDATION_ERROR: audit query'; end if;
 if exists(select 1 from jsonb_each(p_query) j where j.key<>'limit' and jsonb_typeof(j.value)<>'string') then raise exception 'VALIDATION_ERROR: audit filter'; end if;
 if p_query?'limit' and (jsonb_typeof(p_query->'limit')<>'number' or coalesce(p_query->>'limit','') !~ '^[0-9]{1,3}$') then raise exception 'VALIDATION_ERROR: limit'; end if;
 lim:=coalesce((p_query->>'limit')::int,25);
 if lim not between 1 and 100 or length(p_query->>'targetType')>100 or length(p_query->>'source')>100 or length(p_query->>'actionPrefix')>100 then raise exception 'VALIDATION_ERROR: audit bounds'; end if;
 if (p_query?'actorUserId' or p_query?'source' or p_query?'actionPrefix') and not private.can_admin(p_workspace_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 begin
  tid:=(p_query->>'targetId')::uuid; actor:=(p_query->>'actorUserId')::uuid;
 exception when invalid_text_representation then raise exception 'VALIDATION_ERROR: audit identifier'; end;
 qhash:=encode(extensions.digest(((p_query-'cursor'-'limit')||jsonb_build_object('limit',lim,'api','audit'))::text,'sha256'),'hex');
 c:=p_query->>'cursor';
 if c is not null then
  begin
   if length(c)>2048 or c !~ '^[0-9a-f]+\.[0-9a-f]{64}$' then raise exception 'invalid'; end if;
   body:=convert_from(decode(split_part(c,'.',1),'hex'),'UTF8')::jsonb;
   if private.search_cursor_sign(body) is distinct from split_part(c,'.',2) or body->>'user' is distinct from u::text or body->>'workspace' is distinct from p_workspace_id::text or body->>'queryHash' is distinct from qhash or (body->>'expires')::timestamptz<=now() then raise exception 'invalid'; end if;
   cur:=body->'last';
  exception when others then raise exception 'VALIDATION_ERROR: cursor'; end;
 end if;
 -- Definer is required for the private cursor signer. Mirror audit RLS exactly.
 with page as (
  select a.* from public.audit_log a where a.workspace_id=p_workspace_id
   and (a.target_type is distinct from 'saved_view' or a.effective_user_id=u or (coalesce(a.before->>'visibility','')<>'personal' and coalesce(a.after->>'visibility','')<>'personal'))
   and (not(p_query?'targetType') or a.target_type=p_query->>'targetType')
   and (tid is null or a.target_id=tid) and (actor is null or a.effective_user_id=actor)
   and (not(p_query?'source') or a.source=p_query->>'source')
   and (not(p_query?'actionPrefix') or starts_with(a.action,p_query->>'actionPrefix'))
   and (cur is null or (a.at,a.id)<((cur->>'at')::timestamptz,(cur->>'id')::uuid))
  order by a.at desc,a.id desc limit lim+1
 ), numbered as (select p.*,row_number() over(order by p.at desc,p.id desc) rn from page p)
 select coalesce(jsonb_agg(to_jsonb(b)-'rn' order by rn) filter(where rn<=lim),'[]'),count(*),(jsonb_agg(jsonb_build_object('at',b.at,'id',b.id)) filter(where rn=lim))->0
 into items,n,last_row from numbered b;
 if n>lim then
  body:=jsonb_build_object('user',u,'workspace',p_workspace_id,'queryHash',qhash,'last',last_row,'expires',now()+interval '30 minutes');
  next_cursor:=encode(convert_to(body::text,'UTF8'),'hex')||'.'||private.search_cursor_sign(body);
 end if;
 return jsonb_build_object('items',items,'nextCursor',next_cursor);
end $$;
create function public.audit_for_entity(p_workspace_id uuid,p_id uuid,p_limit int default 25,p_cursor text default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.entity where workspace_id=p_workspace_id and id=p_id) then raise exception 'NOT_FOUND'; end if;
 return public.audit_recent(p_workspace_id,jsonb_strip_nulls(jsonb_build_object('targetType','entity','targetId',p_id,'limit',p_limit,'cursor',p_cursor)));
end $$;
revoke all on function public.audit_recent(uuid,jsonb),public.audit_for_entity(uuid,uuid,int,text) from public,anon,authenticated,service_role;
grant execute on function public.audit_recent(uuid,jsonb),public.audit_for_entity(uuid,uuid,int,text) to authenticated;
