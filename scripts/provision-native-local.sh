#!/usr/bin/env bash
# Read-only verification of the native resources installed by migrations.
# Local Docker container only; no replay or worker activation.
set -euo pipefail
cd "$(dirname "$0")/.."
container=supabase_db_entitygraph-local
if [[ "${1:-}" != --confirm-local ]]; then
  echo 'Usage: bash scripts/provision-native-local.sh --confirm-local' >&2; exit 2
fi
command -v docker >/dev/null
# Fixed local development container; never accepts a database URL or project ref.
docker inspect --format '{{.State.Running}}' "$container" | grep -qx true
# Refuse execution before the approved schema and security migration exists.
docker exec "$container" psql -X -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "select to_regclass('public.process') is not null and to_regclass('public.saved_view') is not null" | grep -qx t
docker exec -i "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/provision/verify-native.sql
