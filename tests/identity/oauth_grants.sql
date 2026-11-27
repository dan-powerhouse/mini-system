-- Requires real Supabase Auth schema; disposable database only, transaction rollback.
-- Run with psql -v ON_ERROR_STOP=1 -f tests/identity/oauth_grants.sql from repository root.
\set ON_ERROR_STOP on
begin;
-- Grant model and check are installed by 20261126180000_oauth_delegation.sql.
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-000000000151','oauth-grant@example.invalid',now());
insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_name,client_type,token_endpoint_auth_method) values('00000000-0000-0000-0000-000000000152','manual','https://example.invalid/callback','authorization_code,refresh_token','Synthetic client','public','none');
insert into auth.oauth_consents(id,user_id,client_id,scopes) values('00000000-0000-0000-0000-000000000153','00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000152','openid');
insert into auth.sessions(id,user_id,oauth_client_id,created_at,updated_at) values('00000000-0000-0000-0000-000000000154','00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000152',now(),now());
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-000000000155','oauth-owner@example.invalid',now());
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000155';
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000155","role":"authenticated"}';
select set_config('egtest.workspace',(public.workspace_create('OAuth grant tests','oauth-grant-tests')).id::text,true);
insert into public.workspace_member(workspace_id,user_id,role) values(current_setting('egtest.workspace')::uuid,'00000000-0000-0000-0000-000000000151','editor');
do $$ declare w uuid:=current_setting('egtest.workspace')::uuid; u uuid:='00000000-0000-0000-0000-000000000151'; c uuid:='00000000-0000-0000-0000-000000000152'; s uuid:='00000000-0000-0000-0000-000000000154'; g uuid; begin
 if has_function_privilege('authenticated','private.oauth_grant_check(uuid,uuid,uuid,uuid,text)','EXECUTE') or has_function_privilege('service_role','private.oauth_grant_check(uuid,uuid,uuid,uuid,text)','EXECUTE') or has_table_privilege('authenticated','private.oauth_application_grant','SELECT') then raise exception 'private surface exposed'; end if;
 raise notice 'PASS: no public or service grant access';
 begin perform private.oauth_grant_check(w,u,c,s,'get_entity'); raise exception 'ungranted allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: native identity without explicit Registry grant denied';
 insert into private.oauth_application_grant(workspace_id,user_id,client_id,operations,created_by,expires_at) values(w,u,c,array['get_entity','update_entity'],u,now()+interval '1 hour') returning id into g;
 if private.oauth_grant_check(w,u,c,s,'get_entity')<>g or private.oauth_grant_check(w,u,c,s,'update_entity')<>g then raise exception 'valid grant denied'; end if;
 raise notice 'PASS: explicitly granted operations allowed';
 begin perform private.oauth_grant_check(w,u,c,s,'archive_entity'); raise exception 'ungranted operation allowed'; exception when insufficient_privilege then null; end;
 begin perform private.oauth_grant_check(w,u,c,gen_random_uuid(),'get_entity'); raise exception 'forged session allowed'; exception when insufficient_privilege then null; end;
 begin perform private.oauth_grant_check(gen_random_uuid(),u,c,s,'get_entity'); raise exception 'foreign workspace allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: wrong operation, session and workspace denied';
 update public.workspace_member set role='viewer' where workspace_id=w and user_id=u;
 if private.oauth_grant_check(w,u,c,s,'get_entity')<>g then raise exception 'viewer read denied'; end if;
 begin perform private.oauth_grant_check(w,u,c,s,'update_entity'); raise exception 'viewer write allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: current role intersects grant, including role downgrade';
 update auth.oauth_consents set revoked_at=clock_timestamp() where user_id=u and client_id=c;
 begin perform private.oauth_grant_check(w,u,c,s,'get_entity'); raise exception 'revoked consent allowed'; exception when insufficient_privilege then null; end;
 update auth.oauth_consents set revoked_at=null where user_id=u and client_id=c;
 update auth.sessions set not_after=now()-interval '1 second' where id=s;
 begin perform private.oauth_grant_check(w,u,c,s,'get_entity'); raise exception 'expired session allowed'; exception when insufficient_privilege then null; end;
 update auth.sessions set not_after=null where id=s;
 raise notice 'PASS: native consent revocation and expired session denied';
 update private.oauth_application_grant set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=g;
 begin perform private.oauth_grant_check(w,u,c,s,'get_entity'); raise exception 'expired grant allowed'; exception when insufficient_privilege then null; end;
 update private.oauth_application_grant set expires_at=now()+interval '1 hour',revoked_at=now(),revoked_by=u where id=g;
 begin perform private.oauth_grant_check(w,u,c,s,'get_entity'); raise exception 'revoked grant allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: expired and revoked application grants denied';
 insert into private.oauth_application_grant(workspace_id,user_id,client_id,operations,created_by,expires_at) values(w,u,c,array['get_entity'],u,now()+interval '1 hour');
 delete from public.workspace_member where workspace_id=w and user_id=u;
 begin perform private.oauth_grant_check(w,u,c,s,'get_entity'); raise exception 'removed member allowed'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: removed member denied';
end $$;
rollback;
