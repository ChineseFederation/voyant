# Operator Integration Application

This checked-in application exercises the complete operator product inside the
Voyant monorepo. It is integration coverage for workspace packages, generated
metadata, the Node host, and the SSR dashboard; it is not the consumer starter
template and should not be copied into a new project.

Consumer projects come from `scripts/package-starters.mjs`. Their canonical
authored shape is `STANDARD_NODE_STARTER`, documented in
[standard-node-starter-acceptance.md](../../docs/architecture/standard-node-starter-acceptance.md).
Keep integration-only source, tests, and workspace dependencies here rather
than adding them to the generated starter.

`package.intent.json` is the authored dependency and lifecycle input.
`scripts/generate-operator-application-manifest.mjs` merges it with the
first-party production closure selected by `@voyant-travel/operator-standard`
to generate `package.json`. Edit the intent, then run the generator with
`--emit`; CI runs `--check` and rejects drift. Third-party dependencies and the
application's five first-party host dependencies remain explicit in the intent.

## Stack

- **Runtime**: Node (resident process — e.g. Cloud Run), booted by the
  `createVoyantProjectServerEntry` host from `@voyant-travel/runtime`
- **Framework**: TanStack Start + React 19
- **UI**: Shared `@voyant-travel/ui` components and styles + Tailwind CSS v4
- **DB**: Postgres via pooled node-postgres (`DATABASE_URL_DIRECT`, the Node
  production default); neon-http/WS remain fallback adapters
- **Auth**: Better Auth
- **Jobs**: package-owned jobs selected through the resolved deployment graph

## Quick start

```bash
cp .env.example .env          # fill in DATABASE_URL and realm-specific auth secrets
pnpm -F operator dev          # Voyant development server + SSR (port 3300)
```

## Project customization

The directories under `src/api`, `src/admin`, `src/modules`, `src/extensions`,
`src/subscribers`, and `src/links` exercise every
supported project convention. Their README files document each convention.
`voyant build` discovers convention entries and emits static graph entries; no
central registration file is required.

The Voyant CLI loads `.env` for local lifecycle commands while preserving
platform environment variables as authoritative in deployed environments. `pnpm dev` serves
the SSR dashboard, the `/api/*` routes, and Better Auth with hot-reload — the
same `src/server.ts` handler runs under Vite's dev server. The first `/api/*`
request compiles the API module graph on demand (a few seconds), then it's warm.

When the project needs additional Vite plugins or ordinary Vite options, add an
optional root `vite.config.ts`. `voyant develop` and `voyant build` discover and
merge it automatically; do not copy or replace Voyant's generated configuration
under `.voyant/`. The `build.outDir` option is reserved because the Node server,
client assets, and deployment artifacts share the fixed `dist` layout.

## Production (Node)

```bash
pnpm -F operator build        # complete graph, client, and Node server build
pnpm -F operator start        # starts the built Node application (PORT defaults to 8080)
```

The server exposes `/healthz`, origin-trust-gated job invocation, and the client
build. Scheduled jobs come from the admitted graph. Provision them through deployment tooling
using `renderGoogleCloudSchedulerScript` from `@voyant-travel/framework/node-host`.

## Optional Cloud Services

Local and self-hosted deployments can run without a Voyant Cloud API key. Leave
`VOYANT_API_KEY` unset unless you want Cloud-backed notifications, realtime, or
Vault KMS.

Document rendering and finance FX lookup are configured separately:

```bash
# Any Voyant-compatible HTML-to-PDF endpoint. Used by contracts and brochures.
# Omit for the local basic PDF fallback.
VOYANT_DOCUMENT_RENDERER_URL="https://renderer.example/v1/pdf"
VOYANT_DOCUMENT_RENDERER_TOKEN="optional-bearer-token"
VOYANT_DOCUMENT_RENDERER_NAME="self-hosted-playwright"

# Hosted Voyant Data FX lookup for finance invoice/payment rates.
VOYANT_DATA_API_KEY="vd_..."
```

Managed Voyant injects its private document-rendering endpoint and deployment
credential automatically. Self-hosters can replace the renderer without changing
contract or brochure generation.

## Database

Selected packages own and publish their migration histories. The project graph
orders those package migrations and the Node runner applies them:

```bash
pnpm -F operator db:migrate
```

Project-local modules keep schema and migrations together under
`src/modules/<name>/`; generate those migrations with the module's ORM tooling
and admit that module-scoped folder through `voyant.config.ts`. Reusable plugins
ship their own migration history. `voyant migrate` applies the resolved plan but
never generates SQL. The application does not maintain an aggregate Drizzle schema
or copy framework migrations.

## Deploy

The operator is a resident Node process. Run the built server directly on any
host (a VM, a container, Cloud Run), or use the reference `Dockerfile`.

```bash
pnpm -F operator build            # dist/client + dist/server/server.js
PORT=8080 pnpm -F operator start  # node dist/server/server.js
```

### Container image

`Dockerfile` is a multi-stage pnpm-monorepo build. Build it **from the repo
root** (it needs the workspace source):

