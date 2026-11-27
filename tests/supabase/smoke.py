#!/usr/bin/env python3
"""Real local Supabase Auth / Data API smoke test. No hosted access or secrets in logs.
Run only on a disposable local stack. Creates isolated fixtures; reset the test stack
explicitly after use. Optional MCP smoke requires the local Edge endpoint enabled.
"""
import argparse
import json
import secrets
import shlex
import subprocess
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:54321'


def check(condition, label):
    if not condition:
        raise AssertionError(label)


def local_keys():
    result = subprocess.run(['supabase', 'status', '-o', 'env'], capture_output=True, text=True, check=True)
    env = {}
    for line in result.stdout.splitlines():
        key, sep, value = line.partition('=')
        if sep and key in {'ANON_KEY', 'PUBLISHABLE_KEY', 'SERVICE_ROLE_KEY', 'API_URL'}:
            parts = shlex.split(value)
            if len(parts) == 1:
                env[key] = parts[0]
    check(env.get('API_URL') in (BASE, 'http://localhost:54321'), 'Only the fixed local Supabase API is permitted')
    public = env.get('ANON_KEY') or env.get('PUBLISHABLE_KEY')
    service = env.get('SERVICE_ROLE_KEY')
    check(public and service, 'Local API keys unavailable')
    return public, service


