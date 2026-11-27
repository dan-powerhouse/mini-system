\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000051','mcp@example.invalid',now());
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000051';
select (public.workspace_create('MCP tests','mcp-tests')).id as w \gset
select (public.template_upsert(:'w','agent','assistant','[]')).version;
select public.token_issue(:'w',auth.uid(),'writer',array['read','write']) as issued \gset
select public.token_issue(:'w',auth.uid(),'reader',array['read']) as readonly_issued \gset
select set_config('test.w',:'w',true) as _w, set_config('test.writer',:'issued',true) as _writer, set_config('test.reader',:'readonly_issued',true) as _reader \gset
-- Normal user cannot open a trusted Edge ticket, even with their own token.
do $$ begin
 begin perform public.mcp_begin(repeat('a',64),gen_random_uuid()); raise exception 'client opened MCP ticket'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: MCP trusted entry denied to authenticated client';
end $$;
reset role;
select set_config('test.writer_digest',encode(extensions.digest((current_setting('test.writer')::jsonb)->>'token','sha256'),'hex'),true) as _wd, set_config('test.reader_digest',encode(extensions.digest((current_setting('test.reader')::jsonb)->>'token','sha256'),'hex'),true) as _rd \gset
set local role service_role;
do $$ declare r uuid:=gen_random_uuid(); t uuid; b jsonb; result jsonb; begin
 b:=public.mcp_begin(current_setting('test.writer_digest'),r); t:=(b->>'tokenId')::uuid;
 if not (b->>'ok')::boolean then raise exception 'valid token rejected'; end if;
 result:=public.mcp_dispatch(t,r,'create_entity','{"kind":"agent","type":"assistant","title":"MCP test entity"}');
 if not (result->>'ok')::boolean then raise exception 'MCP create failed: %',result->>'code'; end if;
 perform public.mcp_finish(t,r,'tools/call',true);
 perform set_config('test.entity_id',result#>>'{result,entity,id}',true); perform set_config('test.success_request',r::text,true);
 raise notice 'PASS: scoped writer executes existing entity RPC';
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.reader_digest'),r); t:=(b->>'tokenId')::uuid;
 result:=public.mcp_dispatch(t,r,'create_entity','{"kind":"agent","type":"assistant","title":"Must not exist"}');
 if result->>'code'<>'FORBIDDEN' then raise exception 'read token wrote'; end if;
 perform set_config('test.failure_request',r::text,true);
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.reader_digest'),r); t:=(b->>'tokenId')::uuid;
 result:=public.mcp_dispatch(t,r,'get_entity',jsonb_build_object('id',current_setting('test.entity_id')));
 if not (result->>'ok')::boolean then raise exception 'read token could not read'; end if;
 perform public.mcp_finish(t,r,'tools/call',true);
 r:=gen_random_uuid(); b:=public.mcp_begin(current_setting('test.reader_digest'),r); t:=(b->>'tokenId')::uuid; perform public.mcp_finish(t,r,'tools/list',true); perform public.mcp_finish(t,r,'tools/list',true);
 perform set_config('test.list_request',r::text,true);
 raise notice 'PASS: read-only token cannot write; reads and discovery finalize';
end $$;
reset role;
do $$ declare w uuid:=current_setting('test.w')::uuid; n int; begin
 select count(*) into n from public.audit_log where request_id=current_setting('test.success_request') and actor_type='token' and source='mcp' and action='entity.create' and after->>'title'='MCP test entity';
 if n<>1 then raise exception 'mutation audit not exactly once'; end if;
 select count(*) into n from public.audit_log where request_id=current_setting('test.failure_request') and outcome='failure' and source='mcp'; if n<>1 then raise exception 'failure audit missing'; end if;
 select count(*) into n from public.audit_log where request_id=current_setting('test.list_request') and outcome='success' and source='mcp'; if n<>1 then raise exception 'discovery audit not exactly once'; end if;
 if (select count(*) from public.entity where workspace_id=w)<>1 then raise exception 'forbidden write left data'; end if;
 raise notice 'PASS: exactly one mutation, failure and protocol audit per request';
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000051';
select public.token_revoke(:'w',((current_setting('test.writer')::jsonb)#>>'{summary,id}')::uuid);
reset role;
set local role service_role;
do $$ declare b jsonb; begin
 b:=public.mcp_begin(current_setting('test.writer_digest'),gen_random_uuid()); if b->>'code'<>'UNAUTHENTICATED' then raise exception 'revoked token accepted'; end if;
 raise notice 'PASS: revoked credentials fail immediately';
end $$;
reset role;
rollback;
