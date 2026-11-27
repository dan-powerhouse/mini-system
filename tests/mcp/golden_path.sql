-- Additive scope and audit checks. All generated fixtures rollback; no persistent test seed.
\set ON_ERROR_STOP on
begin;
do $$ declare u uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email,email_confirmed_at) values(u,u::text||'@example.invalid',now()),(a,a::text||'@example.invalid',now()),(v,v::text||'@example.invalid',now());
 perform set_config('gold.owner',u::text,true); perform set_config('gold.admin',a::text,true); perform set_config('gold.viewer',v::text,true);
 perform set_config('request.jwt.claim.sub',u::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare w uuid; f uuid; begin
 w:=(public.workspace_create('Golden path SQL','golden-'||gen_random_uuid()::text)).id;
 f:=(public.workspace_create('Golden isolation SQL','golden-'||gen_random_uuid()::text)).id;
 perform set_config('gold.w',w::text,true); perform set_config('gold.foreign',f::text,true);
end $$;
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values(current_setting('gold.w')::uuid,current_setting('gold.admin')::uuid,'admin'),(current_setting('gold.w')::uuid,current_setting('gold.viewer')::uuid,'viewer');
set local role authenticated;
do $$ declare w uuid:=current_setting('gold.w')::uuid; u uuid:=current_setting('gold.owner')::uuid; a uuid:=current_setting('gold.admin')::uuid; v uuid:=current_setting('gold.viewer')::uuid; i jsonb; begin
 begin perform public.token_issue(w,v,'Denied',array['read','write','manage']); raise exception 'viewer manage issued'; exception when raise_exception then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
 begin perform public.token_issue(w,u,'Denied',array['read','manage']); raise exception 'manage without write issued'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR%' then raise; end if; end;
 i:=public.token_issue(w,a,'Admin golden',array['read','write','manage']); perform set_config('gold.admin_digest',encode(extensions.digest(i->>'token','sha256'),'hex'),true);
 i:=public.token_issue(w,u,'Owner existing scope',array['read','write']); perform set_config('gold.old_digest',encode(extensions.digest(i->>'token','sha256'),'hex'),true);
 i:=public.token_issue(w,v,'Viewer golden',array['read','write']); perform set_config('gold.viewer_digest',encode(extensions.digest(i->>'token','sha256'),'hex'),true);
 i:=public.token_issue(current_setting('gold.foreign')::uuid,u,'Foreign',array['read','write']); perform set_config('gold.foreign_digest',encode(extensions.digest(i->>'token','sha256'),'hex'),true);
 if has_function_privilege('authenticated','private.mcp_golden_tool(uuid,uuid,public.workspace_role,text[],text,jsonb)','EXECUTE') or has_function_privilege('service_role','private.mcp_golden_tool(uuid,uuid,public.workspace_role,text[],text,jsonb)','EXECUTE') then raise exception 'helper exposed'; end if;
 raise notice 'PASS: opt-in scope issuance and private helper isolation';
end $$;
reset role;
set local role service_role;
do $$ declare t uuid; r uuid; d jsonb; a jsonb:=jsonb_build_object('kind','person','type','type_'||replace(gen_random_uuid()::text,'-',''),'fields','[]'::jsonb); e uuid; p jsonb; begin
 perform set_config('gold.definition',a::text,true);
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.old_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_template',a); if d->>'code'<>'FORBIDDEN' then raise exception 'old token widened'; end if;
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.viewer_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_template',a); if d->>'code'<>'FORBIDDEN' then raise exception 'viewer wrote'; end if;
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_template',a); if d#>>'{result,version}'<>'1' then raise exception 'admin create failed %',d->>'code'; end if;
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_template',a); if d->>'code'<>'VERSION_CONFLICT' then raise exception 'overwrite allowed'; end if;
 p:=jsonb_build_object('name','rel_'||replace(gen_random_uuid()::text,'-',''),'description','Golden relationship','fromKinds',jsonb_build_array('person'),'toKinds',jsonb_build_array('person'),'directed',true);
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_predicate',p); if d#>>'{result,version}'<>'1' then raise exception 'predicate creation failed'; end if;
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_predicate',p); if d->>'code'<>'VERSION_CONFLICT' then raise exception 'predicate overwrite allowed'; end if;
 raise notice 'PASS: authorized create-only ontology and old-token/viewer denial';
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'create_entity',jsonb_build_object('kind','person','type',a->>'type','title','Golden test')); e:=(d#>>'{result,entity,id}')::uuid;
 if e is null then raise exception 'entity creation failed'; end if;
 perform set_config('gold.entity',e::text,true);
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'update_entity',jsonb_build_object('id',e,'expectedVersion',1,'title','Golden updated')); if d#>>'{result,entity,version}'<>'2' then raise exception 'update failed'; end if;
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.viewer_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'get_entity_history',jsonb_build_object('id',e,'limit',1)); if d#>>'{result,items,0,afterVersion}'<>'2' or d#>>'{result,items,0,action}'<>'entity.update' or d#>>'{result,nextCursor}' is null or (d#>'{result,items,0}')?'after' then raise exception 'history mismatch'; end if;
 r:=gen_random_uuid(); t:=(public.mcp_begin(current_setting('gold.foreign_digest'),r)->>'tokenId')::uuid; d:=public.mcp_dispatch(t,r,'get_entity_history',jsonb_build_object('id',e)); if d->>'code'<>'NOT_FOUND' then raise exception 'foreign audit exposed'; end if;
 raise notice 'PASS: compact audit history with current workspace isolation';
end $$;
reset role;
set local role authenticated;
select public.member_update_role(current_setting('gold.w')::uuid,current_setting('gold.admin')::uuid,'editor');
reset role;
set local role service_role;
do $$ declare r uuid:=gen_random_uuid(); t uuid; d jsonb; begin
 t:=(public.mcp_begin(current_setting('gold.admin_digest'),r)->>'tokenId')::uuid;
 d:=public.mcp_dispatch(t,r,'create_template',current_setting('gold.definition')::jsonb||jsonb_build_object('type','new_'||replace(gen_random_uuid()::text,'-','')));
 if d->>'code'<>'FORBIDDEN' then raise exception 'downgraded manage allowed'; end if;
 raise notice 'PASS: live role downgrade overrides manage scope';
end $$;
reset role;
do $$ begin
 if (select count(*) from public.audit_log where workspace_id=current_setting('gold.w')::uuid and source='mcp' and outcome='success' and action in ('template.upsert','predicate.upsert','entity.create','entity.update'))<>4 then raise exception 'missing or duplicate mutation audit'; end if;
 raise notice 'PASS: exactly one durable audit per successful mutation';
end $$;
rollback;
