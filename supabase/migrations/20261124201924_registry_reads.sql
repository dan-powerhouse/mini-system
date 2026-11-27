-- Registry-only reads. PostgreSQL full-text search, signed keyset cursors, bounded BFS.
-- No execution tables are read by these functions. Traversal uses caller RLS; search explicitly checks membership in a restricted definer.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table private.search_cursor_key (singleton boolean primary key check(singleton), secret bytea not null);
insert into private.search_cursor_key values(true,extensions.gen_random_bytes(32));
revoke all on private.search_cursor_key from public,anon,authenticated,service_role;
-- Only this codec sees the secret. Its caller binds cursor contents to the authenticated subject.
-- private is not an exposed PostgREST schema; direct database login is not an application interface.
create function private.search_cursor_sign(p_body jsonb) returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.hmac(convert_to(p_body::text,'UTF8'),secret,'sha256'),'hex') from private.search_cursor_key where singleton
$$;
revoke all on function private.search_cursor_sign(jsonb) from public,anon,authenticated,service_role;
-- The exposed function is a restricted read-only definer to keep the signing codec private.
-- Every entity and template query is explicitly bound to the verified membership/workspace.
create function public.entity_search(p_workspace_id uuid,p_query jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); q text; k text; ty text; states text[]; filter_tags text[]; fs jsonb; f jsonb; op text; val jsonb; lim int; sf text; sd text; ts tsquery; cur jsonb; body jsonb; sig text; cursor_text text; normalized jsonb; query_hash text; result jsonb; last_row jsonb; next_cursor text; row_count int;
begin
 if u is null or not private.is_member(p_workspace_id) then raise exception 'NOT_FOUND'; end if;
 if not private.object_keys_allowed(p_query,array['q','kind','type','status','tagsAny','attributeFilters','limit','cursor','sort']) then raise exception 'VALIDATION_ERROR: search keys'; end if;
 if (p_query?'q' and jsonb_typeof(p_query->'q')<>'string') or (p_query?'kind' and jsonb_typeof(p_query->'kind')<>'string') or (p_query?'type' and jsonb_typeof(p_query->'type')<>'string') or (p_query?'cursor' and jsonb_typeof(p_query->'cursor')<>'string') then raise exception 'VALIDATION_ERROR: search types'; end if;
 q:=nullif(btrim(p_query->>'q'),''); k:=p_query->>'kind'; ty:=p_query->>'type';
 if length(q)>500 or (k is not null and k not in ('person','object','process_kind','agent','app')) or (ty is not null and length(ty) not between 1 and 100) then raise exception 'VALIDATION_ERROR: search filter'; end if;
 if p_query?'status' then
  if jsonb_typeof(p_query->'status')<>'array' or exists(select 1 from jsonb_array_elements(p_query->'status') x where jsonb_typeof(x)<>'string' or x#>>'{}' not in ('active','inactive','archived')) then raise exception 'VALIDATION_ERROR: status'; end if;
  states:=array(select distinct x from jsonb_array_elements_text(p_query->'status') x order by x);
 else states:=array['active','inactive']; end if;
 if p_query?'tagsAny' then
  if jsonb_typeof(p_query->'tagsAny')<>'array' or jsonb_array_length(p_query->'tagsAny')>100 or exists(select 1 from jsonb_array_elements(p_query->'tagsAny') x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 64) then raise exception 'VALIDATION_ERROR: tagsAny'; end if;
  filter_tags:=array(select distinct lower(btrim(x)) from jsonb_array_elements_text(p_query->'tagsAny') x order by 1);
 else filter_tags:='{}'; end if;
 if p_query?'limit' and (jsonb_typeof(p_query->'limit')<>'number' or (p_query->>'limit')!~'^[0-9]{1,3}$') then raise exception 'VALIDATION_ERROR: limit'; end if;
 lim:=coalesce((p_query->>'limit')::int,25); if lim not between 1 and 100 then raise exception 'VALIDATION_ERROR: limit'; end if;
 if p_query?'sort' then
  if not private.object_keys_allowed(p_query->'sort',array['field','direction']) then raise exception 'VALIDATION_ERROR: sort'; end if;
  sf:=p_query#>>'{sort,field}'; sd:=p_query#>>'{sort,direction}';
  if coalesce(sf,'') not in ('title','createdAt','updatedAt') or coalesce(sd,'') not in ('asc','desc') then raise exception 'VALIDATION_ERROR: sort'; end if;
 else sf:=case when q is null then 'updatedAt' else 'relevance' end; sd:='desc'; end if;
 fs:=coalesce(p_query->'attributeFilters','[]');
 if jsonb_typeof(fs)<>'array' or jsonb_array_length(fs)>20 then raise exception 'VALIDATION_ERROR: attributeFilters'; end if;
 for f in select value from jsonb_array_elements(fs) loop
  op:=f->>'operator'; val:=f->'value';
  if not private.object_keys_allowed(f,array['key','operator','value']) or jsonb_typeof(f->'key') is distinct from 'string' or length(f->>'key') not between 1 and 128 or coalesce(op,'') not in ('eq','contains','gt','gte','lt','lte') or val is null then raise exception 'VALIDATION_ERROR: attribute filter'; end if;
  if not exists(select 1 from public.type_templates t cross join lateral jsonb_array_elements(t.fields) d where t.workspace_id=p_workspace_id and (k is null or t.kind::text=k) and (ty is null or t.type=ty) and d->>'name'=f->>'key' and (case when op='eq' then private.field_ok(p_workspace_id,d,val) when op='contains' then d->>'dataType' in ('text','date','select','entity_ref','multiselect') and jsonb_typeof(val)='string' when op in ('gt','gte','lt','lte') then d->>'dataType'='number' and jsonb_typeof(val)='number' else false end)) then raise exception 'VALIDATION_ERROR: incompatible attribute filter'; end if;
 end loop;
 normalized:=jsonb_build_object('q',q,'kind',k,'type',ty,'status',states,'tagsAny',filter_tags,'attributeFilters',fs,'sort',sf,'direction',sd,'limit',lim);
 query_hash:=encode(extensions.digest(normalized::text,'sha256'),'hex');
 ts:=case when q is not null then websearch_to_tsquery('simple'::regconfig,q) end;
 cursor_text:=p_query->>'cursor';
 if cursor_text is not null then
  begin
   if length(cursor_text)>2048 or cursor_text !~ '^[0-9a-f]+\.[0-9a-f]{64}$' then raise exception 'invalid'; end if;
   body:=convert_from(decode(split_part(cursor_text,'.',1),'hex'),'UTF8')::jsonb; sig:=split_part(cursor_text,'.',2);
   if private.search_cursor_sign(body) is distinct from sig or body->>'user' is distinct from u::text or body->>'workspace' is distinct from p_workspace_id::text or body->>'queryHash' is distinct from query_hash or (body->>'expires')::timestamptz<=now() then raise exception 'invalid'; end if;
   cur:=body->'last';
  exception when others then raise exception 'VALIDATION_ERROR: cursor'; end;
 end if;
 with filtered as (
  select e.*, case when ts is null then 0::real else ts_rank(e.search_vector,ts) end as rank
  from public.entity e where e.workspace_id=p_workspace_id and (k is null or e.kind::text=k) and (ty is null or e.type=ty) and e.status::text=any(states) and (cardinality(filter_tags)=0 or e.tags && filter_tags) and (ts is null or e.search_vector@@ts)
  and not exists(select 1 from jsonb_array_elements(fs) a where not coalesce(case a->>'operator'
   when 'eq' then e.attributes->(a->>'key')=a->'value'
   when 'contains' then case jsonb_typeof(e.attributes->(a->>'key')) when 'string' then strpos(lower(e.attributes->>(a->>'key')),lower(a->>'value'))>0 when 'array' then (e.attributes->(a->>'key')) @> jsonb_build_array(a->'value') else false end
   else case when jsonb_typeof(e.attributes->(a->>'key'))='number' then case a->>'operator' when 'gt' then (e.attributes->>(a->>'key'))::numeric>(a->>'value')::numeric when 'gte' then (e.attributes->>(a->>'key'))::numeric>=(a->>'value')::numeric when 'lt' then (e.attributes->>(a->>'key'))::numeric<(a->>'value')::numeric when 'lte' then (e.attributes->>(a->>'key'))::numeric<=(a->>'value')::numeric end else false end end,false))
 ), keyed as (select f.*,case sf when 'title' then lower(title) collate "C" end as title_key,case sf when 'createdAt' then created_at when 'updatedAt' then updated_at when 'relevance' then updated_at end as time_key from filtered f), page as (
  select z.* from keyed z where cur is null or case when sf='relevance' then (z.rank,z.time_key,z.id)<((cur->>'rank')::real,(cur->>'time_key')::timestamptz,(cur->>'id')::uuid) when sf='title' and sd='asc' then (z.title_key,z.id)>((cur->>'title_key') collate "C",(cur->>'id')::uuid) when sf='title' then (z.title_key,z.id)<((cur->>'title_key') collate "C",(cur->>'id')::uuid) when sd='asc' then (z.time_key,z.id)>((cur->>'time_key')::timestamptz,(cur->>'id')::uuid) else (z.time_key,z.id)<((cur->>'time_key')::timestamptz,(cur->>'id')::uuid) end
  order by case when sf='relevance' then z.rank end desc,case when sf='title' and sd='asc' then z.title_key end asc,case when sf='title' and sd='desc' then z.title_key end desc,case when sd='asc' then z.time_key end asc,case when sd='desc' then z.time_key end desc,case when sd='asc' then z.id end asc,case when sd='desc' then z.id end desc limit lim+1
 ), numbered as (select p.*,row_number() over (order by case when sf='relevance' then p.rank end desc,case when sf='title' and sd='asc' then p.title_key end asc,case when sf='title' and sd='desc' then p.title_key end desc,case when sd='asc' then p.time_key end asc,case when sd='desc' then p.time_key end desc,case when sd='asc' then p.id end asc,case when sd='desc' then p.id end desc) rn from page p)
 select coalesce(jsonb_agg(to_jsonb(b)-array['search_vector','rank','title_key','time_key','rn'] order by rn) filter(where rn<=lim),'[]'), count(*), (jsonb_agg(jsonb_build_object('rank',rank,'title_key',title_key,'time_key',time_key,'id',id)) filter(where rn=lim))->0 into result,row_count,last_row from numbered b;
 if row_count>lim then body:=jsonb_build_object('user',u,'workspace',p_workspace_id,'queryHash',query_hash,'last',last_row,'expires',now()+interval '30 minutes'); next_cursor:=encode(convert_to(body::text,'UTF8'),'hex')||'.'||private.search_cursor_sign(body); end if;
 return jsonb_build_object('items',result,'nextCursor',next_cursor);
end $$;
revoke all on function public.entity_search(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.entity_search(uuid,jsonb) to authenticated;
-- Bounded breadth-first traversal. One frontier per depth, no recursive path explosion.
create function public.registry_traverse(p_workspace_id uuid,p_start_id uuid,p_depth int,p_direction text default 'both',p_predicates text[] default null,p_max_nodes int default 500) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare start_row public.entity; visited uuid[]; frontier uuid[]; new_nodes uuid[]; traversed uuid[]:='{}'; nodes jsonb:='[]'; rels jsonb; hop int; cap int; truncated boolean:=false;
begin
 if p_depth is null or p_depth not between 1 and 3 or coalesce(p_direction,'') not in ('incoming','outgoing','both') or p_max_nodes is null or p_max_nodes<1 or (p_predicates is not null and (cardinality(p_predicates)>50 or array_position(p_predicates,null) is not null)) then raise exception 'VALIDATION_ERROR: traversal'; end if;
 cap:=least(p_max_nodes,500);
 select * into start_row from public.entity where workspace_id=p_workspace_id and id=p_start_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_predicates is not null and exists(select 1 from unnest(p_predicates) x where not exists(select 1 from public.predicate_registry where workspace_id=p_workspace_id and name=x)) then raise exception 'VALIDATION_ERROR: unknown predicate'; end if;
 visited:=array[p_start_id]; frontier:=visited;
 for hop in 1..p_depth loop
  exit when cardinality(frontier)=0;
  with candidates as (
   select distinct n.id from public.relation r join public.predicate_registry p on (p.workspace_id,p.name)=(r.workspace_id,r.predicate)
   cross join lateral (values (r.to_id,r.from_id=any(frontier) and (not p.directed or p_direction in ('both','outgoing'))),(r.from_id,r.to_id=any(frontier) and (not p.directed or p_direction in ('both','incoming')))) n(id,allowed)
   where r.workspace_id=p_workspace_id and (p_predicates is null or r.predicate=any(p_predicates)) and n.allowed
  ) select coalesce(array_agg(c.id order by c.id),'{}') into new_nodes from (select c.id from candidates c join public.entity e on e.workspace_id=p_workspace_id and e.id=c.id where e.status<>'archived' and not(c.id=any(visited)) order by c.id limit cap-cardinality(visited)+1) c;
  visited:=visited||new_nodes;
  nodes:=nodes||(select coalesce(jsonb_agg(jsonb_build_object('entity',to_jsonb(e)-'search_vector','depth',hop) order by e.id),'[]') from public.entity e where e.workspace_id=p_workspace_id and e.id=any(new_nodes));
  traversed:=traversed||array(select distinct r.id from public.relation r join public.predicate_registry p on (p.workspace_id,p.name)=(r.workspace_id,r.predicate) where r.workspace_id=p_workspace_id and (p_predicates is null or r.predicate=any(p_predicates)) and ((r.from_id=any(frontier) and r.to_id=any(visited) and (not p.directed or p_direction in ('both','outgoing'))) or (r.to_id=any(frontier) and r.from_id=any(visited) and (not p.directed or p_direction in ('both','incoming')))));
  if cardinality(visited)-1>=cap then truncated:=true; exit; end if;
  frontier:=new_nodes;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') into rels from public.relation r where r.workspace_id=p_workspace_id and r.id=any(traversed);
 return jsonb_build_object('start',to_jsonb(start_row)-'search_vector','nodes',nodes,'relations',rels,'truncated',truncated);
end $$;
revoke all on function public.registry_traverse(uuid,uuid,int,text,text[],int) from public,anon,authenticated,service_role;
grant execute on function public.registry_traverse(uuid,uuid,int,text,text[],int) to authenticated;
