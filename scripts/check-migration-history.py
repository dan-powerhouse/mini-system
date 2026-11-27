#!/usr/bin/env python3
"""Check immutable release migration hashes; --live compares read-only via psql.
Use PG* connection settings (never put credentials in this source or argv).
By default no network or database calls. No migration is applied or repaired.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--live', action='store_true', help='compare exact history to a DB selected through standard PG environment variables')
args = parser.parse_args()
actual = []
for f in sorted((root/'supabase/migrations').glob('*.sql')):
    m = re.fullmatch(r'(\d{14})_([a-z0-9_]+)\.sql', f.name)
    if not m:
        raise SystemExit(f'Invalid migration name: {f.name}')
    actual.append({'version':m[1], 'name':m[2], 'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
expected = json.loads((root/'supabase/migration-manifest.json').read_text())['migrations']
if len({r['version'] for r in actual}) != len(actual):
    raise SystemExit('Duplicate migration version')
if actual != expected:
    raise SystemExit('Source migration manifest mismatch. Never edit applied migrations; append reviewed new migrations.')
print(f'PASS: {len(actual)} source migration IDs, names and byte hashes')
if args.live:
    # CLI/API records may split statements; join using LF exactly as observed in Registry.
    # Any differing serialization is a conservative mismatch, never a repair request.
    sql = """select coalesce(json_agg(json_build_object('version',version,'name',name,'sha256',encode(extensions.digest(array_to_string(statements,E'\\n'),'sha256'),'hex')) order by version),'[]'::json) from supabase_migrations.schema_migrations"""
    cmd = ['psql','-X','-At','-v','ON_ERROR_STOP=1','-c',sql]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    remote = json.loads(result.stdout)
    if remote != actual:
        raise SystemExit('Remote history mismatch. Do not push/reset/repair; inspect the differing IDs and hashes.')
    print(f'PASS: {len(remote)} database migration IDs, names and byte hashes match')
