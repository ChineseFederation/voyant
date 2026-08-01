# Custom deployment modules

Add a custom module here to extend this deployment **without forking the
framework**. Every `src/modules/<name>/index.ts` is discovered at build time,
added to the graph, and loaded by the generated runtime. The module survives
`voyant upgrade`.

## Shape

```
src/modules/loyalty/
  index.ts                  # activates the runtime convention
  routes.ts                 # Hono routes
  service.ts                # business logic
  schema.ts                 # optional module-owned Drizzle schema
  drizzle.config.ts         # optional generation config
  migrations/               # optional committed module-owned history
```

`voyant generate module loyalty --dir src/modules` scaffolds this for you.

## index.ts — mounting

Default-export the module via `defineDeploymentModule` (accepts a ready
`ApiModule` or a factory):

```ts
import { defineDeploymentModule } from "@voyant-travel/framework"
import { loyaltyRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "loyalty" },
  adminRoutes: loyaltyRoutes, // → /v1/admin/loyalty/*
  // publicRoutes / lazyAdminRoutes / lazyPublicRoutes also supported
})
```

The resolver creates the graph unit from the project package name and directory
name, then emits a project-relative static import under `.voyant/runtime`.

## Inbound webhook routes

Direct `src/modules` entries are runtime-only. They can expose admin and public
routes, but they cannot declare graph-governed inbound webhooks. A module that
returns `webhookRoutes` must use the project-owned workspace-package shape so
its manifest can declare both the webhook API and the inbound webhook:

```ts
// packages/qa-probe/src/voyant.ts
import { defineModule } from "@voyant-travel/core/project"

export const qaProbeVoyantModule = defineModule({
  id: "@acme/qa-probe",
  packageName: "@acme/qa-probe",
  runtime: { entry: "@acme/qa-probe", export: "default" },
  api: [{
    id: "@acme/qa-probe#api.webhook",
    surface: "webhook",
    mount: "qa-probe",
    runtime: { entry: "@acme/qa-probe", export: "default" },
  }],
  webhooks: [{
    id: "@acme/qa-probe#webhook.inbound",
    direction: "inbound",
    apiId: "@acme/qa-probe#api.webhook",
  }],
})
```

Select that local package with `modules: [{ resolve:
"./packages/qa-probe" }]` in `voyant.config.ts`. See the [complete package
metadata, runtime, and manifest
pattern](../../../../docs/architecture/custom-modules.md#inbound-webhook-modules).

## Database migrations

Generate an app-local module's migrations with Drizzle Kit directly; migration
generation is not part of `voyant migrate`:

```bash
pnpm exec drizzle-kit generate \
  --config src/modules/loyalty/drizzle.config.ts \
  --prefix timestamp \
  --name add-loyalty-points
```

The module config points `schema` at `./src/modules/loyalty/schema.ts` and `out`
at `./src/modules/loyalty/migrations`. Declare that same module-scoped folder in
`voyant.config.ts` so it is admitted after selected package migrations:

```ts
export default defineConfig({
  deployment: {
    migrations: [
      { id: "project.module.loyalty", source: "./src/modules/loyalty/migrations" },
    ],
  },
})
```

`voyant migrate` applies the resulting committed SQL; it never generates or
rewrites it. Keep each local module's history in its own directory. A root
aggregate `migrations/` folder is only an explicit escape hatch for genuinely
application-wide DDL.

Schema-bearing reusable modules and plugins own and publish their schema and
migration history inside their package, exactly like first-party modules. A
consumer selects that package and does not regenerate or copy its migrations.

## Operator-owned units

Keep only deployment-specific product behavior here. Reusable identity and
access behavior, including credential invitations and cloud team management,
is owned by `@voyant-travel/auth`; deployments supply its typed runtime port.