```bash
docker build -f apps/operator/Dockerfile -t voyant-operator .
docker run --rm --network host --env-file apps/operator/.env \
  voyant-operator node run-generated-migrations.mjs
docker run --rm -p 8080:8080 --env-file apps/operator/.env voyant-operator
```

Run the migration command once per rollout before starting new replicas. It
executes the graph-native migration plan embedded in that exact image and exits
non-zero if a migration fails; application startup does not run migrations.

The server leaves installed runtime package imports external while bundling its
application-owned server chunks. The runtime image ships built
`@voyant-travel/*` packages and the operator's production `node_modules` via
`pnpm deploy --prod`; no runtime import points back into the monorepo.

### Cloud Run

Node is the first-class target — keep the service **warm** (`--min-instances=1`)
so the composed graph stays resident. Env/secrets come from the platform (no
`.env` in the image).

```bash
# Build + push, from the repo root (custom Dockerfile path, so build locally and
# push — or run the same `docker build` inside a Cloud Build `--config` step):
IMAGE=REGION-docker.pkg.dev/PROJECT/voyant/operator
docker build -f apps/operator/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"

# Deploy (secrets via Secret Manager; DATABASE_URL_DIRECT = the pooled Node lane):
gcloud run deploy operator \
  --image="$IMAGE" \
  --region=REGION --port=8080 --min-instances=1 --cpu-boost \
  --set-env-vars="APP_URL=https://operator.example/api,DASH_BASE_URL=https://operator.example,VOYANT_ADMIN_AUTH_MODE=local" \
  --set-secrets="DATABASE_URL_DIRECT=operator-db-direct:latest,BETTER_AUTH_ADMIN_SECRET=operator-admin-auth:latest,BETTER_AUTH_CUSTOMER_SECRET=operator-customer-auth:latest,SESSION_CLAIMS_ADMIN_SECRET=operator-admin-claims:latest,SESSION_CLAIMS_CUSTOMER_SECRET=operator-customer-claims:latest,VOYANT_CHECKOUT_CAPABILITY_SECRET=operator-checkout-capability:latest,INTERNAL_API_KEY=operator-internal-key:latest,ORIGIN_TRUST_SECRET=operator-origin-trust:latest"
```

`/healthz` is the container/liveness probe. Set `ORIGIN_TRUST_SECRET` when a
dispatcher fronts the service (it stamps `x-voyant-origin-trust`; `/healthz` is
exempt). Crons don't run in-process. Deployment tooling derives Cloud Scheduler
jobs from the admitted graph and POSTs `/__voyant/scheduled?schedule=…`. See
[docs/architecture/deployment-targets.md](../../docs/architecture/deployment-targets.md).

`voyant start --probe` checks the liveness endpoint and then exits. It proves
that the Node process can boot, not that TanStack SSR or application API
dispatch can serve traffic. Release and packaged-starter acceptance must also
request at least one `/api/*` route and one SSR page such as `/docs`.

## Routes

Standard frontend routes are emitted from package-owned contributions into the
gitignored `.voyant/routes` directory. TanStack's generated route tree also
lives under `.voyant`; neither is application-authored source. Project-specific
admin and public API routes belong in `src/api/admin` and `src/api/public`.
Repository verification also writes disposable TypeScript, ambient binding,
Vite, and Vitest metadata there; do not copy those generated files back to the
project root.

- `/v1/admin/*` — staff-facing API (requires `staff` actor)
- `/v1/public/*` — customer/partner/supplier API
- `/api/auth/*` — Better Auth handler
- `/*` — TanStack Start SSR dashboard
- `/healthz` — liveness probe (Node runtime)
- `/__voyant/scheduled?schedule=<id>` — Cloud Scheduler hook (origin-trust gated)

## Operator Shell

The workspace shell uses the shared `OperatorAdminWorkspaceLayout`. Operators
can collapse or expand the sidebar from the header trigger, or with `Cmd+B` on
macOS and `Ctrl+B` on Windows and Linux.

Use `OperatorAdminPageShell` from `@voyant-travel/admin` for route-level chrome:
breadcrumbs, page actions, and the padded page body. When a route adopts the
page shell, pass `showSidebarTrigger={false}` to `OperatorAdminWorkspaceLayout`
so the shell owns the only visible route header. Pass `padded={false}` to the
page shell for full-bleed operator tools that own their own spacing.

Route-level browser titles are auto-derived from the shared navigation items
and active locale. Override detail pages that need entity-specific metadata
with `useAdminPageHead({ title, description })` from `@voyant-travel/admin`. The
root document also sets `robots: noindex,nofollow`; keep operator deployments
out of search indexes.

## Charts

The dashboard uses `recharts` through `@voyant-travel/ui` and `@voyant-travel/admin`.
If chart cards render headers with blank bodies, run `pnpm -r why recharts`
and confirm the app resolves a single `recharts` version. Add a workspace
override only if a downstream dependency forces a second copy.

## License

Apache-2.0
