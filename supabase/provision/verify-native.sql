-- Checks provisioned native components without enqueuing real work.
do $$ begin
 if (select count(*) from storage.buckets where id in ('process-kind-packages','process-artifacts','registry-exchange') and not public)<>3 then raise exception 'PRIVATE_BUCKETS_REQUIRED'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='entitygraph_artifacts_locked' and permissive='RESTRICTIVE') then raise exception 'ARTIFACT_ACCESS_POLICY_REQUIRED'; end if;
 if not exists(select 1 from pgmq.list_queues() q where q.queue_name='entitygraph_process') then raise exception 'QUEUE_REQUIRED'; end if;
 if has_schema_privilege('anon','pgmq','USAGE') or has_schema_privilege('authenticated','pgmq','USAGE') or has_schema_privilege('service_role','pgmq','USAGE') then raise exception 'QUEUE_ACCESS_TOO_BROAD'; end if;
 if has_table_privilege('authenticated','public.process','INSERT') then raise exception 'PROCESS_WRITE_EXPOSED'; end if;
 raise notice 'PASS: private artifact buckets, locked queue, execution writes disabled';
end $$;
