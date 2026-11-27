#!/usr/bin/env python3
"""Exercise the nineteen-tool adapter against a disposable local Supabase stack.
No hosted credentials, no secrets printed. Run Deno adapter on loopback port 8000
with SUPABASE_URL pointing to local port 54321, or use the local Edge gateway.
"""
import argparse,json,uuid,urllib.request,urllib.error
from smoke import LocalAPI,local_keys,check

class ReadAPI(LocalAPI):
    def __init__(self, public, service, direct):
        super().__init__(public,service)
        self.direct=direct
    def mcp(self, token, method, params=None, expected=(200,)):
        if not self.direct:
            return super().mcp(token,method,params,expected)
        params=dict(params or {})
        params['_meta']={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{'name':'entitygraph-read-smoke','version':'1'},'io.modelcontextprotocol/clientCapabilities':{}}
        headers={'Host':'127.0.0.1:54321','Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,'Authorization':'Bearer '+token}
        if method=='tools/call': headers['Mcp-Name']=params['name']
        elif method=='resources/read': headers['Mcp-Name']=params['uri']
        req=urllib.request.Request('http://127.0.0.1:8000/',method='POST',headers=headers,data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode())
        try:
            with urllib.request.urlopen(req,timeout=20) as res:
                status,body=res.status,res.read()
        except urllib.error.HTTPError as exc:
            status,body=exc.code,exc.read()
        if status not in expected:
            try:
                error=json.loads(body).get('error',{})
                print('Protocol error:',error.get('code'),error.get('message')) if isinstance(error,dict) else print('Protocol error status:',status)
            except ValueError: pass
        check(status in expected,f'{method}: unexpected HTTP {status}')
        return json.loads(body) if body else None

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--confirm-disposable',action='store_true',required=True)
    p.add_argument('--direct-deno',action='store_true')
    args=p.parse_args()
    api=ReadAPI(*local_keys(),args.direct_deno)
    owner_id,_,owner=api.user('mcp-read-owner')
    viewer_id,viewer_email,viewer=api.user('mcp-read-viewer')
    w=api.rpc('workspace_create',owner,{'p_name':'MCP integration','p_slug':'mcp-'+uuid.uuid4().hex})['id']
    foreign=api.rpc('workspace_create',owner,{'p_name':'Foreign integration','p_slug':'mcp-'+uuid.uuid4().hex})['id']
    def template(workspace,k,t):
        api.rpc('template_upsert',owner,{'p_workspace_id':workspace,'p_kind':k,'p_type':t,'p_fields':[]})
    def entity(workspace,k,t,title):
        return api.rpc('entity_create',owner,{'p_workspace_id':workspace,'p_input':{'kind':k,'type':t,'title':title}})
    template(w,'person','employee'); template(w,'app','service'); template(foreign,'object','foreign_only')
    a=entity(w,'person','employee','Local Employee')
    b=entity(w,'app','service','Local App')
    other=entity(foreign,'object','foreign_only','Foreign Object')
    api.rpc('predicate_upsert',owner,{'p_workspace_id':w,'p_name':'uses','p_from_kinds':['person'],'p_to_kinds':['app'],'p_directed':True,'p_description':'Uses an app'})
    api.rpc('relation_create',owner,{'p_workspace_id':w,'p_from_id':a['id'],'p_to_id':b['id'],'p_predicate':'uses'})
    for name,visibility in [('Owner private','personal'),('Shared','workspace')]:
        api.rpc('saved_view_create',owner,{'p_workspace_id':w,'p_name':name,'p_visibility':visibility,'p_kind':'person','p_query':{}})
    invite=api.rpc('member_invite',owner,{'p_workspace_id':w,'p_email':viewer_email,'p_role':'viewer'})
    api.rpc('member_accept_invitation',viewer,{'p_token':invite['token']})
    issued=api.rpc('token_issue',owner,{'p_workspace_id':w,'p_user_id':viewer_id,'p_label':'MCP read integration','p_scopes':['read','write']})
    token=issued['token']
    def tool(name,arguments=None,denied=False):
        result=api.mcp(token,'tools/call',{'name':name,'arguments':arguments or {}})
        if denied:
            check(result.get('error') or result.get('result',{}).get('isError'),f'{name}: denial missing')
            return None
        r=result.get('result',{})
        check(not r.get('isError') and 'structuredContent' in r,f'{name}: structured success missing')
        check(json.loads(r['content'][0]['text'])==r['structuredContent'],f'{name}: inconsistent text')
        return r['structuredContent']
    try:
        check('result' in api.mcp(token,'server/discover'),'discovery failed')
        listed=api.mcp(token,'tools/list')['result']['tools']
        new={'get_context','list_templates','get_template','list_predicates','get_dashboard','run_path_report','list_saved_views'}
        old={'search_entities','get_entity','create_entity','update_entity','archive_entity','create_relation','update_relation','delete_relation','traverse'}
        check({t['name'] for t in listed}==new|old|{'create_template','create_predicate','get_entity_history'},'catalog mismatch')
        check(all(t.get('outputSchema') and t.get('annotations',{}).get('readOnlyHint') for t in listed if t['name'] in new),'read output schemas/hints missing')
        print('PASS: discovery and nineteen-tool catalog with seven strict output schemas')
        c=tool('get_context')
        check(c['workspace']['id']==w and c['role']=='viewer' and 'create_entity' not in c['allowedTools'],'incorrect role/context')
        first=tool('list_templates',{'limit':1}); second=tool('list_templates',{'limit':1,'after':first['nextAfter']})
        check(first['items'][0]['type']=='service' and second['items'][0]['type']=='employee' and second['nextAfter'] is None,'pagination')
        check(tool('get_template',{'kind':'person','type':'employee'})['fields']==[],'template')
        check(tool('list_predicates')['items'][0]['name']=='uses','predicates')
        check(tool('get_dashboard')['countsByKind']['person']==1,'dashboard')
        report=tool('run_path_report',{'startId':a['id'],'steps':[{'predicate':'uses','direction':'outgoing'}]})
        check(report['paths'][0]['entities'][1]['id']==b['id'],'path')
        check([s['name'] for s in tool('list_saved_views')['items']]==['Shared'],'saved view privacy')
        print('PASS: all seven added tools, bounded pagination, path, private-view filtering')
        check(tool('get_entity',{'id':a['id']})['entity']['id']==a['id'],'compatibility read')
        tool('get_entity',{'id':other['id']},denied=True)
        tool('get_context',{'workspaceId':foreign},denied=True)
        tool('create_entity',{'kind':'person','type':'employee','title':'Denied'},denied=True)
        resource=api.mcp(token,'resources/read',{'uri':'entitygraph://predicates'})
        check('contents' in resource.get('result',{}),'resource compatibility')
        print('PASS: existing entity/resource calls and foreign workspace, forged context, viewer mutation denials')
    finally:
        api.rpc('token_revoke',owner,{'p_workspace_id':w,'p_token_id':issued['summary']['id']})
    api.mcp(token,'tools/list',expected=(401,))
    print('PASS: revoked credential immediately denied')
    print('Synthetic test data retained only in disposable local Supabase.')

if __name__=='__main__':
    main()
