#!/usr/bin/env python3
"""Native PGMQ, independent real sessions; deliberately leaves fixtures in the
dedicated empty disposable database. Discard that DB after testing."""
import json
import os
import subprocess
import time
import uuid


def sql(statement, app='eg-native-control'):
    r = subprocess.run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-c',statement],
                       env=dict(os.environ, PGAPPNAME=app), capture_output=True,
                       text=True, timeout=20)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def wait_for(app, predicate):
    end = time.monotonic() + 8
    while time.monotonic() < end:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{app}' and {predicate})") == 't':
            return
        time.sleep(.025)
    raise RuntimeError('Expected session state not reached: '+app)


def session(app):
    p = subprocess.Popen(['psql','-X','-qAt','-v','ON_ERROR_STOP=1'],
                         env=dict(os.environ, PGAPPNAME=app), stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    send(p, "begin; set local statement_timeout='15s';")
    return p


def send(p, s):
    p.stdin.write(s+'\n')
    p.stdin.flush()


def finish(p):
    p.stdin.close()
    p.stdin = None
    out, err = p.communicate(timeout=20)
    if p.returncode:
        raise RuntimeError(err)
    return out.strip()


def race(first, second, suffix):
    app_a='eg-native-a-'+suffix
    app_b='eg-native-b-'+suffix
    p=q=None
    try:
        p=session(app_a)
        send(p, first+';')
        wait_for(app_a, "state='idle in transaction' and query like 'select %'")
        q=session(app_b)
        send(q, second+'; commit;')
        wait_for(app_b, "wait_event_type='Lock'")
        send(p, 'commit;')
        return finish(p), finish(q)
    finally:
        for proc in (p,q):
            if proc and proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)


def main():
    if os.environ.get('PGDATABASE') != 'entitygraph_execution_check':
        raise RuntimeError('Use only a disposable entitygraph_execution_check DB')
    if sql("select current_database()='entitygraph_execution_check' and to_regclass('auth.users') is not null and to_regclass('auth.sessions') is null and to_regclass('private.process_attempt') is not null and (select count(*) from public.workspace)=0 and (select count(*) from pgmq.q_entitygraph_process)=0") != 't':
        raise RuntimeError('Expected empty, provisioned native test database with Auth shim')
    owner,w,k,r = [str(uuid.uuid4()) for _ in range(4)]
    sql(f"""begin;
        insert into auth.users(id) values('{owner}');
        insert into public.workspace(id,name,slug) values('{w}','Native race','native-race');
        insert into public.workspace_member(workspace_id,user_id,role) values('{w}','{owner}','owner');
        insert into public.type_templates(workspace_id,kind,type,fields,updated_by) values('{w}','process_kind','review','[]','{owner}'),('{w}','person','human','[]','{owner}');
        insert into public.entity(id,workspace_id,kind,type,title,created_by,updated_by) values('{k}','{w}','process_kind','review','Review','{owner}','{owner}'),('{r}','{w}','person','human','Requester','{owner}','{owner}');
        set local request.jwt.claim.sub='{owner}';
        do $$ declare p public.process; begin
          perform public.process_kind_publish('{w}','{owner}','{k}',1,0,gen_random_uuid(),repeat('a',64),'{{}}');
          p:=private.process_create('{w}','{k}',1,'{r}','person','native-race','{{}}');
          perform private.process_dispatch('{w}',p.id,p.version);
        end $$; commit;""")
    pid=sql(f"select id from public.process where workspace_id='{w}'")
    claim=f"select private.process_claim('{w}','{pid}','edge-race',60)"
    a,b=race(claim,claim,'claim')
    assert not b, 'competing claim returned a lease'
    first=json.loads(a)
    fence=first['fence']
    assert first['process']['status']=='running'
    assert sql(f"select count(*) from private.process_attempt where process_id='{pid}'")=='1'
    assert sql('select count(*) from pgmq.q_entitygraph_process')=='0'
    print('PASS: two real sessions race for one native message; exactly one lease and attempt')
    cid=str(uuid.uuid4())
    complete=f"select private.process_finish('{w}','{pid}','{fence}','{cid}',true,'{{\"result\":\"ok\"}}')"
    a,b=race(complete,complete,'completion')
    assert json.loads(a)==json.loads(b)
    assert sql(f"select count(*) from private.process_event where process_id='{pid}' and action='process.finish'")=='1'
    assert sql(f"select status from public.process where id='{pid}'")=='succeeded'
    print('PASS: concurrent identical completion replays one result and one atomic audit')
    # Never delete protected publication records to clean up. This DB is disposable.


if __name__=='__main__':
    main()
