# mini system

mini system is a workspace registry for people, objects, process kinds, agents and apps. Its Supabase backend serves the browser experience and the custom MCP interface.

| Surface | Status in this package |
| --- | --- |
| Registry and Workspace | Next.js app with search, records, relations, saved views and workspace navigation. The Harbor preview runs locally without Supabase. |
| Identity | Next.js app with shared login, recovery and passkeys. Login and OAuth consent routes currently share the package. Separate hosting is a release gate. |
| Authority | WebAuthn verification for an archive intent. Credential enrollment, the approval queue and execution are pending. |
| Custom MCP | Supabase Edge Function with Registry tools. Protocol revision `2026-07-28` is the target. ChatGPT and Claude interoperability remains a release gate. |

## Quick start

Use Node.js 22 and npm.

```sh
cd apps/registry
npm ci
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127). Without Supabase settings, select **Harbor** to try the Workspace overview and Registry with sample data.

For Identity, run `npm ci` and `npm run dev` from `apps/identity`. The sign-in screens open at [http://localhost:3000](http://localhost:3000). To connect either app to a development project, use the corresponding `.env.example` and follow its application guide. Browser configuration uses Supabase publishable credentials.

## Repository map

| Location | Purpose |
| --- | --- |
| [apps/registry](apps/registry/README.md) | Registry and Workspace app, environment and build instructions |
| [apps/identity](apps/identity/README.md) | Sign-in app, environment and test instructions |
| [supabase](supabase/config.toml) | Database migrations, generated types, local configuration and Edge Functions |
| [tests](tests/README.md) | Standalone PostgreSQL and full-stack verification |
| [docs](docs/README.md) | Architecture, API reference, deployment and release status |
| [scripts](scripts/) | Local provisioning and source migration verification |

## Local backend and tests

For a disposable local dev stack, install Docker and Supabase CLI 2.76.8 and run `bash scripts/provision-local.sh` from the repository root. Use [tests/README.md](tests/README.md) for the full-stack Auth, MCP and exchange checks. The source migration manifest can be checked offline with `python3 scripts/check-migration-history.py`.

In each app directory, run `npm test` and `npm run build`. See the [latest verification](TEST-RUN.md) for observed results and the [production checklist](docs/PRODUCTION_V0.md) for open release gates.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for branches, review and release checks. See [SECURITY.md](SECURITY.md) for the security boundary.
