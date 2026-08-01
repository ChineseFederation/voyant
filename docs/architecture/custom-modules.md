# Custom modules — extend a deployment without forking

A deployment can add its own domain modules **on top of** the standard framework
set without editing a single framework-owned file, and the module survives
`voyant upgrade`. This is the "custom module" seam from the consolidated-deployments
RFC (the "20%"). Three mechanisms cooperate, all **build-time**, so the resolved
graph lowers to one deterministic Node application artifact with no runtime
package discovery:

1. **Graph activation** — `src/modules/<name>/index.ts` is discovered at build time.
2. **Declaration and runtime** — the resolver synthesizes the project-owned graph
   unit and `index.ts` exports its runtime factory.
3. **Persistence** — schema-bearing modules use the reusable package shape and
   publish their own migrations; direct `src/modules` entries are runtime-only.

## TL;DR

```sh
voyant generate module loyalty --dir src/modules
# edit src/modules/loyalty/{index,routes,service}.ts
```

No edits to `app.ts`, the framework, or any generated file.

## Background work

Project modules may contribute bounded event subscribers. Product jobs belong to
reusable selected modules or plugins and are declared in those package manifests;
applications do not define job handlers or schedules through `voyant.config.ts`,
`src/jobs`, or `src/workflows`.

Customer-specific scheduled or durable automation runs outside Voyant, consumes
versioned events or signed webhooks, and calls authenticated domain commands.

## Folder shape

```
src/modules/loyalty/
  index.ts     # default-exports the runtime module and activates the convention
  schema.ts    # Drizzle tables (optional)    → auto-migrated
  routes.ts    # Hono routes
  service.ts   # business logic
  validation.ts
```

The graph id is derived deterministically from the root `package.json` name and
the module directory name.

## Mounting (`index.ts`)

