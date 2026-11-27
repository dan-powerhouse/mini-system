\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000121'),('00000000-0000-0000-0000-000000000122');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000121';
select (public.workspace_create('Execution test','execution-test')).id as w \gset
select (public.template_upsert(:'w','process_kind','review','[]')).version;
select (public.template_upsert(:'w','person','employee','[]')).version;
select (public.entity_create(:'w','{"kind":"process_kind","type":"review","title":"Review"}')).id as k \gset
select (public.entity_create(:'w','{"kind":"person","type":"employee","title":"Requester"}')).id as r \gset
select set_config('test.w',:'w',true),set_config('test.k',:'k',true),set_config('test.r',:'r',true) \gset
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values(:'w','00000000-0000-0000-0000-000000000122','editor');
set local role service_role;
select (public.process_kind_publish(:'w','00000000-0000-0000-0000-000000000121',:'k',1,0,gen_random_uuid(),repeat('a',64),'{}')).version;
reset role;
do $$ declare w uuid:=current_setting('test.w')::uuid; k uuid:=current_setting('test.k')::uuid; r uuid:=current_setting('test.r')::uuid;
 p public.process; q public.process; a jsonb; b jsonb; finish jsonb; fence uuid; old_fence uuid; cid uuid:=gen_random_uuid(); msg bigint;
