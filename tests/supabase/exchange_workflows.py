#!/usr/bin/env python3
"""ACCEPTANCE 63–68, 99: real Auth, multipart ZIP, private Storage and PostgREST."""
import argparse
import csv
from hashlib import sha256
from io import BytesIO, StringIO
import json
import unittest
import urllib.error
import urllib.request
from uuid import uuid4
from zipfile import ZipFile

from local_adapter import ADAPTER_URL, local_adapter
from smoke import BASE, LocalAPI, local_keys


def package(object_id, workspace):
    files = {
        'entities.csv': (
            'id,kind,type,title,status,attributes_json,notes,tags_json\n'
            f'{object_id},object,asset,"Café, example",active,{{}},,[]\n'
        ).encode(),
        'relations.csv': b'id,from_id,to_id,predicate,attributes_json,valid_from,valid_to\n',
    }
    manifest = {
        'formatVersion': 1, 'exportedAt': '2026-11-25T00:00:00Z',
        'sourceWorkspaceId': workspace, 'rowCounts': {'entities': 1, 'relations': 0},
        'checksums': {name: sha256(data).hexdigest() for name, data in files.items()},
    }
    buffer = BytesIO()
    with ZipFile(buffer, 'w') as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        archive.writestr('manifest.json', json.dumps(manifest))
    return buffer.getvalue()


class ExchangeWorkflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.public, cls.service = local_keys()
        cls.api = LocalAPI(cls.public, cls.service)
        cls.owner_id, _, cls.owner = cls.api.user('exchange-owner')
        _, _, cls.outsider = cls.api.user('exchange-outsider')

    def setUp(self):
        slug = 'exchange-workflow-' + uuid4().hex
        self.workspace = self.api.rpc('workspace_create', self.owner, {'p_name': slug, 'p_slug': slug})['id']
        self.rpc('template_upsert', p_kind='object', p_type='asset', p_fields=[])

    def rpc(self, name, **arguments):
        return self.api.rpc(name, self.owner, {'p_workspace_id': self.workspace, **arguments})

    def http(self, url, token=None, *, method='GET', data=None, headers=None):
        request_headers = dict(headers or {})
        if token:
            request_headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            with error:
                return error.code, error.headers, error.read()

    def upload(self, data, token):
        boundary = 'test-' + uuid4().hex
        head = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="workspaceId"\r\n\r\n'
            f'{self.workspace}\r\n--{boundary}\r\n'
            'Content-Disposition: form-data; name="file"; filename="registry.zip"\r\n'
            'Content-Type: application/zip\r\n\r\n'
        )
        return self.http(
            ADAPTER_URL, token, method='POST',
            headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
            data=head.encode() + data + f'\r\n--{boundary}--\r\n'.encode(),
        )

    def entities(self):
        return self.api.request(
            f'/rest/v1/entity?workspace_id=eq.{self.workspace}&select=id,title', token=self.owner,
        )[1]

    def test_import_storage_preview_commit_and_repeat(self):
        entity_id = str(uuid4())
        data = package(entity_id, self.workspace)
        with local_adapter('import', self.public, self.service):
            self.assertEqual(self.upload(data, None)[0], 401)
            self.assertEqual(self.upload(data, self.outsider)[0], 403)
            status, _, body = self.upload(data, self.owner)
        self.assertEqual(status, 201)
        upload = json.loads(body)
        self.assertEqual((upload['sha256'], upload['sizeBytes']), (sha256(data).hexdigest(), len(data)))
        object_url = (
            f'{BASE}/storage/v1/object/authenticated/registry-exchange/'
            f'{self.workspace}/{self.owner_id}/{upload["uploadId"]}.zip'
        )
        status, _, stored = self.http(object_url, self.service, headers={'apikey': self.service})
        self.assertEqual((status, stored), (200, data))
        # Storage is service-managed, including when the request carries the uploader's JWT.
        status, _, _ = self.http(object_url, self.owner, headers={'apikey': self.public})
        self.assertIn(status, (400, 401, 403, 404))
        self.assertEqual(self.entities(), [])
        preview = self.rpc('import_preview', p_upload_id=upload['uploadId'])
        self.assertEqual(preview['errors'], [])
        self.assertEqual(preview['validRows'], 1)
        self.assertEqual(self.entities(), [])
        self.assertEqual(self.rpc('import_commit', p_preview_id=preview['previewId']), {
            'entitiesCreated': 1, 'relationsCreated': 0,
        })
        self.assertEqual(self.entities(), [{'id': entity_id, 'title': 'Café, example'}])
        _, error = self.api.request(
            '/rest/v1/rpc/import_commit', token=self.owner, method='POST', allowed=(400, 404),
            data={'p_workspace_id': self.workspace, 'p_preview_id': preview['previewId']},
        )
        self.assertEqual(error['message'], 'NOT_FOUND')
        _, audit = self.api.request(
            f'/rest/v1/audit_log?workspace_id=eq.{self.workspace}&source=eq.import&select=action,target_id,outcome',
            token=self.owner,
        )
        self.assertEqual(audit, [{'action': 'entity.create', 'target_id': entity_id, 'outcome': 'success'}])

    def test_export_is_private_and_contains_the_snapshotted_bytes(self):
        entity = self.rpc('entity_create', p_input={'kind': 'object', 'type': 'asset', 'title': 'Original'})
        export = self.rpc('export_create')
        self.rpc('entity_update', p_id=entity['id'], p_expected_version=entity['version'],
                 p_patch={'title': 'After export'})
        with local_adapter('export', self.public, self.service):
            url = ADAPTER_URL + '/' + export['exportId']
            self.assertEqual(self.http(url)[0], 401)
            self.assertEqual(self.http(url, self.outsider)[0], 404)
            status, headers, body = self.http(url, self.owner)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), 'application/zip')
        with ZipFile(BytesIO(body)) as archive:
            self.assertCountEqual(archive.namelist(), ['entities.csv', 'relations.csv', 'manifest.json'])
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(manifest['sourceWorkspaceId'], self.workspace)
            self.assertEqual(manifest['rowCounts'], {'entities': 1, 'relations': 0})
            for name in ('entities.csv', 'relations.csv'):
                self.assertEqual(manifest['checksums'][name], sha256(archive.read(name)).hexdigest())
            records = list(csv.DictReader(StringIO(archive.read('entities.csv').decode())))
        self.assertEqual([(row['id'], row['title']) for row in records], [(entity['id'], 'Original')])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--confirm-disposable', action='store_true', required=True)
    parser.parse_args()
    unittest.main(argv=[__file__], verbosity=2)
