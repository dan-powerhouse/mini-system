#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Run only on a fresh disposable PostgreSQL 16 instance with real PGMQ
# extension files installed (tested with official v1.7.0). Not a Supabase project.
[[ "${PGDATABASE:-}" == entitygraph_execution_check ]] || { echo 'Use a fresh disposable entitygraph_execution_check database' >&2; exit 1; }
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c "select current_database()='entitygraph_execution_check' and to_regnamespace('auth') is null and to_regclass('public.workspace') is null")" == t ]] || { echo 'Refusing an existing database' >&2; exit 1; }
psql -X -At -v ON_ERROR_STOP=1 -c "select name,default_version from pg_available_extensions where name='pgmq'" | grep -q '^pgmq|'
psql -X -v ON_ERROR_STOP=1 -f tests/postgres16/auth_shim.sql
# Only the real Supabase Storage schema is absent here. Replace its combined
# Queue/Storage migration with the exact Queue setup from that migration.
for f in supabase/migrations/*.sql; do
  case "$f" in
    *_execution_native.sql)
      # Stop before Storage statements; preserve the real PGMQ setup verbatim.
      sed '/^insert into storage.buckets/,$d' "$f" | psql -X -v ON_ERROR_STOP=1 -1
      ;;
    # Storage limits, GraphQL and Cron/Vault need the Supabase platform.
    *_native_platform.sql) ;;
    *) psql -X -v ON_ERROR_STOP=1 -1 -f "$f" ;;
  esac
done
psql -X -At -v ON_ERROR_STOP=1 -c "select extversion from pg_extension where extname='pgmq'"
for suite in verify entity_rpc process_storage relations_rpc registry_reads workspace_access mcp_access registry_operations registry_paths registry_exchange registry_audit process_kind_publication; do
  psql -X -v ON_ERROR_STOP=1 -f "tests/postgres16/$suite.sql"
done
psql -X -v ON_ERROR_STOP=1 -f tests/identity/authorization.sql
psql -X -v ON_ERROR_STOP=1 -f tests/mcp/read_tools.sql
psql -X -v ON_ERROR_STOP=1 -f tests/mcp/golden_path.sql
psql -X -v ON_ERROR_STOP=1 -f tests/native/process_execution.sql
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c 'select count(*) from public.workspace')" == 0 ]]
python3 tests/native/concurrency_test.py
echo 'Native execution fixtures are intentionally retained in this disposable test database. Discard it after verification.'
