-- Acceptance 68: an export must be importable into a fresh workspace. Entities
-- chosen by the kind/archived filters keep their entity_ref attributes, so every
-- entity they reference (transitively) joins the snapshot even if it is archived
-- or of an unselected kind. Unreferenced archived entities stay filtered out.
-- Relations still require both endpoints in the snapshot.
-- Same signature, grants and limits as 20261124202004_registry_exchange.
create or replace function public.export_create(p_workspace_id uuid,p_kinds public.entity_kind[] default null,p_include_archived boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); j private.export_job; payload jsonb;
begin
 if not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 if p_include_archived is null or (p_kinds is not null and (cardinality(p_kinds)=0 or array_position(p_kinds,null) is not null)) then raise exception 'VALIDATION_ERROR: export options'; end if;
 -- One SQL statement takes a consistent MVCC snapshot of both sets.
 with recursive wanted(id) as (
   select e.id from public.entity e where e.workspace_id=p_workspace_id and (p_kinds is null or e.kind=any(p_kinds)) and (p_include_archived or e.status<>'archived')
   union
   select r.id from wanted w
    join public.entity e on e.workspace_id=p_workspace_id and e.id=w.id
    join public.type_templates t on t.workspace_id=p_workspace_id and t.kind=e.kind and t.type=e.type
    cross join lateral jsonb_array_elements(t.fields) f
    join public.entity r on r.workspace_id=p_workspace_id and r.id::text=e.attributes->>(f->>'name')
   where f->>'dataType'='entity_ref'
 ),
 selected as materialized(select id,kind,type,title,status,attributes,notes,tags from public.entity where workspace_id=p_workspace_id and id in(select id from wanted) order by id limit 10001),
 edges as (select id,from_id,to_id,predicate,attributes,valid_from,valid_to from public.relation where workspace_id=p_workspace_id and from_id in(select id from selected) and to_id in(select id from selected) order by id limit 10001)
 select jsonb_build_object('entities',(select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from selected s),'relations',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from edges r)) into payload;
 if jsonb_array_length(payload->'entities')+jsonb_array_length(payload->'relations')>10000 or octet_length(payload::text)>20971520 then raise exception 'PAYLOAD_TOO_LARGE'; end if;
 insert into private.export_job(workspace_id,user_id,payload) values(p_workspace_id,u,payload) returning * into j;
 return jsonb_build_object('exportId',j.id,'expiresAt',j.expires_at);
end $$;
