-- Ordered Registry path reports (CONTRACTS 5.6). Not an execution graph.
create function public.registry_path_report(p_workspace_id uuid,p_start_id uuid,p_steps jsonb,p_max_results int default 100)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare start_kind public.entity_kind; possible public.entity_kind[]; next_kinds public.entity_kind[]; s jsonb; p public.predicate_registry; d text; depth int; cap int; result jsonb;
begin
 select kind into start_kind from public.entity where workspace_id=p_workspace_id and id=p_start_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 if jsonb_typeof(p_steps) is distinct from 'array' then raise exception 'VALIDATION_ERROR: steps'; end if;
 depth:=jsonb_array_length(p_steps);
 if depth not between 1 and 2 or p_max_results is null or p_max_results<1 then raise exception 'VALIDATION_ERROR: path bounds'; end if;
 cap:=least(p_max_results,500); possible:=array[start_kind];
 for s in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'VALIDATION_ERROR: path step'; end if;
  if exists(select 1 from jsonb_object_keys(s) k where k not in ('predicate','direction')) or jsonb_typeof(s->'predicate') is distinct from 'string' or coalesce(s->>'direction','') not in ('incoming','outgoing','either') then raise exception 'VALIDATION_ERROR: path step'; end if;
  select * into p from public.predicate_registry where workspace_id=p_workspace_id and name=s->>'predicate';
  if not found then raise exception 'PATH_NOT_CONFIGURED'; end if;
  d:=s->>'direction'; next_kinds:='{}';
  if possible && p.from_kinds and (not p.directed or d in ('outgoing','either')) then next_kinds:=next_kinds||p.to_kinds; end if;
  if possible && p.to_kinds and (not p.directed or d in ('incoming','either')) then next_kinds:=next_kinds||p.from_kinds; end if;
  if cardinality(next_kinds)=0 then raise exception 'PATH_NOT_CONFIGURED'; end if;
  possible:=next_kinds;
 end loop;
 with recursive paths(hop,entity_ids,relation_ids) as (
  select 0,array[p_start_id],array[]::uuid[]
  union all
  select q.hop+1,q.entity_ids||n.id,q.relation_ids||r.id
  from paths q
  join public.relation r on r.workspace_id=p_workspace_id and r.predicate=(p_steps->q.hop->>'predicate') and (r.from_id=q.entity_ids[q.hop+1] or r.to_id=q.entity_ids[q.hop+1])
  join public.predicate_registry pred on (pred.workspace_id,pred.name)=(r.workspace_id,r.predicate)
  cross join lateral (values (r.to_id,r.from_id=q.entity_ids[q.hop+1] and (not pred.directed or (p_steps->q.hop->>'direction') in ('outgoing','either'))),(r.from_id,r.to_id=q.entity_ids[q.hop+1] and (not pred.directed or (p_steps->q.hop->>'direction') in ('incoming','either')))) n(id,allowed)
  join public.entity e on e.workspace_id=p_workspace_id and e.id=n.id and e.status<>'archived'
  where q.hop<depth and n.allowed and not(r.id=any(q.relation_ids))
 ), bounded as (select * from paths where hop=depth order by entity_ids,relation_ids limit cap)
 select coalesce(jsonb_agg(jsonb_build_object(
  'entities',(select jsonb_agg(to_jsonb(e)-'search_vector' order by i.ord) from unnest(b.entity_ids) with ordinality i(id,ord) join public.entity e on e.id=i.id and e.workspace_id=p_workspace_id),
  'relations',(select jsonb_agg(to_jsonb(r) order by i.ord) from unnest(b.relation_ids) with ordinality i(id,ord) join public.relation r on r.id=i.id and r.workspace_id=p_workspace_id)
 ) order by b.entity_ids,b.relation_ids),'[]') into result from bounded b;
 return result;
end $$;
revoke all on function public.registry_path_report(uuid,uuid,jsonb,int) from public,anon,authenticated,service_role;
grant execute on function public.registry_path_report(uuid,uuid,jsonb,int) to authenticated;
