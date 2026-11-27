-- Independent test harness only. Emulates JWT role/subject injection, not actual Supabase Auth.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz, is_anonymous boolean not null default false, deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
-- Mirror the Supabase platform default: API roles may use the extensions schema
-- (pgcrypto lives there); migrations only create it if missing.
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
