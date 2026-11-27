#!/usr/bin/env python3
"""Acceptance test only. All domain operations use the real custom MCP.
Native Auth and direct authenticated RPCs bootstrap a fresh test workspace and
issue scoped credentials, until browser OAuth/delegation is available. The
workspace, kinds, definitions, IDs and version values are discovered or generated;
no production seed, fake responses, or hardcoded credential is required.
"""
import argparse, uuid
from mcp_read_smoke import ReadAPI
from smoke import local_keys, check


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable',action='store_true',required=True)
    args=parser.parse_args()
    api=ReadAPI(*local_keys(),True)
    run=uuid.uuid4().hex
    owner_id,_,owner=api.user('golden-owner')
    viewer_id,viewer_email,viewer=api.user('golden-viewer')
    workspace=api.rpc('workspace_create',owner,{'p_name':'Golden path '+run,'p_slug':'golden-'+run})
    w=workspace['id']
    foreign=api.rpc('workspace_create',owner,{'p_name':'Isolation '+run,'p_slug':'isolation-'+run})['id']
    invite=api.rpc('member_invite',owner,{'p_workspace_id':w,'p_email':viewer_email,'p_role':'viewer'})
    api.rpc('member_accept_invitation',viewer,{'p_token':invite['token']})
    tokens=[]
    def issue(workspace_id,user,scopes):
        credential=api.rpc('token_issue',owner,{'p_workspace_id':workspace_id,'p_user_id':user,'p_label':'Golden acceptance '+run,'p_scopes':scopes})
        tokens.append((workspace_id,credential['summary']['id']))
        return credential['token']
    def call(token,name,arguments=None,code=None):
        result=api.mcp(token,'tools/call',{'name':name,'arguments':arguments or {}})
        envelope=result.get('result',{})
        if code:
            check(envelope.get('isError'),name+': expected denial')
            import json
            check(json.loads(envelope['content'][0]['text'])['code']==code,name+': unexpected denial code')
            return None
        check(not envelope.get('isError') and 'structuredContent' in envelope,name+': failed')
        return envelope['structuredContent']
    try:
        token=issue(w,owner_id,['read','write','manage'])
        ordinary=issue(w,owner_id,['read','write'])
        restricted=issue(w,viewer_id,['read','write'])
        foreign_token=issue(foreign,owner_id,['read','write'])
        check('result' in api.mcp(token,'server/discover'),'protocol discovery')
        catalog={t['name'] for t in api.mcp(token,'tools/list')['result']['tools']}
        context=call(token,'get_context')
        check(context['workspace']['id']==w and context['role']=='owner' and set(context['allowedTools'])==catalog,'owner capabilities mismatch')
        check(context['workspaceBound'] and len(context['kinds'])==5,'Registry contract kinds')
        check('create_template' not in call(ordinary,'get_context')['allowedTools'],'old scope widened')
        check('create_entity' not in call(restricted,'get_context')['allowedTools'],'viewer context')
        check(call(token,'list_templates')['items']==[] and call(token,'list_predicates')['items']==[],'workspace must start empty')
        print('PASS: real Auth, scope bootstrap, empty workspace and capability discovery')
        # Generate the acceptance ontology from the server's actual supported kind enum.
        kinds=context['kinds']; type_name='type_'+run; field_name='ref_'+run; tag='golden-'+run
        field={'name':field_name,'dataType':'text','required':True}
        definition={'kind':kinds[0],'type':type_name,'fields':[field]}
        call(ordinary,'create_template',definition,code='FORBIDDEN')
        call(restricted,'create_template',definition,code='FORBIDDEN')
        for kind in kinds:
            t=call(token,'create_template',{'kind':kind,'type':type_name,'fields':[field]})
            check(t['version']==1 and t['fields']==[field],'template creation')
        call(token,'create_template',definition,code='VERSION_CONFLICT')
        pred_name='rel_'+run
        pred=call(token,'create_predicate',{'name':pred_name,'description':'Acceptance relationship '+run,'fromKinds':[kinds[0]],'toKinds':kinds[1:],'directed':True})
        check(pred['name']==pred_name,'predicate creation')
        templates=call(token,'list_templates')['items']; predicates=call(token,'list_predicates')['items']
        check(len(templates)==len(kinds) and len(predicates)==1,'ontology discovery')
        check(call(token,'get_template',{'kind':kinds[0],'type':type_name})['fields']==[field],'field discovery')
        print('PASS: owner creates dynamic ontology via MCP; existing definition protected, old scopes denied')
        entities={}
        call(token,'create_entity',{'kind':kinds[0],'type':type_name,'title':'Invalid '+run},code='VALIDATION_ERROR')
        for t in templates:
            schema=call(token,'get_template',{'kind':t['kind'],'type':t['type']})
            values={f['name']:run for f in schema['fields'] if f.get('required')}
            e=call(token,'create_entity',{'kind':t['kind'],'type':t['type'],'title':t['kind']+' '+run,'attributes':values,'tags':[tag]})['entity']
            check(e['kind']==t['kind'] and e['attributes']==values,'entity create')
            entities[t['kind']]=e
        check(len(set(e['id'] for e in entities.values()))==len(kinds),'generated IDs')
        first=entities[kinds[0]]
        for k in predicates[0]['toKinds']:
            rel=call(token,'create_relation',{'fromId':first['id'],'toId':entities[k]['id'],'predicate':predicates[0]['name']})['relation']
            check(rel['fromId']==first['id'] and rel['toId']==entities[k]['id'],'relation created')
        print('PASS: required fields enforced; all five kinds and four ontology-valid relations created via MCP')
        found=call(token,'search_entities',{'tagsAny':[tag],'limit':100})
        check({e['id'] for e in found['items']}=={e['id'] for e in entities.values()},'search mismatch')
        detail=call(token,'get_entity',{'id':first['id']})
        check(len(detail['relations']['outgoing'])==len(kinds)-1,'detail relation count')
        traversal=call(token,'traverse',{'startId':first['id'],'depth':1,'predicates':[pred_name]})
        check({n['entity']['id'] for n in traversal['nodes']} >= {entities[k]['id'] for k in kinds[1:]},'traversal')
        check(len(call(token,'run_path_report',{'startId':first['id'],'steps':[{'predicate':pred_name,'direction':'outgoing'}]})['paths'])==len(kinds)-1,'path report')
        print('PASS: search, detail, traversal and path reports return the actual connected data')
        updated=call(token,'update_entity',{'id':first['id'],'expectedVersion':detail['entity']['version'],'title':'Updated '+run})['entity']
        check(updated['version']==detail['entity']['version']+1,'version increment')
        call(token,'update_entity',{'id':first['id'],'expectedVersion':detail['entity']['version'],'title':'Stale '+run},code='VERSION_CONFLICT')
        call(restricted,'update_entity',{'id':first['id'],'expectedVersion':updated['version'],'title':'Denied '+run},code='FORBIDDEN')
        check(call(token,'get_entity',{'id':first['id']})['entity']['title']==updated['title'],'failed mutation changed state')
        print('PASS: safe update, stale version conflict, viewer denial, committed state verified')
        history=call(token,'get_entity_history',{'id':first['id'],'limit':1})
        check(history['items'][0]['action']=='entity.update' and history['items'][0]['afterVersion']==updated['version'] and history['nextCursor'],'audit update')
        previous=call(token,'get_entity_history',{'id':first['id'],'limit':1,'cursor':history['nextCursor']})
        check(previous['items'][0]['action']=='entity.create' and previous['items'][0]['afterVersion']==first['version'],'audit create')
        call(foreign_token,'get_entity_history',{'id':first['id']},code='NOT_FOUND')
        check(call(restricted,'get_entity_history',{'id':first['id']})['items'][0]['id']==history['items'][0]['id'],'viewer audit access')
        print('PASS: real audited history and signed cursor, cross-workspace denial, authorized viewer read')
        # Independent persisted-state check through PostgREST under the actual user's JWT.
        # Do not trust the MCP response alone; no admin key is used for these reads.
        _, rows=api.request('/rest/v1/entity?workspace_id=eq.'+w+'&select=id,kind,type,title,version,attributes',token=owner)
        expected={e['id']:dict(e) for e in entities.values()}
        expected[first['id']]=updated
        check({r['id'] for r in rows}==set(expected),'persisted entity set mismatch')
        for row in rows:
            check(all(row[k]==expected[row['id']][k] for k in ('kind','type','title','version','attributes')),'persisted entity value mismatch')
        _, edges=api.request('/rest/v1/relation?workspace_id=eq.'+w+'&select=from_id,to_id,predicate',token=owner)
        check({(r['from_id'],r['to_id'],r['predicate']) for r in edges}=={(first['id'],entities[k]['id'],pred_name) for k in kinds[1:]},'persisted relationship mismatch')
        _, audit=api.request('/rest/v1/audit_log?workspace_id=eq.'+w+'&target_type=eq.entity&target_id=eq.'+first['id']+'&source=eq.mcp&outcome=eq.success&select=id,action,after',token=owner)
        check(len(audit)==2 and {r['id'] for r in audit}=={history['items'][0]['id'],previous['items'][0]['id']},'persisted audit missing or duplicated')
        check({r['action']:r['after']['version'] for r in audit}=={'entity.create':first['version'],'entity.update':updated['version']},'persisted audit versions mismatch')
        print('PASS: independent Data API confirms exact persisted entities, relations and audit; denied writes made no changes')
        api.rpc('token_revoke',owner,{'p_workspace_id':w,'p_token_id':tokens[0][1]})
        api.mcp(token,'tools/list',expected=(401,))
        print('PASS: immediate credential revocation')
    finally:
        for workspace_id,token_id in tokens:
            api.rpc('token_revoke',owner,{'p_workspace_id':workspace_id,'p_token_id':token_id})
    print('Golden Path local acceptance complete; synthetic fixtures retained in disposable stack.')

if __name__=='__main__':
    main()
