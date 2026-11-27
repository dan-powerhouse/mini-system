\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000031'),('00000000-0000-0000-0000-000000000032');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000031';
select (public.workspace_create('Registry reads','registry-reads')).id as w \gset
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000032';
select (public.workspace_create('Other registry','registry-other')).id as other \gset
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000031';
do $$ declare w uuid; a public.entity; b public.entity; c public.entity; d public.entity; result jsonb; cursor text; base jsonb; begin
 select id into w from public.workspace where slug='registry-reads';
 perform public.template_upsert(w,'agent','assistant','[{"name":"provider","dataType":"text"},{"name":"score","dataType":"number"},{"name":"skills","dataType":"multiselect","options":["sql","mcp"]}]');
 perform public.template_upsert(w,'app','api','[]');
 perform public.template_upsert(w,'process_kind','standard','[]');
 a:=public.entity_create(w,'{"kind":"agent","type":"assistant","title":"Alpha agent","attributes":{"provider":"Example Labs","score":12,"skills":["sql"]},"tags":["sql"]}');
 b:=public.entity_create(w,'{"kind":"agent","type":"assistant","title":"Beta agent","attributes":{"provider":"Other","score":2,"skills":["mcp"]},"tags":["mcp"]}');
 c:=public.entity_create(w,'{"kind":"app","type":"api","title":"API","notes":"Example endpoint"}');
 d:=public.entity_create(w,'{"kind":"process_kind","type":"standard","title":"Registry Standard"}');
 result:=public.entity_search(w,'{"q":"example"}');
 if jsonb_array_length(result->'items')<>2 then raise exception 'full-text search incorrect: %',result; end if;
 raise notice 'PASS: full-text search covers notes and attribute strings';
 result:=public.entity_search(w,'{"kind":"agent","type":"assistant","tagsAny":["SQL","mcp"],"attributeFilters":[{"key":"score","operator":"gte","value":10},{"key":"provider","operator":"contains","value":"labs"},{"key":"skills","operator":"contains","value":"sql"}]}');
 if jsonb_array_length(result->'items')<>1 or result#>>'{items,0,id}'<>a.id::text then raise exception 'combined search filters incorrect'; end if;
 raise notice 'PASS: kind/type/tag/numeric/string/array filters combine correctly';
 begin perform public.entity_search(w,'{"attributeFilters":[{"key":"score","operator":"gt","value":"10"}]}'); raise exception 'bad filter accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; end;
 raise notice 'PASS: incompatible numeric filter rejected';
 base:='{"kind":"agent","limit":1,"sort":{"field":"title","direction":"asc"}}';
 result:=public.entity_search(w,base); cursor:=result->>'nextCursor';
 if cursor is null or result#>>'{items,0,id}'<>a.id::text then raise exception 'first page incorrect'; end if;
 result:=public.entity_search(w,base||jsonb_build_object('cursor',cursor));
 if result#>>'{items,0,id}'<>b.id::text or result->>'nextCursor' is not null then raise exception 'second page incorrect'; end if;
 raise notice 'PASS: stable signed keyset pagination';
 begin perform public.entity_search(w,base||jsonb_build_object('cursor',cursor,'kind','app')); raise exception 'cross-query cursor accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; end;
 begin perform public.entity_search(w,base||jsonb_build_object('cursor',substr(cursor,1,length(cursor)-1)||case right(cursor,1) when 'a' then 'b' else 'a' end)); raise exception 'tampered cursor accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; end;
 raise notice 'PASS: mismatched and tampered cursors rejected';
 perform public.predicate_upsert(w,'uses',array['agent']::public.entity_kind[],array['app']::public.entity_kind[],true,'Uses application');
 perform public.predicate_upsert(w,'supports',array['app']::public.entity_kind[],array['process_kind']::public.entity_kind[],false,'Supports a standard');
 perform public.relation_create(w,a.id,c.id,'uses'); perform public.relation_create(w,b.id,c.id,'uses'); perform public.relation_create(w,c.id,d.id,'supports');
 result:=public.registry_traverse(w,a.id,2,'outgoing');
 if jsonb_array_length(result->'nodes')<>2 or jsonb_array_length(result->'relations')<>2 or not exists(select 1 from jsonb_array_elements(result->'nodes') n where n#>>'{entity,id}'=d.id::text and n->>'depth'='2') then raise exception 'outgoing traversal incorrect: %',result; end if;
 raise notice 'PASS: bounded directed two-hop traversal';
 result:=public.registry_traverse(w,d.id,1,'outgoing');
 if jsonb_array_length(result->'nodes')<>1 or result#>>'{nodes,0,entity,id}'<>c.id::text then raise exception 'undirected traversal incorrect'; end if;
 raise notice 'PASS: undirected predicate follows both endpoints';
 result:=public.registry_traverse(w,c.id,1,'incoming',array['uses'],1);
 if jsonb_array_length(result->'nodes')<>1 or not (result->>'truncated')::boolean then raise exception 'node cap failed'; end if;
 raise notice 'PASS: predicate filter and traversal node cap';
 begin perform public.registry_traverse(w,a.id,4); raise exception 'invalid depth accepted'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR:%' then raise; end if; end;
 raise notice 'PASS: rejects depth above three';
 perform public.entity_archive(w,b.id,1);
 if jsonb_array_length(public.registry_traverse(w,c.id,1,'incoming',array['uses'])->'nodes')<>1 or jsonb_array_length(public.entity_search(w,'{"kind":"agent"}')->'items')<>1 or jsonb_array_length(public.entity_search(w,'{"status":["archived"]}')->'items')<>1 then raise exception 'archive filtering incorrect'; end if;
 raise notice 'PASS: archived entity visibility rules in search and traversal';
end $$;
reset role;
-- Store IDs for cross-workspace tests before changing principal.
select id as start_id from public.entity where workspace_id=:'w' and title='Alpha agent' \gset
select set_config('test.workspace_a',:'w',true),set_config('test.start_a',:'start_id',true);
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000032';
do $$ declare w uuid:=current_setting('test.workspace_a')::uuid; e uuid:=current_setting('test.start_a')::uuid; begin
 begin perform public.entity_search(w,'{}'); raise exception 'foreign search accepted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform public.registry_traverse(w,e,1); raise exception 'foreign traversal accepted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform private.search_cursor_sign('{}'); raise exception 'private signer callable'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: foreign workspace and private cursor signer denied';
end $$;
reset role;
rollback;
