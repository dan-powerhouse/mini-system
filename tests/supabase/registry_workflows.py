#!/usr/bin/env python3
"""Registry workflows through actual Auth, MCP HTTP, and PostgREST."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import unittest
from uuid import uuid4

from mcp_read_smoke import ReadAPI
from smoke import local_keys


class RegistryWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = ReadAPI(*local_keys(), True)
        cls.owner_id, _, cls.owner = cls.api.user('workflow-owner')
        cls.member_id, cls.member_email, cls.member = cls.api.user('workflow-member')

    def setUp(self):
        slug = 'workflow-' + uuid4().hex
        self.workspace = self.api.rpc('workspace_create', self.owner, {
            'p_name': slug, 'p_slug': slug,
        })['id']
        self.rpc('template_upsert', p_kind='object', p_type='asset', p_fields=[])
        self.token, self.token_id = self.issue(self.owner_id, ['read', 'write'])

    def rpc(self, name, **arguments):
        return self.api.rpc(name, self.owner, {'p_workspace_id': self.workspace, **arguments})

    def issue(self, user_id, scopes):
        issued = self.rpc('token_issue', p_user_id=user_id, p_label='Workflow test', p_scopes=scopes)
        token_id = issued['summary']['id']
        self.addCleanup(self.rpc, 'token_revoke', p_token_id=token_id)
        return issued['token'], token_id

    def call(self, name, arguments, *, token=None, error=None):
        reply = self.api.mcp(token or self.token, 'tools/call', {'name': name, 'arguments': arguments})
        self.assertNotIn('error', reply, f'{name} returned a protocol error')
        result = reply['result']
        if error:
            self.assertIs(result.get('isError'), True)
            self.assertNotIn('structuredContent', result)
            self.assertEqual(json.loads(result['content'][0]['text'])['code'], error)
            return None
        self.assertFalse(result.get('isError'), f'{name} failed')
        self.assertEqual(json.loads(result['content'][0]['text']), result['structuredContent'])
        return result['structuredContent']

    def entity(self, title):
        return self.call('create_entity', {'kind': 'object', 'type': 'asset', 'title': title})['entity']

    def rows(self, table, query):
        return self.api.request(
            f'/rest/v1/{table}?workspace_id=eq.{self.workspace}&{query}', token=self.owner,
        )[1]

    def test_version_conflict_under_concurrent_edits(self):
        """ACCEPTANCE 76, 82, 86. Both writers use the same previously read version."""
        entity = self.entity('Before edit')

        def update(title):
            return self.api.mcp(self.token, 'tools/call', {'name': 'update_entity', 'arguments': {
                'id': entity['id'], 'expectedVersion': entity['version'], 'title': title,
            }})['result']

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(update, ['First editor', 'Second editor']))
        failed = [result for result in results if result.get('isError')]
        passed = [result for result in results if not result.get('isError')]
        self.assertEqual((len(passed), len(failed)), (1, 1))
        self.assertEqual(json.loads(failed[0]['content'][0]['text'])['code'], 'VERSION_CONFLICT')
        winner = passed[0]['structuredContent']['entity']
        rows = self.rows('entity', f"id=eq.{entity['id']}&select=title,version")
        self.assertEqual(rows, [{'title': winner['title'], 'version': entity['version'] + 1}])
        audit = self.rows('audit_log', f"target_id=eq.{entity['id']}&action=eq.entity.update&select=actor_id,outcome")
        self.assertEqual(audit, [{'actor_id': self.token_id, 'outcome': 'success'}])

    def test_permission_changes_apply_to_existing_credentials(self):
        """ACCEPTANCE 38, 41, 42, 43, 74, 94, 114."""
        read_only, read_id = self.issue(self.owner_id, ['read'])
        arguments = {'kind': 'object', 'type': 'asset', 'title': 'Must not persist'}
        self.call('create_entity', arguments, token=read_only, error='FORBIDDEN')
        denied = self.rows('audit_log', f'actor_id=eq.{read_id}&select=action,outcome,effective_user_id,metadata')
        self.assertEqual(denied, [{
            'action': 'mcp.create_entity', 'outcome': 'failure',
            'effective_user_id': self.owner_id, 'metadata': {'code': 'FORBIDDEN'},
        }])
        invite = self.rpc('member_invite', p_email=self.member_email, p_role='editor')
        self.api.rpc('member_accept_invitation', self.member, {'p_token': invite['token']})
        editor, _ = self.issue(self.member_id, ['read', 'write'])
        created = self.call('create_entity', {**arguments, 'title': 'Created by editor'}, token=editor)['entity']
        self.rpc('member_update_role', p_user_id=self.member_id, p_role='viewer')
        self.call('create_entity', arguments, token=editor, error='FORBIDDEN')
        self.assertEqual(self.call('get_entity', {'id': created['id']}, token=editor)['entity']['id'], created['id'])
        self.rpc('member_remove', p_user_id=self.member_id)
        self.assertEqual(self.api.mcp(editor, 'tools/list', expected=(401,)), {'error': 'UNAUTHENTICATED'})
        self.assertEqual(self.rows('entity', 'select=id'), [{'id': created['id']}])

    def test_catalog_and_resource_requests_have_one_audit_event_each(self):
        """ACCEPTANCE 72, 74."""
        entity = self.entity('Resource target')
        catalog = self.api.mcp(self.token, 'tools/list')['result']
        self.assertEqual(len(catalog['tools']), 19)
        uri = f"entitygraph://entities/{entity['id']}"
        resource = self.api.mcp(self.token, 'resources/read', {'uri': uri})['result']['contents']
        self.assertEqual(len(resource), 1)
        self.assertEqual(resource[0]['uri'], uri)
        self.assertEqual(json.loads(resource[0]['text'])['entity']['id'], entity['id'])
        audit = self.rows(
            'audit_log',
            f'actor_id=eq.{self.token_id}&source=eq.mcp&select=action,outcome,request_id',
        )
        self.assertCountEqual(
            [(row['action'], row['outcome']) for row in audit],
            [('entity.create', 'success'), ('mcp.tools/list', 'success'), ('mcp.get_entity', 'success')],
        )
        self.assertEqual(len({row['request_id'] for row in audit}), 3)

    def test_signed_search_pages_stay_bound_to_the_query(self):
        """ACCEPTANCE 49, 50, 52."""
        entities = [self.entity(title) for title in ('Alpha', 'Bravo', 'Charlie')]
        query = {'kind': 'object', 'limit': 1, 'sort': {'field': 'title', 'direction': 'asc'}}
        page = self.call('search_entities', query)
        self.assertEqual([row['id'] for row in page['items']], [entities[0]['id']])
        cursor = page['nextCursor']
        self.assertTrue(cursor)
        self.call('search_entities', {**query, 'sort': {'field': 'title', 'direction': 'desc'},
                                     'cursor': cursor}, error='VALIDATION_ERROR')
        page = self.call('search_entities', {**query, 'cursor': cursor})
        self.assertEqual([row['id'] for row in page['items']], [entities[1]['id']])
        page = self.call('search_entities', {**query, 'cursor': page['nextCursor']})
        self.assertEqual([row['id'] for row in page['items']], [entities[2]['id']])
        self.assertIsNone(page['nextCursor'])

    def test_archive_retains_relationship_then_delete_retains_audit(self):
        """ACCEPTANCE 20, 21, 27, 28, 32, 33, 52."""
        source, target = self.entity('Source'), self.entity('Target')
        self.rpc('predicate_upsert', p_name='contains', p_from_kinds=['object'], p_to_kinds=['object'],
                 p_directed=True, p_description='Contains')
        edge = {'fromId': source['id'], 'toId': target['id'], 'predicate': 'contains'}
        relation = self.call('create_relation', edge)['relation']
        self.call('create_relation', edge, error='CONFLICT')
        patch = {'id': relation['id'], 'expectedVersion': relation['version'], 'attributes': {'weight': 2}}
        changed = self.call('update_relation', patch)['relation']
        self.assertEqual(changed['version'], relation['version'] + 1)
        self.call('update_relation', patch, error='VERSION_CONFLICT')
        archived = self.call('archive_entity', {'id': target['id'], 'expectedVersion': target['version']})['entity']
        self.assertEqual(archived['status'], 'archived')
        self.call('update_entity', {'id': target['id'], 'expectedVersion': archived['version'],
                                    'status': 'active'}, error='ARCHIVED_ENTITY')
        self.assertEqual(self.rows('relation', 'select=id,attributes'), [
            {'id': relation['id'], 'attributes': {'weight': 2}},
        ])
        self.assertEqual({row['id'] for row in self.call('search_entities', {})['items']}, {source['id']})
        self.assertEqual(self.call('delete_relation', {'id': relation['id']}), {'success': True})
        self.assertEqual(self.rows('relation', 'select=id'), [])
        self.assertEqual({row['id'] for row in self.rows('entity', 'select=id')}, {source['id'], target['id']})
        audit = self.rows('audit_log', f"target_id=eq.{relation['id']}&action=eq.relation.delete&select=before,outcome")
        self.assertEqual(len(audit), 1)
        self.assertEqual(audit[0]['outcome'], 'success')
        self.assertEqual(audit[0]['before']['version'], changed['version'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable', action='store_true', required=True)
    parser.parse_args()
    unittest.main(argv=[__file__], verbosity=2)
