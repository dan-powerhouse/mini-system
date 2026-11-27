\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select (public.workspace_create('A','a')).id;
select (public.workspace_create('B','b')).id;
reset role;
do $$
declare w uuid; b uuid; u uuid:='00000000-0000-0000-0000-000000000001'; k uuid; p uuid; ag uuid; pr uuid;
begin
 select id into w from public.workspace where slug='a'; select id into b from public.workspace where slug='b';
 insert into public.type_templates(workspace_id,kind,type,updated_by) values(w,'process_kind','review',u),(w,'person','employee',u),(w,'agent','assistant',u),(b,'person','employee',u);
 insert into public.entity(workspace_id,kind,type,title,created_by,updated_by) values(w,'process_kind','review','Review',u,u) returning id into k;
 insert into public.entity(workspace_id,kind,type,title,created_by,updated_by) values(w,'person','employee','Requester',u,u) returning id into p;
 insert into public.entity(workspace_id,kind,type,title,created_by,updated_by) values(w,'agent','assistant','Worker',u,u) returning id into ag;
 if 'process' = any(enum_range(null::public.entity_kind)::text[]) or not ('process_kind'=any(enum_range(null::public.entity_kind)::text[])) then raise exception 'bad registry enum'; end if; raise notice 'PASS: registry vocabulary';
 insert into public.process_kind_version(workspace_id,process_kind_id,version,package_path,package_sha256,specification,published_by) values(w,k,1,'review/1.zip',repeat('a',64),'{}',u);
 insert into public.process_kind_version(workspace_id,process_kind_id,version,package_path,package_sha256,specification,published_by) values(w,k,2,'review/2.zip',repeat('b',64),'{}',u);
 insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,assigned_agent_id,idempotency_key) values(w,k,1,p,'person',ag,'one') returning id into pr;
 insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,idempotency_key) values(w,k,1,p,'person','two');
 if (select count(*) from public.process where process_kind_id=k and process_kind_version=1)<>2 or (select count(*) from public.entity where workspace_id=w)<>3 then raise exception 'execution polluted registry'; end if; raise notice 'PASS: many instances, pinned version, registry separation';
 begin insert into public.process_kind_version(workspace_id,process_kind_id,version,package_path,package_sha256,specification,published_by) values(w,p,1,'bad',repeat('a',64),'{}',u); raise exception 'nonkind accepted'; exception when foreign_key_violation then raise notice 'PASS: only Process Kind can publish'; end;
 begin insert into public.process_kind_version(workspace_id,process_kind_id,version,package_path,package_sha256,specification,published_by) values(b,k,1,'bad',repeat('a',64),'{}',u); raise exception 'cross workspace accepted'; exception when foreign_key_violation then raise notice 'PASS: publication workspace isolation'; end;
 begin insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,idempotency_key) values(w,k,99,p,'person','bad'); raise exception 'unknown version accepted'; exception when foreign_key_violation then raise notice 'PASS: nonexistent version denied'; end;
 begin insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,idempotency_key) values(b,k,1,p,'person','bad'); raise exception 'cross workspace accepted'; exception when foreign_key_violation then raise notice 'PASS: execution workspace isolation'; end;
 begin update public.process_kind_version set package_path='changed' where process_kind_id=k; raise exception 'mutable published version'; exception when raise_exception then if sqlerrm<>'PUBLISHED_STANDARD_IMMUTABLE' then raise; end if; raise notice 'PASS: published version immutable'; end;
 begin delete from public.process_kind_version where process_kind_id=k; raise exception 'deleted published version'; exception when raise_exception then if sqlerrm<>'PUBLISHED_STANDARD_IMMUTABLE' then raise; end if; raise notice 'PASS: published version deletion denied'; end;
 begin update public.process set process_kind_version=2,version=version+1 where id=pr; raise exception 'repinned execution'; exception when raise_exception then if sqlerrm<>'PROCESS_IDENTITY_IMMUTABLE' then raise; end if; raise notice 'PASS: execution version pinned'; end;
 begin update public.process set status='succeeded',version=version+1 where id=pr; raise exception 'invalid state accepted'; exception when check_violation then raise notice 'PASS: incomplete terminal state denied'; end;
 begin update public.process set progress=101,version=version+1 where id=pr; raise exception 'invalid progress'; exception when check_violation then raise notice 'PASS: progress bounds'; end;
 begin update public.process set attempt_count=2,version=version+1 where id=pr; raise exception 'invalid attempt count'; exception when check_violation then raise notice 'PASS: attempt bounds'; end;
 begin update public.process set assigned_agent_id=p,version=version+1 where id=pr; raise exception 'invalid agent'; exception when foreign_key_violation then raise notice 'PASS: assigned agent kind enforced'; end;
 begin insert into public.process(workspace_id,process_kind_id,process_kind_version,requested_by,requested_by_kind,idempotency_key) values(w,k,1,p,'person','one'); raise exception 'duplicate idempotency key'; exception when unique_violation then raise notice 'PASS: duplicate request key denied'; end;
end $$;
set local role authenticated;
do $$ begin
 if (select count(*) from public.process_kinds)<>1 then raise exception 'registry process kind view wrong'; end if; raise notice 'PASS: Registry Process Kind view';
 begin perform count(*) from public.process; raise exception 'execution read exposed'; exception when insufficient_privilege then raise notice 'PASS: execution read denied'; end;
 begin update public.process set status='running'; raise exception 'execution write exposed'; exception when insufficient_privilege then raise notice 'PASS: execution write denied'; end;
 begin update public.process_kind_version set package_path='bad'; raise exception 'publication write exposed'; exception when insufficient_privilege then raise notice 'PASS: publication write denied'; end;
end $$;
reset role;
rollback;