begin
 p:=private.process_create(w,k,1,r,'person','native-one','{"hello":"world"}',null,'edge-a',20,2);
 q:=private.process_create(w,k,1,r,'person','native-one','{"hello":"world"}',null,'edge-a',20,2);
 if q.id<>p.id or p.status<>'created' then raise exception 'creation idempotency'; end if;
 begin perform private.process_create(w,k,1,r,'person','native-one','{}',null,'edge-a',20,2); raise exception 'expected conflict'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin perform private.process_create(w,k,99,r,'person','missing','{}'); raise exception 'unknown standard'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: process creation pins a published version and rejects changed idempotency request';

 -- Roll back the mutation and the actual PGMQ message together.
 begin perform private.process_dispatch(w,p.id,1); raise exception 'test rollback'; exception when raise_exception then if sqlerrm<>'test rollback' then raise; end if; end;
 if exists(select 1 from pgmq.q_entitygraph_process) or exists(select 1 from private.process_delivery where process_id=p.id) or (select status from public.process where id=p.id)<>'created' then raise exception 'non-atomic dispatch'; end if;
 raise notice 'PASS: native queue dispatch rolls back with Process state';
 p:=private.process_dispatch(w,p.id,1);
 q:=private.process_dispatch(w,p.id,1);
 if p.status<>'queued' or p.version<>2 or q.id<>p.id or (select count(*) from pgmq.q_entitygraph_process)<>1 or not exists(select 1 from pgmq.q_entitygraph_process where message=jsonb_build_object('processId',p.id)) then raise exception 'dispatch idempotency or payload'; end if;
 raise notice 'PASS: one native queue message, only Process ID, idempotent dispatch';
 begin perform private.process_claim(w,p.id,'edge-b',60); raise exception 'wrong edge allowed'; exception when insufficient_privilege then null; end;
 -- Even the native queue acknowledgement rolls back if claiming aborts.
 begin perform private.process_claim(w,p.id,'edge-a',60); raise exception 'test rollback'; exception when raise_exception then if sqlerrm<>'test rollback' then raise; end if; end;
 if (select count(*) from pgmq.q_entitygraph_process)<>1 or exists(select 1 from private.process_attempt where process_id=p.id) or (select status from public.process where id=p.id)<>'queued' then raise exception 'non-atomic claim'; end if;
 raise notice 'PASS: wrong Edge denied and aborted claim preserves native message';
 a:=private.process_claim(w,p.id,'edge-a',60); fence:=(a->>'fence')::uuid;
 if fence is null or a#>>'{process,status}'<>'running' or a#>>'{process,attempt_count}'<>'1' or exists(select 1 from pgmq.q_entitygraph_process) or private.process_claim(w,p.id,'edge-a',60) is not null then raise exception 'claim exclusivity'; end if;
 raise notice 'PASS: exclusive claim consumes real native message and creates fenced attempt';
 perform pgmq.send('entitygraph_process',jsonb_build_object('processId',p.id));
 b:=private.process_claim(w,p.id,'edge-a',60);
 if b is not null or exists(select 1 from pgmq.q_entitygraph_process)
 or (select count(*) from private.process_attempt where process_id=p.id)<>1 then raise exception 'duplicate redelivery not reconciled'; end if;
 raise notice 'PASS: duplicate queue redelivery discarded without a second attempt';
 begin perform private.process_heartbeat(w,p.id,gen_random_uuid(),10,60); raise exception 'wrong fence allowed'; exception when raise_exception then if sqlerrm<>'LEASE_LOST' then raise; end if; end;
 p:=private.process_heartbeat(w,p.id,fence,30,60);
 if p.progress<>30 then raise exception 'heartbeat'; end if;
 begin perform private.process_heartbeat(w,p.id,fence,29,60); raise exception 'regressing progress'; exception when raise_exception then if sqlerrm<>'VALIDATION_ERROR: progress regression' then raise; end if; end;
 raise notice 'PASS: heartbeat requires current fence and monotonic progress';
 finish:=private.process_finish(w,p.id,fence,cid,false,null,'{"code":"TEMPORARY"}');
 if finish->>'status'<>'retry_waiting' or exists(select 1 from pgmq.q_entitygraph_process) then raise exception 'unexpected automatic retry'; end if;
 if private.process_finish(w,p.id,fence,cid,false,null,'{"code":"TEMPORARY"}')<>finish then raise exception 'completion replay'; end if;
 begin perform private.process_finish(w,p.id,fence,cid,false,null,'{"code":"changed"}'); raise exception 'changed completion replay'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 raise notice 'PASS: failed attempt is not terminal, no auto-retry, completion replay exact';
 old_fence:=fence;
 p:=private.process_dispatch(w,p.id,(finish->>'version')::int);
 a:=private.process_claim(w,p.id,'edge-a',60); fence:=(a->>'fence')::uuid;
 if a#>>'{process,id}'<>p.id::text or a#>>'{process,attempt_count}'<>'2' or fence=old_fence then raise exception 'retry identity/fence'; end if;
 begin perform private.process_heartbeat(w,p.id,old_fence,90,60); raise exception 'stale attempt updated'; exception when raise_exception then if sqlerrm<>'LEASE_LOST' then raise; end if; end;
 begin perform private.process_finish(w,p.id,old_fence,gen_random_uuid(),true,'{}'); raise exception 'stale attempt completed'; exception when raise_exception then if sqlerrm<>'LEASE_LOST' then raise; end if; end;
 raise notice 'PASS: retry uses same Process ID with new fence; old worker cannot mutate';
 finish:=private.process_finish(w,p.id,fence,gen_random_uuid(),true,'{"result":"ok"}');
 select * into p from public.process where id=p.id;
 if p.status<>'succeeded' or p.progress<>100 or p.completed_at is null or p.outputs<>'{"result":"ok"}'::jsonb or (select count(*) from private.process_attempt where process_id=p.id)<>2 then raise exception 'terminal success'; end if;
 begin perform private.process_cancel(w,p.id,p.version); raise exception 'terminal cancellation'; exception when raise_exception then if sqlerrm<>'INVALID_PROCESS_STATE' then raise; end if; end;
 raise notice 'PASS: successful terminal state has output, history and 100 percent progress';

 p:=private.process_create(w,k,1,r,'person','native-expiry','{}');
 p:=private.process_dispatch(w,p.id,p.version);
 a:=private.process_claim(w,p.id,'edge-b',1); fence:=(a->>'fence')::uuid;
 -- The retry request must match the original unassigned Edge, even after claim.
 q:=private.process_create(w,k,1,r,'person','native-expiry','{}');
 if q.id<>p.id then raise exception 'initial request not preserved'; end if;
 begin perform private.process_create(w,k,1,r,'person','native-expiry','{}',null,'edge-b'); raise exception 'changed initial Edge accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 perform pg_sleep(1.1);
 begin perform private.process_heartbeat(w,p.id,fence,30,60); raise exception 'expired heartbeat accepted'; exception when raise_exception then if sqlerrm<>'LEASE_LOST' then raise; end if; end;
 p:=private.process_expire(w,p.id);
 if p.status<>'failed' or p.completed_at is null or p.error->>'code'<>'LEASE_EXPIRED' or (select outcome from private.process_attempt where process_id=p.id)<>'expired' then raise exception 'expiry recovery'; end if;
 raise notice 'PASS: real lease expiry fences worker, exhausts attempts and preserves request digest';

 p:=private.process_create(w,k,1,r,'person','native-repair','{}');
 p:=private.process_dispatch(w,p.id,p.version);
 select message_id into msg from private.process_delivery where process_id=p.id;
 perform pgmq.delete('entitygraph_process',msg);
 if private.process_claim(w,p.id,'edge-c',60) is not null then raise exception 'claim without message'; end if;
 p:=private.process_reconcile(w,p.id,p.version);
 if not exists(select 1 from pgmq.q_entitygraph_process where message=jsonb_build_object('processId',p.id)) then raise exception 'repair did not enqueue'; end if;
 raise notice 'PASS: explicit reconciliation restores lost native queue delivery';
 p:=private.process_cancel(w,p.id,p.version);
 if p.status<>'cancelled' or p.started_at is not null or p.completed_at is null or exists(select 1 from pgmq.q_entitygraph_process) then raise exception 'pre-start cancellation'; end if;
 raise notice 'PASS: pre-start cancellation removes native delivery atomically';

 p:=private.process_create(w,k,1,r,'person','native-cancel','{}');
 p:=private.process_dispatch(w,p.id,p.version);
 a:=private.process_claim(w,p.id,'edge-d',60); fence:=(a->>'fence')::uuid;
 p:=private.process_cancel(w,p.id,(a#>>'{process,version}')::int);
 begin perform private.process_finish(w,p.id,fence,gen_random_uuid(),true,'{}'); raise exception 'cancelled worker completed'; exception when raise_exception then if sqlerrm<>'LEASE_LOST' then raise; end if; end;
 if p.status<>'cancelled' or (select outcome from private.process_attempt where process_id=p.id)<>'cancelled' then raise exception 'running cancellation'; end if;
 raise notice 'PASS: running cancellation revokes lease and prevents late completion';
 if (select count(*) from public.entity where workspace_id=w)<>2 or exists(select 1 from public.audit_log where workspace_id=w and target_type='process') or (select count(*) from private.process_event where workspace_id=w and action='process.create')<>4 then raise exception 'execution audit or registry boundary'; end if;
 raise notice 'PASS: operational audit separate, Registry still contains only its two entities';
end $$;
-- All private execution entry points and operational tables remain unavailable.
do $$ declare x record; role_name text; begin
 for x in select p.oid from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='private' and p.proname like 'process_%' loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,x.oid,'execute') then raise exception 'execution function exposed to %',role_name; end if;
  end loop;
 end loop;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'private.process_attempt','SELECT') or has_table_privilege(role_name,'private.process_event','SELECT') or has_table_privilege(role_name,'public.process','INSERT') or has_schema_privilege(role_name,'pgmq','USAGE') then raise exception 'operational access exposed to %',role_name; end if;
 end loop;
 raise notice 'PASS: no application role can invoke private execution or native PGMQ';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000122';
do $$ begin
 begin perform private.process_create(current_setting('test.w')::uuid,current_setting('test.k')::uuid,1,current_setting('test.r')::uuid,'person','editor','{}'); raise exception 'editor allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: internal Center creation rechecks current admin membership';
end $$;
rollback;
