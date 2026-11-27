-- Execute after migration 20261125001951_mcp_read_tools.sql in a disposable DB.
-- Synthetic tokens and fixtures are confined to the rollback transaction.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000171','mcp-context-owner@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000172','mcp-context-viewer@example.invalid',now());
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000171';
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000171","role":"authenticated"}';
set local role authenticated;
do $$ declare w uuid; foreign_w uuid; e public.entity; f public.entity; issued jsonb; begin
 w:=(public.workspace_create('MCP context test','mcp-context-test')).id;
 foreign_w:=(public.workspace_create('MCP foreign test','mcp-foreign-test')).id;
 perform set_config('test.w',w::text,true);
 perform public.template_upsert(w,'person','employee','[]');
 perform public.template_upsert(w,'app','service','[]');
 perform public.template_upsert(foreign_w,'object','foreign_only','[]');
 e:=public.entity_create(w,'{"kind":"person","type":"employee","title":"Test employee"}');
 f:=public.entity_create(w,'{"kind":"app","type":"service","title":"Test app"}');
 perform set_config('test.start',e.id::text,true);
 perform set_config('test.foreign',(public.entity_create(foreign_w,'{"kind":"object","type":"foreign_only","title":"Foreign"}')).id::text,true);
 perform public.predicate_upsert(w,'uses',array['person']::public.entity_kind[],array['app']::public.entity_kind[],true,'Uses an application');
 perform public.relation_create(w,e.id,f.id,'uses');
 perform public.saved_view_create(w,'Owner private','personal','person','{}');
 perform public.saved_view_create(w,'Shared people','workspace','person','{}');
end $$;
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values(current_setting('test.w')::uuid,'00000000-0000-0000-0000-000000000172','viewer');
set local role authenticated;
do $$ declare i jsonb; begin
 i:=public.token_issue(current_setting('test.w')::uuid,'00000000-0000-0000-0000-000000000172','Viewer context',array['read','write']);
 perform set_config('test.digest',encode(extensions.digest(i->>'token','sha256'),'hex'),true);
 if has_function_privilege('authenticated','private.mcp_read_tool(uuid,uuid,public.workspace_role,text[],text,jsonb)','EXECUTE') or has_function_privilege('service_role','private.mcp_read_tool(uuid,uuid,public.workspace_role,text[],text,jsonb)','EXECUTE') then raise exception 'helper exposed'; end if;
 raise notice 'PASS: helper cannot be called by app or service role';
end $$;
reset role;
set local role service_role;
do $$ declare b jsonb; x jsonb; d jsonb; r uuid; t uuid; op text; a jsonb; names text[]:=array['get_context','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views']; begin
 foreach op in array names loop
  a:=case op when 'list_templates' then '{"limit":1}'::jsonb when 'get_template' then '{"kind":"person","type":"employee"}'::jsonb when 'run_path_report' then jsonb_build_object('startId',current_setting('test.start'),'steps','[{"predicate":"uses","direction":"outgoing"}]'::jsonb) else '{}'::jsonb end;
  r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.digest'),r); t:=(b->>'tokenId')::uuid;
  x:=public.mcp_dispatch(t,r,op,a); if x->>'ok'<>'true' then raise exception 'tool % failed: %',op,x->>'code'; end if;
  d:=x->'result';
  case op
   when 'get_context' then if d->>'role'<>'viewer' or d#>>'{workspace,id}'<>current_setting('test.w') or d->'allowedTools'?'create_entity' then raise exception 'incorrect context'; end if;
   when 'list_templates' then if jsonb_array_length(d->'items')<>1 or d->>'nextAfter' is null or d#>>'{items,0,type}'<>'service' then raise exception 'incorrect page'; end if; perform set_config('test.after',d->>'nextAfter',true);
   when 'get_template' then if d->>'type'<>'employee' or jsonb_typeof(d->'fields')<>'array' then raise exception 'template missing'; end if;
   when 'list_predicates' then if jsonb_array_length(d->'items')<>1 or d#>>'{items,0,name}'<>'uses' then raise exception 'predicate mismatch'; end if;
   when 'get_dashboard' then if d#>>'{countsByKind,person}'<>'1' or d?'recentActivity' then raise exception 'dashboard leaked history or count wrong'; end if;
   when 'run_path_report' then if jsonb_array_length(d->'paths')<>1 or d#>>'{paths,0,entities,1,title}'<>'Test app' or d#>>'{paths,0,relations,0,predicate}'<>'uses' or d#>>'{paths,0,relations,0,fromId}'<>current_setting('test.start') then raise exception 'path mismatch'; end if;
   when 'list_saved_views' then if jsonb_array_length(d->'items')<>1 or d#>>'{items,0,name}'<>'Shared people' then raise exception 'private view leaked'; end if;
  end case;
  perform public.mcp_finish(t,r,'tools/call',true);
  raise notice 'PASS: %',op;
 end loop;
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.digest'),r); t:=(b->>'tokenId')::uuid;
 x:=public.mcp_dispatch(t,r,'list_templates',jsonb_build_object('limit',1,'after',current_setting('test.after')));
 if x#>>'{result,items,0,type}'<>'employee' or x#>>'{result,nextAfter}' is not null then raise exception 'pagination failed'; end if;
 raise notice 'PASS: stable next page';
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.digest'),r); t:=(b->>'tokenId')::uuid;
 x:=public.mcp_dispatch(t,r,'run_path_report',jsonb_build_object('startId',current_setting('test.foreign'),'steps','[{"predicate":"uses","direction":"outgoing"}]'::jsonb));
 if x->>'code'<>'NOT_FOUND' then raise exception 'foreign path leaked'; end if;
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.digest'),r); t:=(b->>'tokenId')::uuid;
 x:=public.mcp_dispatch(t,r,'get_context',jsonb_build_object('workspaceId',gen_random_uuid()));
 if x->>'code'<>'VALIDATION_ERROR' then raise exception 'workspace override allowed'; end if;
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.digest'),r); t:=(b->>'tokenId')::uuid;
 x:=public.mcp_dispatch(t,r,'list_templates','{"limit":51}'); if x->>'code'<>'VALIDATION_ERROR' then raise exception 'unbounded page'; end if;
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.digest'),r); t:=(b->>'tokenId')::uuid;
 x:=public.mcp_dispatch(t,r,'create_entity','{"kind":"person","type":"employee","title":"Denied"}'); if x->>'code'<>'FORBIDDEN' then raise exception 'viewer wrote'; end if;
 raise notice 'PASS: cross-workspace, forged context, bounds and viewer mutation denied';
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_log where workspace_id=current_setting('test.w')::uuid and source='mcp')<>12 then raise exception 'MCP audit count wrong'; end if;
 if (select count(*) from public.audit_log where workspace_id=current_setting('test.w')::uuid and source='mcp' and outcome='failure')<>4 then raise exception 'failed audit count wrong'; end if;
 raise notice 'PASS: exactly one audited event per operation';
end $$;
rollback;
