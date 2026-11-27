#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Only use a NEW, disposable plain PostgreSQL 16 instance; not Supabase production.
: "${PGDATABASE:?Set PGDATABASE to a disposable empty test database}"
if [[ "$PGDATABASE" != entitygraph_test ]]; then
  echo 'Refusing database name other than entitygraph_test' >&2; exit 1
fi
if [[ "$(psql -X -At -v ON_ERROR_STOP=1 -c "select current_database()='entitygraph_test' and to_regnamespace('auth') is null and to_regclass('public.workspace') is null")" != t ]]; then
  echo 'Refusing nonempty or Supabase database' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -c 'select version()'
psql -X -v ON_ERROR_STOP=1 -f tests/postgres16/auth_shim.sql
for migration in supabase/migrations/*.sql; do
  # Native Supabase Storage, PGMQ, Cron and Vault are intentionally absent from the plain PostgreSQL harness.
  case "$migration" in *_execution_native.sql|*_process_execution_private.sql|*_execution_foreign_key_indexes.sql|*_native_platform.sql) continue;; esac
  psql -X -v ON_ERROR_STOP=1 -1 -f "$migration"
done
for suite in verify entity_rpc process_storage relations_rpc registry_reads workspace_access mcp_access registry_operations registry_paths registry_exchange registry_audit process_kind_publication; do
  psql -X -v ON_ERROR_STOP=1 -f "tests/postgres16/$suite.sql"
done
psql -X -v ON_ERROR_STOP=1 -f tests/identity/authorization.sql
psql -X -v ON_ERROR_STOP=1 -f tests/mcp/read_tools.sql
psql -X -v ON_ERROR_STOP=1 -f tests/mcp/golden_path.sql
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c 'select count(*) from public.workspace')" == 0 ]]
