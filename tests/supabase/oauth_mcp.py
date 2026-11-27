#!/usr/bin/env python3
"""Delegated MCP access with a real native Supabase OAuth 2.1 access token.

Runs the complete authorization-code + PKCE flow against local Supabase Auth
(OAuth server enabled in supabase/config.toml): admin client registration,
authorize redirect, user consent through the Auth API, code exchange. The token
is then used against the exact MCP adapter. Registry access requires an explicit
grant issued from the member's direct session. Disposable local stack only;
no credentials are printed.
"""
import argparse
import base64
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from mcp_read_smoke import ReadAPI
from smoke import BASE, check, local_keys

REDIRECT = 'http://127.0.0.1:9/callback'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def claims(token):
    payload = token.split('.')[1]
    return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))


def oauth_token(api, user_token, client_id):
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    query = urllib.parse.urlencode({'response_type': 'code', 'client_id': client_id, 'redirect_uri': REDIRECT,
                                    'code_challenge': challenge, 'code_challenge_method': 's256',
                                    'scope': 'email', 'state': secrets.token_hex(8)})
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(BASE + '/auth/v1/oauth/authorize?' + query, headers={'apikey': api.public})
    try:
        opener.open(req, timeout=15)
        raise AssertionError('authorize did not redirect to the consent host')
    except urllib.error.HTTPError as exc:
        check(exc.code in (302, 303), f'authorize: unexpected HTTP {exc.code}')
        location = exc.headers['Location']
    authorization_id = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)['authorization_id'][0]
    _, details = api.request(f'/auth/v1/oauth/authorizations/{authorization_id}', token=user_token)
    check(details and details.get('client', {}).get('id', details.get('client_id')) in (client_id, None), 'consent details mismatch')
    _, approved = api.request(f'/auth/v1/oauth/authorizations/{authorization_id}/consent', token=user_token,
                              method='POST', data={'action': 'approve'}, allowed=(200, 201))
    code = urllib.parse.parse_qs(urllib.parse.urlparse(approved['redirect_url']).query)['code'][0]
    form = urllib.parse.urlencode({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT,
                                   'client_id': client_id, 'code_verifier': verifier}).encode()
    req = urllib.request.Request(BASE + '/auth/v1/oauth/token', method='POST', data=form,
                                 headers={'apikey': api.public, 'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=15) as res:
        token = json.loads(res.read())['access_token']
    c = claims(token)
    check(c.get('client_id') == client_id and c.get('session_id') and c.get('role') == 'authenticated', 'OAuth token lacks client/session binding')
    return token


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable', action='store_true', required=True)
    parser.add_argument('--registry-boundary-only', action='store_true',
                        help='Check native Auth and the Registry Data API without starting MCP')
    args = parser.parse_args()
    api = ReadAPI(*local_keys(), True)
    run = uuid.uuid4().hex
    owner_id, _, owner = api.user('oauth-owner')
    editor_id, editor_email, editor = api.user('oauth-editor')
    w = api.rpc('workspace_create', owner, {'p_name': 'OAuth ' + run, 'p_slug': 'oauth-' + run})['id']
    api.rpc('template_upsert', owner, {'p_workspace_id': w, 'p_kind': 'object', 'p_type': 'asset', 'p_fields': []})
    seed = api.rpc('entity_create', owner, {'p_workspace_id': w, 'p_input': {'kind': 'object', 'type': 'asset', 'title': 'OAuth seed ' + run}})
    invite = api.rpc('member_invite', owner, {'p_workspace_id': w, 'p_email': editor_email, 'p_role': 'editor'})
    api.rpc('member_accept_invitation', editor, {'p_token': invite['token']})
    _, client = api.request('/auth/v1/admin/oauth/clients', admin=True, method='POST', allowed=(200, 201),
                            data={'client_name': 'MCP test client ' + run, 'redirect_uris': [REDIRECT], 'client_type': 'public'})
    client_id = client['client_id']
    token = oauth_token(api, editor, client_id)
    print('PASS: real authorization code + PKCE flow issued a client- and session-bound access token')

    check(api.rpc('registry_direct_session', editor, {}) is True, 'direct session was rejected')
    check(api.rpc('registry_direct_session', token, {}) is False, 'OAuth session was accepted as direct')
    path = f'/rest/v1/entity?id=eq.{seed["id"]}&select=id'
    _, direct_rows = api.request(path, token=editor)
    _, delegated_rows = api.request(path, token=token)
    check(direct_rows == [{'id': seed['id']}], 'the direct member could not read the fixture')
    check(delegated_rows == [], 'the delegated token could read a direct Registry row')
    print('PASS: the same member passes the Registry session gate and table RLS only with direct Auth')
    if args.registry_boundary_only:
        grants_path = '/auth/v1/user/oauth/grants'
        _, consents = api.request(grants_path, token=editor)
        check(any(grant['client']['id'] == client_id for grant in consents),
              'native consent was missing after approval')
        query = urllib.parse.urlencode({'client_id': client_id})
        api.request(f'{grants_path}?{query}', token=editor, method='DELETE', allowed=(204,))
        _, remaining = api.request(grants_path, token=editor)
        check(all(grant['client']['id'] != client_id for grant in remaining),
              'revoked client remains authorized')
        check(api.rpc('registry_direct_session', editor, {}) is True,
              'revoking an app affected the direct session')
        print('PASS: native consent is removed for the client while the direct session stays active')
        return

    api.rpc('entity_search', token, {'p_workspace_id': w, 'p_query': {}}, allowed=(400, 401, 403, 404))
    api.mcp(token, 'tools/list', expected=(403,))
    api.rpc('oauth_grant_issue', token, {'p_workspace_id': w, 'p_client_id': client_id, 'p_operations': ['get_entity'],
                                         'p_expires_at': '2099-01-01T00:00:00Z'}, allowed=(400, 401, 403))
    print('PASS: OAuth identity alone gets no Registry data, no MCP tools and cannot grant itself access')

    expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    grant = api.rpc('oauth_grant_issue', editor, {'p_workspace_id': w, 'p_client_id': client_id,
                                                  'p_operations': ['search_entities', 'get_entity', 'create_entity'],
                                                  'p_expires_at': expires})
    check(grant['client_id'] == client_id and grant['user_id'] == editor_id, 'grant not bound to member and client')
    check(api.rpc('registry_direct_session', token, {}) is False, 'delegated grant changed the direct-only gate')

    listed = api.mcp(token, 'tools/list')
    check(any(t['name'] == 'get_entity' for t in listed['result']['tools']), 'tool catalog unavailable to granted client')

    def call(name, arguments, code=None):
        envelope = api.mcp(token, 'tools/call', {'name': name, 'arguments': arguments})['result']
        if code:
            check(envelope.get('isError') and json.loads(envelope['content'][0]['text'])['code'] == code, name + ': expected ' + code)
            return None
        check(not envelope.get('isError'), name + ': failed')
        return envelope['structuredContent']

    found = call('search_entities', {'q': 'OAuth seed ' + run})
    check(any(item['id'] == seed['id'] for item in found['items']), 'granted search missed the seed entity')
    check(call('get_entity', {'id': seed['id']})['entity']['title'] == 'OAuth seed ' + run, 'granted read failed')
    created = call('create_entity', {'kind': 'object', 'type': 'asset', 'title': 'Created via OAuth ' + run})['entity']
    call('archive_entity', {'id': created['id'], 'expectedVersion': created['version']}, code='FORBIDDEN')
    print('PASS: granted client reads and writes through MCP; ungranted operation refused')

    _, rows = api.request(f'/rest/v1/audit_log?workspace_id=eq.{w}&actor_id=eq.{grant["id"]}&select=action,outcome,effective_user_id,metadata', token=owner)
    actions = {(r['action'], r['outcome']) for r in rows}
    check(('entity.create', 'success') in actions and ('mcp.get_entity', 'success') in actions and ('mcp.archive_entity', 'failure') in actions,
          'grant-attributed audit incomplete')
    check(all(r['effective_user_id'] == editor_id and r['metadata'].get('oauthClientId') == client_id for r in rows), 'audit attribution wrong')
    _, entity = api.request(f'/rest/v1/entity?id=eq.{created["id"]}&select=created_by,title', token=owner)
    check(entity == [{'created_by': editor_id, 'title': 'Created via OAuth ' + run}], 'persisted entity mismatch')
    print('PASS: Data API confirms persisted row and audit attributed to member, grant and client')

    api.rpc('oauth_grant_revoke', owner, {'p_workspace_id': w, 'p_grant_id': grant['id']})
    api.mcp(token, 'tools/list', expected=(403,))
    print('PASS: admin revocation takes effect on the next MCP request')


if __name__ == '__main__':
    main()
