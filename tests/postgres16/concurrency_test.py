#!/usr/bin/env python3
"""Deterministic real-session races. Only against a disposable PostgreSQL regression DB.
Uses psql (already required by the test harness); no external Python dependency.
Fixture setup/cleanup is privileged; all raced operations use application RPCs.
"""
import os
import subprocess
import time
import uuid


def sql(statement, app='entitygraph-test-control'):
    env = dict(os.environ, PGAPPNAME=app)
    p = subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',statement],
                       env=env, capture_output=True, text=True, timeout=20)
    if p.returncode:
        raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()


def session(actor, app):
    p = subprocess.Popen(['psql','-X','-qAt','-v','ON_ERROR_STOP=1'],
                         env=dict(os.environ, PGAPPNAME=app), stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                         bufsize=1)
    p.stdin.write(f"begin; set local statement_timeout='15s'; set local role authenticated; set local request.jwt.claim.sub='{actor}';\n")
    p.stdin.flush()
    return p


def send(p, statement):
    p.stdin.write(statement+'\n'); p.stdin.flush()


def wait_for(app, predicate):
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{app}' and {predicate})")=='t': return
        time.sleep(.025)
    raise RuntimeError(f'Expected database session state not reached: {app}')


def finish(p):
    p.stdin.close(); p.stdin=None
    return p.communicate(timeout=20)


def race(owner, other, first, second, expected, suffix):
    a='eg-race-a-'+suffix; b='eg-race-b-'+suffix
    p=q=None
    try:
        p=session(owner,a); send(p,first+';')
        # Lock-holding transaction has completed its first statement, not merely started.
        wait_for(a,"state='idle in transaction' and query like 'select %'")
        q=session(other,b); send(q,second+'; commit;')
        wait_for(b,"wait_event_type='Lock'")
        send(p,'commit;'); _,err=finish(p)
        if p.returncode: raise RuntimeError('first writer failed: '+err)
        _,err=finish(q)
        if q.returncode==0 or expected not in err: raise RuntimeError('race did not reject second writer: '+err)
    finally:
        for proc in (p,q):
            if proc and proc.poll() is None:
                proc.kill(); proc.wait(timeout=5)


def main():
    # Strict guard: test harness database, no hosted/real Auth schema.
    if os.environ.get('PGDATABASE')!='entitygraph_test': raise RuntimeError('Use only entitygraph_test')
    if sql("select current_database()='entitygraph_test' and to_regclass('auth.users') is not null and to_regclass('auth.sessions') is null and (select count(*) from public.workspace)=0")!='t':
        raise RuntimeError('Expected empty disposable regression database with Auth shim')
    owner,editor,w,e,b=[str(uuid.uuid4()) for _ in range(5)]
    try:
        sql(f"""begin;
          insert into auth.users(id) values('{owner}'),('{editor}');
          insert into public.workspace(id,name,slug) values('{w}','Race fixture','race-fixture');
          insert into public.workspace_member(workspace_id,user_id,role) values('{w}','{owner}','owner'),('{w}','{editor}','editor');
          insert into public.type_templates(workspace_id,kind,type,fields,updated_by) values('{w}','object','asset','[{{"name":"obsolete","dataType":"number"}}]','{owner}'),('{w}','person','human','[]','{owner}');
          insert into public.entity(id,workspace_id,kind,type,title,created_by,updated_by) values('{e}','{w}','object','asset','Initial','{owner}','{owner}'),('{b}','{w}','person','human','Owner','{owner}','{owner}');
          insert into public.predicate_registry(workspace_id,name,from_kinds,to_kinds,directed,description,created_by,updated_by) values('{w}','owns',array['person']::public.entity_kind[],array['object']::public.entity_kind[],true,'Owns','{owner}','{owner}'); commit;""")
        race(owner,editor,f"select (public.entity_update('{w}','{e}',1,'{{\"title\":\"First writer\"}}')).version",f"select (public.entity_update('{w}','{e}',1,'{{\"title\":\"Stale writer\"}}')).version",'VERSION_CONFLICT','version')
        assert sql(f"select title||':'||version from public.entity where id='{e}'")=='First writer:2'
        print('PASS: simultaneous stale writer rejected after lock release')
        race(owner,editor,f"select (public.template_upsert('{w}','object','asset','[{{\"name\":\"new_field\",\"dataType\":\"text\"}}]',1)).version",f"select (public.entity_create('{w}','{{\"kind\":\"object\",\"type\":\"asset\",\"title\":\"Invalid\",\"attributes\":{{\"obsolete\":1}}}}')).id",'VALIDATION_ERROR','template')
        print('PASS: entity write revalidates after concurrent template change')
        race(owner,editor,f"select (public.predicate_upsert('{w}','owns',array['object']::public.entity_kind[],array['object']::public.entity_kind[],true,'Changed',null,1)).version",f"select (public.relation_create('{w}','{b}','{e}','owns')).id",'RELATION_KIND_MISMATCH','predicate')
        print('PASS: relation creation revalidates after concurrent predicate change')
        race(owner,editor,f"select (public.member_update_role('{w}','{editor}','viewer')).role",f"select (public.entity_update('{w}','{e}',2,'{{\"title\":\"Revoked\"}}')).version",'FORBIDDEN','membership')
        assert sql(f"select title||':'||version from public.entity where id='{e}'")=='First writer:2'
        print('PASS: blocked writer rechecks membership after role downgrade')
        assert sql(f"select count(*) from public.audit_log where workspace_id='{w}' and action='entity.update'")=='1'
        print('PASS: only committed concurrent mutation is audited')
    finally:
        # Delete only the random test workspace/actors from this verified disposable DB.
        sql(f"begin; delete from public.audit_log where workspace_id='{w}'; delete from public.relation where workspace_id='{w}'; delete from public.entity where workspace_id='{w}'; delete from public.predicate_registry where workspace_id='{w}'; delete from public.type_templates where workspace_id='{w}'; delete from public.workspace_member where workspace_id='{w}'; delete from public.workspace where id='{w}'; delete from auth.users where id in ('{owner}','{editor}'); commit;")
    assert sql('select count(*) from public.workspace')=='0'

if __name__=='__main__': main()
