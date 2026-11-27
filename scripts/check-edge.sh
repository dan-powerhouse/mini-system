#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions/mcp"
command -v deno >/dev/null || { echo 'Install Deno 2.9.6'; exit 1; }
[[ "$(deno --version | head -1 | cut -d' ' -f2)" == 2.9.6 ]] || { echo 'Use Deno 2.9.6'; exit 1; }
deno check --frozen index.ts candidate/register-read-tools.ts golden-tools.ts tool-ux_test.ts
deno test --frozen tool-ux_test.ts
cd ..
deno check --frozen import/index.ts export/index.ts exchange-cleanup/index.ts publish/index.ts _shared/exchange_test.ts _shared/process-package_test.ts _shared/supabase-env_test.ts
deno test --frozen _shared/exchange_test.ts _shared/process-package_test.ts _shared/supabase-env_test.ts
