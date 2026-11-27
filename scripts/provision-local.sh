#!/usr/bin/env bash
# Explicit user-run local provisioning only. Never targets a linked/hosted project.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v supabase >/dev/null || { echo 'Install the official Supabase CLI 2.76.8 (see README).'; exit 1; }
command -v docker >/dev/null || { echo 'Docker is required by Supabase CLI.'; exit 1; }
docker info >/dev/null
if [[ "$(supabase --version | head -1)" != 2.76.8 ]]; then echo 'Use the pinned Supabase CLI 2.76.8'; exit 1; fi
python3 scripts/check-migration-history.py
supabase start
# start applies pending migrations on first initialization; no reset on an existing database.
supabase migration up --local
bash scripts/provision-native-local.sh --confirm-local
supabase test db
supabase db lint --local --level error
