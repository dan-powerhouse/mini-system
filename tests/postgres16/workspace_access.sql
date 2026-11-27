\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values ('00000000-0000-0000-0000-000000000041','owner@example.invalid',now()),('00000000-0000-0000-0000-000000000042','editor@example.invalid',now()),('00000000-0000-0000-0000-000000000043','other@example.invalid',now());
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000041';
select (public.workspace_create('Access tests','access-tests')).id as w \gset
select public.member_invite(:'w','EDITOR@example.invalid','editor')->>'token' as invite \gset
select set_config('test.invite',:'invite',true) as _invite, set_config('test.w',:'w',true) as _w \gset
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000043';
do $$ begin
 begin perform public.member_accept_invitation(current_setting('test.invite')); raise exception 'foreign email accepted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 raise notice 'PASS: invitation bound to confirmed email';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000042';
select (public.member_accept_invitation(:'invite')).role;
do $$ begin
 begin perform public.member_accept_invitation(current_setting('test.invite')); raise exception 'replay accepted'; exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin perform public.token_issue(current_setting('test.w')::uuid,auth.uid(),'self',array['read']); raise exception 'editor issued token'; exception when insufficient_privilege then null; end;
 raise notice 'PASS: invitation single use and editor cannot issue credentials';
end $$;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000041';
select public.token_issue(:'w','00000000-0000-0000-0000-000000000042','edge token',array['read','write']) as issued \gset
select set_config('test.token',:'issued',true) as _token \gset
do $$ declare w uuid:=current_setting('test.w')::uuid; issued jsonb:=current_setting('test.token')::jsonb; item jsonb; begin
 select x into item from public.token_list(w) x;
 if item?'token_hash' or item?'token' or length(issued->>'token')<>68 then raise exception 'credential leak or invalid token'; end if;
 begin perform 1 from private.api_token; raise exception 'private tokens exposed'; exception when insufficient_privilege then null; end;
 perform public.member_update_role(w,'00000000-0000-0000-0000-000000000042','viewer');
 perform public.member_remove(w,'00000000-0000-0000-0000-000000000042');
 select x into item from public.token_list(w) x;
 if item->>'revoked_at' is null then raise exception 'removal failed to revoke token'; end if;
 raise notice 'PASS: token secret only returned once, member removal revokes credentials';
end $$;
reset role;
rollback;
