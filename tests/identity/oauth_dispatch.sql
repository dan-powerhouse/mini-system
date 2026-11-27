-- Delegated OAuth MCP dispatch (20261126180000_oauth_delegation.sql).
-- Requires the real Supabase Auth schema; disposable database, rollback only.
-- JWT claims are set as PostgREST sets them after verifying the token.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000161','oauth-owner@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000162','oauth-editor@example.invalid',now()),
 ('00000000-0000-0000-0000-000000000163','oauth-viewer@example.invalid',now());
insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_name,client_type,token_endpoint_auth_method) values
 ('00000000-0000-0000-0000-000000000164','manual','https://example.invalid/callback','authorization_code,refresh_token','Synthetic MCP client','public','none'),
 ('00000000-0000-0000-0000-000000000165','manual','https://example.invalid/other','authorization_code,refresh_token','Unconsented client','public','none');
insert into auth.oauth_consents(id,user_id,client_id,scopes) values
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000162','00000000-0000-0000-0000-000000000164','openid'),
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000163','00000000-0000-0000-0000-000000000164','openid');
insert into auth.sessions(id,user_id,oauth_client_id,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000166','00000000-0000-0000-0000-000000000162','00000000-0000-0000-0000-000000000164',now(),now()),
 ('00000000-0000-0000-0000-000000000167','00000000-0000-0000-0000-000000000163','00000000-0000-0000-0000-000000000164',now(),now());
-- Owner sets up the workspace with a direct session.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000161","role":"authenticated"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000161';
select set_config('t.w',(public.workspace_create('OAuth dispatch','oauth-dispatch')).id::text,true);
select public.template_upsert(current_setting('t.w')::uuid,'object','asset','[]');
select set_config('t.e',(public.entity_create(current_setting('t.w')::uuid,'{"kind":"object","type":"asset","title":"Seed"}')).id::text,true);
reset role;
insert into public.workspace_member(workspace_id,user_id,role) values
 (current_setting('t.w')::uuid,'00000000-0000-0000-0000-000000000162','editor'),
 (current_setting('t.w')::uuid,'00000000-0000-0000-0000-000000000163','viewer');

do $$ begin
 if has_function_privilege('anon','public.mcp_oauth_dispatch(uuid,text,jsonb,uuid)','EXECUTE') or has_function_privilege('anon','public.oauth_grant_issue(uuid,uuid,text[],timestamptz,uuid)','EXECUTE')
  or has_function_privilege('service_role','public.mcp_oauth_dispatch(uuid,text,jsonb,uuid)','EXECUTE')
  or has_table_privilege('authenticated','private.oauth_application_grant','SELECT') or has_table_privilege('service_role','private.oauth_request','SELECT') then raise exception 'surface exposed'; end if;
 raise notice 'PASS: only authenticated callers reach the OAuth RPCs; grant tables private';
end $$;

-- Grant issuance from the editor's direct session.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000162';
do $$ declare w uuid:=current_setting('t.w')::uuid; c uuid:='00000000-0000-0000-0000-000000000164'; g jsonb; g2 jsonb; begin
 begin perform public.oauth_grant_issue(w,'00000000-0000-0000-0000-000000000165',array['get_entity'],now()+interval '1 day'); raise exception 'unconsented client granted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform public.oauth_grant_issue(w,c,array['get_entity'],now()+interval '91 days'); raise exception 'long grant allowed'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR%' then raise; end if; end;
 begin perform public.oauth_grant_issue(w,c,array['create_template'],now()+interval '1 day'); raise exception 'manage delegated'; exception when raise_exception then if sqlerrm not like 'VALIDATION_ERROR%' then raise; end if; end;
 g:=public.oauth_grant_issue(w,c,array['get_entity'],now()+interval '1 day');
 g2:=public.oauth_grant_issue(w,c,array['get_entity','search_entities','create_entity','get_entity_history'],now()+interval '30 days');
 if (select count(*) from public.oauth_grant_list(w) x where x->>'revokedAt' is null and x->>'revoked_at' is null)<>1 or not exists(select 1 from public.oauth_grant_list(w) x where x->>'id'=g->>'id' and x->>'revoked_at' is not null) then raise exception 'supersede failed'; end if;
 if (select count(*) from public.audit_log where workspace_id=w and action in ('oauth_grant.issue','oauth_grant.supersede'))<>3 then raise exception 'grant lifecycle not audited'; end if;
 perform set_config('t.g',g2->>'id',true);
 raise notice 'PASS: consented, bounded, non-manage grants issued; reissue supersedes; audited';
end $$;
-- Viewer cannot delegate mutations.
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000163","role":"authenticated"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000163';
do $$ declare w uuid:=current_setting('t.w')::uuid; c uuid:='00000000-0000-0000-0000-000000000164'; begin
 begin perform public.oauth_grant_issue(w,c,array['create_entity'],now()+interval '1 day'); raise exception 'viewer delegated write'; exception when insufficient_privilege then null; end;
 perform public.oauth_grant_issue(w,c,array['get_entity'],now()+interval '1 day');
 if (select count(*) from public.oauth_grant_list(w))<>1 then raise exception 'non-admin sees other grants'; end if;
 begin perform public.oauth_grant_revoke(w,current_setting('t.g')::uuid); raise exception 'foreign grant revoked'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: viewer read-only delegation, own-grant visibility, no foreign revocation';
end $$;

-- OAuth principal (as PostgREST presents a verified OAuth access token).
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated","client_id":"00000000-0000-0000-0000-000000000164","session_id":"00000000-0000-0000-0000-000000000166"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000162';
do $$ declare w uuid:=current_setting('t.w')::uuid; c uuid:='00000000-0000-0000-0000-000000000164'; d jsonb; r uuid; e uuid; begin
 begin perform public.oauth_grant_issue(w,c,array['get_entity'],now()+interval '1 day'); raise exception 'OAuth token managed grants'; exception when insufficient_privilege then null; end;
 begin perform public.entity_search(w,'{}'); raise exception 'OAuth token used domain RPC directly'; exception when others then if sqlerrm not in ('NOT_FOUND','FORBIDDEN') then raise; end if; end;
 d:=public.mcp_oauth_session();
 if d->>'ok'<>'true' or jsonb_array_length(d->'workspaces')<>1 or d#>>'{workspaces,0,workspaceId}'<>w::text then raise exception 'session discovery %',d; end if;
 r:=gen_random_uuid(); d:=public.mcp_oauth_dispatch(r,'get_entity',jsonb_build_object('id',current_setting('t.e')));
 if d->>'ok'<>'true' or d#>>'{result,entity,title}'<>'Seed' or d->>'workspaceId'<>w::text then raise exception 'granted read failed %',d; end if;
 perform set_config('role','postgres',true); -- audit_log is (correctly) invisible to OAuth principals
 if not exists(select 1 from public.audit_log where request_id=r::text and source='mcp' and actor_type='token' and actor_id=current_setting('t.g')::uuid and effective_user_id='00000000-0000-0000-0000-000000000162' and outcome='success' and metadata->>'oauthClientId'=c::text) then raise exception 'read not attributed to grant'; end if;
 perform set_config('role','authenticated',true);
 if public.mcp_oauth_dispatch(r,'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'code'<>'INVALID_REQUEST' then raise exception 'request replay allowed'; end if;
 r:=gen_random_uuid(); d:=public.mcp_oauth_dispatch(r,'create_entity','{"kind":"object","type":"asset","title":"Via OAuth"}',w);
 e:=(d#>>'{result,entity,id}')::uuid;
 perform set_config('role','postgres',true);
 if e is null or (select count(*) from public.audit_log where request_id=r::text and source='mcp' and actor_id=current_setting('t.g')::uuid and action='entity.create' and metadata->>'oauthClientId'=c::text)<>1 then raise exception 'mutation not audited exactly once %',d; end if;
 perform set_config('role','authenticated',true);
 if public.mcp_oauth_dispatch(gen_random_uuid(),'archive_entity',jsonb_build_object('id',e,'expectedVersion',1))->>'code'<>'FORBIDDEN' then raise exception 'ungranted operation allowed'; end if;
 if public.mcp_oauth_dispatch(gen_random_uuid(),'create_template','{"kind":"person","type":"x","fields":[]}')->>'code'<>'FORBIDDEN' then raise exception 'manage via OAuth'; end if;
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',e),gen_random_uuid())->>'code'<>'FORBIDDEN' then raise exception 'foreign workspace allowed'; end if;
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity_history',jsonb_build_object('id',e))#>>'{result,items,0,action}'<>'entity.create' then raise exception 'history via grant failed'; end if;
 raise notice 'PASS: verified OAuth principal reads and writes only granted operations, audited to the grant';
end $$;
-- Direct sessions and forged/mismatched sessions cannot use the OAuth dispatcher.
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated"}';
do $$ begin
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'code'<>'UNAUTHENTICATED' then raise exception 'direct session used OAuth dispatcher'; end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated","client_id":"00000000-0000-0000-0000-000000000164","session_id":"00000000-0000-0000-0000-000000000167"}';
do $$ begin
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'code'<>'FORBIDDEN' then raise exception 'another user session accepted'; end if;
 raise notice 'PASS: direct sessions and mismatched native sessions rejected';
end $$;
reset role;

-- Live revocation and role changes apply to the next request.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated","client_id":"00000000-0000-0000-0000-000000000164","session_id":"00000000-0000-0000-0000-000000000166"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000162';
do $$ declare w uuid:=current_setting('t.w')::uuid; begin
 perform set_config('role','postgres',true);
 update public.workspace_member set role='viewer' where workspace_id=w and user_id='00000000-0000-0000-0000-000000000162';
 perform set_config('role','authenticated',true);
 if public.mcp_oauth_dispatch(gen_random_uuid(),'create_entity','{"kind":"object","type":"asset","title":"Downgraded"}')->>'code'<>'FORBIDDEN' then raise exception 'downgraded member wrote'; end if;
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'ok'<>'true' then raise exception 'downgraded member lost read'; end if;
 raise notice 'PASS: role downgrade removes delegated writes immediately';
end $$;
reset role;
update auth.oauth_consents set revoked_at=now() where user_id='00000000-0000-0000-0000-000000000162';
set local role authenticated;
do $$ begin
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'code'<>'FORBIDDEN' then raise exception 'revoked consent accepted'; end if;
 if public.mcp_oauth_session()->>'ok'<>'false' then raise exception 'revoked consent session listed'; end if;
end $$;
reset role;
update auth.oauth_consents set revoked_at=null where user_id='00000000-0000-0000-0000-000000000162';
-- Owner (admin) revokes the editor's grant.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000161","role":"authenticated"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000161';
do $$ begin
 if (select count(*) from public.oauth_grant_list(current_setting('t.w')::uuid))<>3 then raise exception 'admin cannot see workspace grants'; end if;
 perform public.oauth_grant_revoke(current_setting('t.w')::uuid,current_setting('t.g')::uuid);
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated","client_id":"00000000-0000-0000-0000-000000000164","session_id":"00000000-0000-0000-0000-000000000166"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000162';
do $$ begin
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'code'<>'FORBIDDEN' then raise exception 'revoked grant accepted'; end if;
 raise notice 'PASS: consent and grant revocation take effect on the next request';
end $$;
reset role;

-- Two workspaces for the same client require an explicit workspace.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated"}';
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000162';
do $$ declare w2 uuid; begin
 w2:=(public.workspace_create('OAuth second','oauth-second')).id;
 perform public.oauth_grant_issue(current_setting('t.w')::uuid,'00000000-0000-0000-0000-000000000164',array['get_entity'],now()+interval '1 day');
 perform public.oauth_grant_issue(w2,'00000000-0000-0000-0000-000000000164',array['get_entity'],now()+interval '1 day');
 perform set_config('t.w2',w2::text,true);
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000162","role":"authenticated","client_id":"00000000-0000-0000-0000-000000000164","session_id":"00000000-0000-0000-0000-000000000166"}';
do $$ begin
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')))->>'code'<>'WORKSPACE_REQUIRED' then raise exception 'ambiguous workspace resolved'; end if;
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')),current_setting('t.w2')::uuid)->>'code'<>'NOT_FOUND' then raise exception 'cross-workspace entity visible'; end if;
 if public.mcp_oauth_dispatch(gen_random_uuid(),'get_entity',jsonb_build_object('id',current_setting('t.e')),current_setting('t.w')::uuid)->>'ok'<>'true' then raise exception 'explicit workspace failed'; end if;
 raise notice 'PASS: explicit workspace selection with tenant isolation';
end $$;
reset role;
rollback;
