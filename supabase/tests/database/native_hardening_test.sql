begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);
select is((select count(*)::int from storage.buckets where id in ('process-kind-packages','registry-exchange') and not public and file_size_limit=20971520 and allowed_mime_types=array['application/zip']),2,'zip buckets enforce 20 MiB and application/zip');
select is((select public from storage.buckets where id='process-artifacts'),false,'artifact bucket remains private');
select is((select count(*)::int from pg_constraint c where c.contype='f' and c.connamespace in ('public'::regnamespace,'private'::regnamespace)
  and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and (i.indkey::int2[])[0:cardinality(c.conkey)-1] @> c.conkey and c.conkey @> (i.indkey::int2[])[0:cardinality(c.conkey)-1])),0,'every foreign key has a covering index');
select ok(not exists(select 1 from pg_extension where extname='pg_graphql'),'GraphQL surface removed');
select ok(exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net'),'pg_cron and pg_net installed');
select is((select count(*)::int from cron.job where jobname in ('entitygraph-maintenance-purge','entitygraph-exchange-cleanup') and active),2,'maintenance jobs scheduled');
select ok(not exists(select 1 from cron.job where command ilike '%process_expire%' or command ilike '%process_reconcile%'),'execution recovery is not scheduled');
select ok(not has_function_privilege('authenticated','private.maintenance_purge()','execute') and not has_function_privilege('service_role','private.maintenance_purge()','execute'),'purge not callable by API roles');
select ok(not has_function_privilege('authenticated','private.invoke_exchange_cleanup()','execute') and not has_function_privilege('anon','private.invoke_exchange_cleanup()','execute'),'cleanup trigger not callable by API roles');
select is(private.invoke_exchange_cleanup(),null::bigint,'cleanup call is a no-op without Vault configuration');
-- Expired rows are purged; live rows and durable audit are kept.
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-0000000001a1','purge@example.invalid',now());
insert into public.workspace(id,name,slug) values('00000000-0000-0000-0000-0000000001a2','Purge','purge-test');
insert into public.workspace_member(workspace_id,user_id,role) values('00000000-0000-0000-0000-0000000001a2','00000000-0000-0000-0000-0000000001a1','owner');
insert into private.export_job(workspace_id,user_id,payload,created_at,expires_at) values
 ('00000000-0000-0000-0000-0000000001a2','00000000-0000-0000-0000-0000000001a1','{}',now()-interval '2 hours',now()-interval '1 hour'),
 ('00000000-0000-0000-0000-0000000001a2','00000000-0000-0000-0000-0000000001a1','{}',now(),now()+interval '1 hour');
select is((private.maintenance_purge()->>'exports')::int,1,'only expired export removed');
select is((select count(*)::int from private.export_job where workspace_id='00000000-0000-0000-0000-0000000001a2'),1,'live export kept');
select * from finish();
rollback;
