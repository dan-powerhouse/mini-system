-- Supabase platform configuration: Storage limits, GraphQL surface, native Cron.
-- Requires the Supabase Storage schema, pg_cron, pg_net and Vault; standalone
-- PostgreSQL harnesses skip this file. Additive; no Registry data or grants change.
-- Process expiry/reconcile are NOT scheduled: they are per-Process operations
-- that belong to worker activation.

-- Storage enforces upload limits itself (matches Edge MAX_BYTES = 20 MiB and
--    private.import_job.size_bytes). process-artifacts stays unrestricted until the
--    execution artifact format is approved.
update storage.buckets set file_size_limit=20971520, allowed_mime_types=array['application/zip']
 where id in ('process-kind-packages','registry-exchange');
do $$ begin
 if (select count(*) from storage.buckets where id in ('process-kind-packages','registry-exchange') and file_size_limit=20971520 and allowed_mime_types=array['application/zip'] and not public)<>2 then
  raise exception 'BUCKET_LIMITS_REQUIRED';
 end if;
end $$;

-- The Registry API is RPC + PostgREST only; remove the unused GraphQL surface.
drop extension if exists pg_graphql;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- SQL-only purge: expired MCP request tickets (mcp_begin only prunes the active
-- token's window) and expired export snapshots (no Storage object exists for them).
-- Durable audit_log and security_event_log rows are never deleted here.
create function private.maintenance_purge() returns jsonb language plpgsql security definer set search_path='' as $$
declare tickets int; exports int;
begin
 delete from private.api_rate_bucket where at<clock_timestamp()-interval '1 day';
 get diagnostics tickets=row_count;
 delete from private.export_job where expires_at<=clock_timestamp();
 get diagnostics exports=row_count;
 return jsonb_build_object('tickets',tickets,'exports',exports);
end $$;
revoke all on function private.maintenance_purge() from public,anon,authenticated,service_role;

-- Expired import ZIPs live in Storage, which forbids direct SQL deletes; the
-- exchange-cleanup Edge Function removes them through the Storage API.
-- Configuration lives in Supabase Vault (never in migrations):
--   select vault.create_secret('https://<ref>.supabase.co','project_url');
--   select vault.create_secret('<random>','exchange_cleanup_secret');
-- and the same random value as the Edge secret EXCHANGE_CLEANUP_SECRET.
-- Until both Vault secrets exist the job is a no-op.
create function private.invoke_exchange_cleanup() returns bigint language plpgsql security definer set search_path='' as $$
declare base text; secret text;
begin
 select decrypted_secret into base from vault.decrypted_secrets where name='project_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='exchange_cleanup_secret';
 if base is null or secret is null then return null; end if;
 return net.http_post(
  url:=rtrim(base,'/')||'/functions/v1/exchange-cleanup',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),
  body:='{}'::jsonb,
  timeout_milliseconds:=30000);
end $$;
revoke all on function private.invoke_exchange_cleanup() from public,anon,authenticated,service_role;

select cron.schedule('entitygraph-maintenance-purge','17 * * * *','select private.maintenance_purge()');
select cron.schedule('entitygraph-exchange-cleanup','*/15 * * * *','select private.invoke_exchange_cleanup()');