class LocalAPI:
    def __init__(self, public, service):
        self.public, self.service = public, service

    def request(self, path, *, token=None, admin=False, method='GET', data=None, allowed=(200,), extra=None):
        check(path.startswith('/') and not path.startswith('//'), 'Invalid local path')
        key = self.service if admin else self.public
        headers = {'apikey': key, 'Accept': 'application/json', 'Content-Type': 'application/json'}
        if token or admin:
            headers['Authorization'] = 'Bearer ' + (self.service if admin else token)
        headers.update(extra or {})
        req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                     data=json.dumps(data).encode() if data is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                status, body = response.status, response.read()
        except urllib.error.HTTPError as exc:
            status, body = exc.code, exc.read()
        # Never print request/response bodies or headers; they may contain credentials.
        check(status in allowed, f'{method} {path.split("?")[0]}: unexpected HTTP status {status}')
        try:
            return status, json.loads(body) if body else None
        except ValueError:
            return status, None

    def user(self, label):
        email = f'{label}-{uuid.uuid4().hex}@example.invalid'
        password = secrets.token_urlsafe(24)
        _, user = self.request('/auth/v1/admin/users', admin=True, method='POST',
                               data={'email': email, 'password': password, 'email_confirm': True}, allowed=(200, 201))
        _, session = self.request('/auth/v1/token?grant_type=password', method='POST',
                                  data={'email': email, 'password': password})
        check(session.get('access_token'), 'Auth session not issued')
        return user['id'], email, session['access_token']

    def rpc(self, name, token, args, allowed=(200, 204)):
        value = self.request('/rest/v1/rpc/' + name, token=token, method='POST', data=args, allowed=allowed)[1]
        # PostgREST versions may represent a single composite result as a one-row array.
        if name in {'workspace_create', 'template_upsert', 'entity_create', 'entity_update', 'member_accept_invitation', 'member_update_role'} and isinstance(value, list) and len(value) == 1:
            return value[0]
        return value

    def mcp(self, token, method, params=None, expected=(200,)):
        params = dict(params or {})
        params['_meta'] = {'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                           'io.modelcontextprotocol/clientInfo': {'name': 'entitygraph-smoke', 'version': '1'},
                           'io.modelcontextprotocol/clientCapabilities': {}}
        headers = {'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method,
                   'Accept': 'application/json, text/event-stream'}
        if method == 'tools/call':
            headers['Mcp-Name'] = params['name']
        elif method == 'resources/read':
            headers['Mcp-Name'] = params['uri']
        return self.request('/functions/v1/mcp', method='POST', token=token, extra=headers,
                            data={'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}, allowed=expected)[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable', action='store_true', required=True)
    parser.add_argument('--mcp', action='store_true', help='Requires locally enabled and served MCP function')
    args = parser.parse_args()
    api = LocalAPI(*local_keys())
    owner_id, _, owner = api.user('owner')
    editor_id, editor_email, editor = api.user('editor')
    _, _, other = api.user('other')
    w = api.rpc('workspace_create', owner, {'p_name': 'Smoke workspace', 'p_slug': 'smoke-' + uuid.uuid4().hex})['id']
    other_w = api.rpc('workspace_create', other, {'p_name': 'Other workspace', 'p_slug': 'smoke-' + uuid.uuid4().hex})['id']
    api.rpc('template_upsert', owner, {'p_workspace_id': w, 'p_kind': 'agent', 'p_type': 'assistant', 'p_fields': []})
    e = api.rpc('entity_create', owner, {'p_workspace_id': w, 'p_input': {'kind': 'agent', 'type': 'assistant', 'title': 'Smoke agent'}})
    check(e['kind'] == 'agent', 'Registry create failed')
    _, own = api.request('/rest/v1/entity?workspace_id=eq.' + w, token=owner)
    _, denied = api.request('/rest/v1/entity?workspace_id=eq.' + w, token=other)
    check(len(own) == 1 and denied == [] and other_w != w, 'RLS workspace isolation failed')
    api.request('/rest/v1/entity', allowed=(401, 403))
    api.request('/rest/v1/entity?id=eq.' + e['id'], method='PATCH', token=owner, data={'title': 'Bypass'}, allowed=(401, 403))
    print('PASS: real Auth, Registry RPC, RLS and direct-write denial')
    invite = api.rpc('member_invite', owner, {'p_workspace_id': w, 'p_email': editor_email, 'p_role': 'editor'})
    api.rpc('member_accept_invitation', editor, {'p_token': invite['token']})
    e2 = api.rpc('entity_update', editor, {'p_workspace_id': w, 'p_id': e['id'], 'p_expected_version': e['version'], 'p_patch': {'title': 'Editor update'}})
    check(e2['version'] == e['version'] + 1, 'Editor version did not increment')
    api.rpc('member_update_role', owner, {'p_workspace_id': w, 'p_user_id': editor_id, 'p_role': 'viewer'})
    api.rpc('entity_update', editor, {'p_workspace_id': w, 'p_id': e['id'], 'p_expected_version': e2['version'], 'p_patch': {'title': 'Denied'}}, allowed=(401, 403))
    print('PASS: invitation and live role change without JWT refresh')
    if args.mcp:
        issued = api.rpc('token_issue', owner, {'p_workspace_id': w, 'p_user_id': owner_id, 'p_label': 'Local smoke', 'p_scopes': ['read']})
        token = issued['token']
        try:
            discovery = api.mcp(token, 'server/discover')
            check(discovery and 'result' in discovery, 'MCP discovery failed')
            result = api.mcp(token, 'tools/list')
            expected = {'search_entities', 'get_entity', 'create_entity', 'update_entity', 'archive_entity', 'create_relation', 'update_relation', 'delete_relation', 'traverse', 'get_context', 'list_templates', 'get_template', 'list_predicates', 'get_dashboard', 'run_path_report', 'list_saved_views','create_template','create_predicate','get_entity_history'}
            check({t['name'] for t in result['result']['tools']} == expected, 'MCP tool vocabulary mismatch')
            result = api.mcp(token, 'tools/call', {'name': 'get_entity', 'arguments': {'id': e['id']}})
            check('result' in result and not result['result'].get('isError'), 'MCP read failed')
            denied = api.mcp(token, 'tools/call', {'name': 'create_entity', 'arguments': {'kind': 'agent', 'type': 'assistant', 'title': 'Forbidden'}})
            check(denied.get('result', {}).get('isError') or 'error' in denied, 'MCP read-only token wrote')
        finally:
            api.rpc('token_revoke', owner, {'p_workspace_id': w, 'p_token_id': issued['summary']['id']})
        api.mcp(token, 'tools/list', expected=(401,))
        print('PASS: modern MCP discovery, nineteen tools, scope and revocation')
    print('Local smoke complete. Test fixtures remain only in the disposable stack.')


if __name__ == '__main__':
    main()
