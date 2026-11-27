# Running the test suite

Use a disposable Supabase stack with CLI 2.76.8 and Deno 2.9.6. From the repository root, run:

```sh
supabase start
python3 tests/supabase/run_application_local.py --confirm-disposable
```

The runner executes the Auth and Data API checks, all MCP HTTP groups, and the multipart import and ZIP download tests. The adapters run from their checked-in entry points against actual local Auth, PostgREST, PostgreSQL and Storage. The runner starts adapters on port 8000, so run it on an isolated machine without publishing that port. Tests create synthetic fixtures and leave them in the disposable stack.

The application runner reports a nonzero result if any group fails and still runs the other groups. The database workflow also runs the native queue lifecycle tests against real PGMQ, the standalone PostgreSQL concurrency tests, and the export reference portability regression. The export regression is a separate final CI step. It requires a complete-export positive control and then checks that the default export can be previewed in a fresh destination. It is expected to fail if the default export silently omits a referenced archived entity.

Use `bash scripts/check-edge.sh` for frozen Edge type checks and codec/contract tests, and `npm test` in `apps/identity` for identity unit tests. The browser OAuth and passkey flow requires a configured identity origin and provider and is outside the local HTTP runner.
