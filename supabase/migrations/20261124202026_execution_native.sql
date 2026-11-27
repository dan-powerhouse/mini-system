create extension if not exists pgmq;
select pgmq.create('entitygraph_process');
revoke usage on schema pgmq from public,anon,authenticated,service_role;
revoke all on all tables in schema pgmq from public,anon,authenticated,service_role;
revoke execute on all functions in schema pgmq from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public) values ('process-kind-packages','process-kind-packages',false),('process-artifacts','process-artifacts',false),('registry-exchange','registry-exchange',false) on conflict(id) do nothing;
do $$ begin if exists(select 1 from storage.buckets where id in ('process-kind-packages','process-artifacts','registry-exchange') and public) then raise exception 'ENTITYGRAPH_BUCKET_MUST_BE_PRIVATE'; end if; end $$;
drop policy if exists entitygraph_artifacts_locked on storage.objects;
create policy entitygraph_artifacts_locked on storage.objects as restrictive for all to anon,authenticated using (bucket_id not in ('process-kind-packages','process-artifacts','registry-exchange')) with check (bucket_id not in ('process-kind-packages','process-artifacts','registry-exchange'));