Default-export the module with `defineDeploymentModule`, which accepts a ready
`ApiModule` **or** a `ModuleFactory` (a `(ctx) => ApiModule` that receives the
deployment's injected capabilities):

```ts
import { defineDeploymentModule } from "@voyant-travel/framework"
import { loyaltyRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "loyalty" },
  adminRoutes: loyaltyRoutes,        // → /v1/admin/loyalty/*
  // publicRoutes                    → /v1/public/loyalty/*
  // lazyAdminRoutes / lazyPublicRoutes for cold-start weight
})
```

Need an injected provider (db, storage, notifications, …)? Take the factory form:

```ts
export default defineDeploymentModule((ctx) => ({
  module: { name: "loyalty" },
  adminRoutes: createLoyaltyRoutes(ctx.capabilities),
}))
```

### How activation works

The project resolver discovers each direct `src/modules/<name>/index.ts`, admits
one project-root source using the root package name, and emits a static relative
import from `.voyant/runtime`. No nested `package.json`, package export, local
`voyant.ts`, config selection, or deployment binding is required.

## Inbound webhook modules

Inbound webhook routes are graph-governed because they change anonymous route
posture. A direct `src/modules/<name>/index.ts` convention is runtime-only and
cannot declare `api` or `webhooks` facets. If it returns `webhookRoutes`,
`voyant build` fails with `PROJECT_WEBHOOK_DECLARATION_REQUIRED` before runtime.

Use a project-owned workspace package when the module needs inbound webhooks.
The package must publish its runtime and import-cheap manifest separately:

```jsonc
// packages/qa-probe/package.json
{
  "name": "@acme/qa-probe",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./voyant": "./src/voyant.ts"
  },
  "voyant": {
    "schemaVersion": "voyant.package.v1",
    "kind": "module",
    "manifest": "./voyant",
    "compatibleWith": {
      "framework": "*",
      "targets": ["node"],
      "modes": ["local", "managed-cloud", "self-hosted"]
    }
  }
}
```

The runtime owns the concrete Hono routes:

```ts
// packages/qa-probe/src/index.ts
import { defineDeploymentModule } from "@voyant-travel/framework"
import { Hono } from "hono"

const webhookRoutes = new Hono()
webhookRoutes.post("/demo", (c) => c.json({ ok: true }))

export default defineDeploymentModule({
  module: { name: "qa-probe" },
  webhookRoutes,
})
```

The manifest declares the executable webhook API and binds an inbound webhook
to it. Both declarations are required:

```ts
// packages/qa-probe/src/voyant.ts
import { defineModule } from "@voyant-travel/core/project"

const runtime = { entry: "@acme/qa-probe", export: "default" } as const

export const qaProbeVoyantModule = defineModule({
  id: "@acme/qa-probe",
  packageName: "@acme/qa-probe",
  localId: "qa-probe",
  runtime,
  api: [
    {
      id: "@acme/qa-probe#api.webhook",
      surface: "webhook",
      mount: "qa-probe",
      runtime,
    },
  ],
  webhooks: [
    {
      id: "@acme/qa-probe#webhook.inbound",
      direction: "inbound",
      apiId: "@acme/qa-probe#api.webhook",
    },
  ],
})
```

Select the local package as an application-owned difference:

```ts
// voyant.config.ts
import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  modules: [{ resolve: "./packages/qa-probe" }],
})
```

The resulting callback is mounted beneath `/v1/qa-probe`. Package-owned schema
and migrations, if any, follow the persistent-module rules below.

## Persistent modules

Direct `src/modules` entries are runtime-only. A module that owns tables uses
the reusable package shape, keeping its Drizzle schema and append-only migration
history together. In either shape:

- **Don't hard-FK across modules.** Reference a framework entity with a plain
  `text("person_id")` column and pair it with `defineLink` in `src/links` — the
  same decoupling the standard modules use.

```ts
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const loyalty_accounts = pgTable("loyalty_accounts", {
  id: text("id").primaryKey().notNull(),
  person_id: text("person_id").notNull(),
  points: integer("points").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

For persistence, promote the module to a workspace or published package with a
`voyant` manifest, schema export, and package-owned `migrations/` history. The
selected graph then orders and applies it without adding files to the starter.

## Project subscribers and links

Application-local subscribers live under `src/subscribers/**/*.ts`. Each file
default-exports a `SubscriberRuntimeDescriptor` with non-empty literal `id` and
`eventType` fields and a bounded `register` function.

```ts
import type { SubscriberRuntimeDescriptor } from "@voyant-travel/core"

export default {
  id: "loyalty.credit-booking-points",
  eventType: "booking.confirmed",
  register({ eventBus }) {
    eventBus.subscribe("booking.confirmed", async () => {
      // Perform bounded work or record durable intent.
    })
  },
} satisfies SubscriberRuntimeDescriptor
```

Application-local links live under `src/links/**/*.ts`. Each file imports
`defineLink` from `@voyant-travel/core` or `@voyant-travel/core/links` and
default-exports one definition:

```ts
import { defineLink } from "@voyant-travel/core"
import { booking } from "@voyant-travel/bookings/linkables"
import { loyaltyAccount } from "../modules/loyalty/linkables.js"

export default defineLink(booking, loyaltyAccount)
```

The build-time compiler parses these files without importing them, rejects
named runtime exports, project-root import escapes, invalid declaration shapes,
and duplicate subscriber IDs, then emits deterministic static imports in
`.voyant/runtime/project-subscribers.generated.ts` and
`.voyant/runtime/project-links.generated.ts`. Declaration and test files in
these directories are not convention entries. Runtime directory scanning is
not part of this contract.

`resolveProject()` adds both generated files to the disposable artifact set.
Subscribers must include a complete durable `manifest` whose `id` and
`eventType` match the descriptor and whose `payloadHash` and
`targetWorkflowId` are non-empty. Each subscriber becomes a graph runtime
reference; each link becomes a path-owned graph facet. This makes missing
workflow targets and duplicate graph identities resolver errors instead of
runtime surprises.

`voyant migrate` then loads the generated project link registry and
transactionally ensures every writable pivot table and index exists after the
selected graph's schema migrations succeed. Read-only links are not
materialized. `voyant db sync-links` remains available for explicit SQL
inspection or emission, but is not a separate deployment prerequisite.

## Custom routes on an *existing* module (extensions)

A `ApiExtension` adds routes to an **existing** module's surface (e.g. a
`/v1/admin/bookings/notes` endpoint on the standard `bookings` module) — as
opposed to a module, which is a whole new domain. Drop it in `src/extensions/`
and it's discovered + mounted the same way:

```ts
// src/extensions/booking-notes/index.ts
import { defineDeploymentExtension } from "@voyant-travel/framework"
import { bookingNotesRoutes } from "./routes.js"

export default defineDeploymentExtension({
  extension: { name: "booking-notes", module: "bookings" }, // target module
  adminRoutes: bookingNotesRoutes,                          // → /v1/admin/bookings/*
})
```

`extension.module` is the module the routes attach to. If the extension owns
tables, put them in `src/extensions/<name>/schema.ts` — the deployment drizzle
configs glob `src/extensions/*/schema.ts` too, so they migrate exactly like
custom-module schema. Project resolution admits each extension as a path-owned
graph unit and emits a static import in the generated project runtime. The
generic graph factory context invokes its default export only when selected, so
local authoring stays folder-based without an application-level registry.

## Custom admin UI (pages, widgets, nav)

The same drop-a-folder discovery extends the **dashboard UI**. A directory under
`src/admin/<name>/` default-exporting an `AdminExtension` is auto-composed into
the admin shell — any of a custom **page**, a **widget** injected into a named
slot, or a **nav** entry:

```tsx
// src/admin/concierge/index.tsx
import { defineAdminExtension } from "@voyant-travel/admin"
import { ConciergePage } from "./page.js"
import { ConciergeWidget } from "./widget.js"

export default defineAdminExtension({
  id: "concierge",
  navigation: [{ items: [{ id: "concierge", title: "Concierge", url: "/concierge" }] }],
  widgets: [{ id: "concierge-kpi", slot: "dashboard.after-kpis", component: ConciergeWidget }],
  routes: [{ id: "concierge", path: "/concierge", title: "Concierge", component: ConciergePage }],
})
```

Each entry has exactly one `index.ts` or `index.tsx`; having both is an error.
Other files in the entry directory are supporting implementation and are not
discovered independently. Build-time analysis parses the entry without running
it, requires a default export, and emits the client-only
`.voyant/admin/project-admin.generated.ts` module with deterministic static
imports. The generated array is checked against `AdminExtension`, and duplicate
extension IDs are reported when their string values can be read statically.

`resolveProject()` owns this compilation. Its artifact contract uses paths
relative to the disposable `.voyant/` root, and project API route files are
also represented as individual API facets on a synthetic project-owned module.
Generated route and admin entry modules are therefore inputs to the same graph
resolution as package-owned facets, not separate starter scans.

- **nav + widgets** merge via `adminExtensionsFromGlob` in
  `src/lib/admin-extensions.tsx` and resolve through the shared
  `resolveAdminNavigation` / `resolveAdminWidgets`.
- **page routes** graft into the TanStack route tree at runtime in
  `src/router.tsx` (`buildAdminExtensionRoutes`). Discovered pages are reachable
  by string navigation (`<Link to="/concierge">`) — they're not in the generated
  typed-link map.

Widget slots are starter-defined strings (`dashboard.after-kpis`,
`booking.details.header`, `invoice.details.after-summary`, …). See
`apps/operator/src/admin/README.md`.

## Why it's upgrade-safe

Everything you write lives under the deployment's `src/` — the framework owns
none of it. `voyant upgrade` bumps `@voyant-travel/framework` (and its pinned
runtime set + migration bundle); your `src/modules/*` and your deployment
migration source (`migrations/`) are untouched. The collector's
content-hash ledger keys migrations by `(source, tag)`, so a framework upgrade
never re-runs or collides with your deployment migrations.

## Limits

- **Standard profile.** A custom module *adds* tables; it doesn't remove or
  re-shape framework tables. Arbitrary add/remove of *framework* modules is the
  D.2 (package-owned migrations) story — out of scope here.
- **Discovery is build-time.** A new module requires rebuilding and redeploying
  the Node application artifact. Unified Voyant deployments do not target
  Cloudflare Workers.
- **Table names are global.** A custom table can't reuse a framework table name
  (e.g. `booking_notes` already exists) — `pnpm db:migrate` fails fast with
  `relation "…" already exists`. Prefix deployment-owned tables (`acme_*`) to stay
  clear of the standard schema.

See also: `consolidated-deployments-rfc.md` (the seam catalog) and
`migration-collector-d1.md` (the deployment migration source + collector).
