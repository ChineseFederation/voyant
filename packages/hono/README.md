# @voyant-travel/hono

Voyant's sole server API runtime implementation. Provides `createApp()`,
middleware, auth helpers, and API bundle expansion for mounting Voyant modules
behind a Hono app.

## Install

```bash
pnpm add @voyant-travel/hono hono
```

## Requirements

On **Cloudflare Workers**, enable the `nodejs_compat` (or `nodejs_als`)
compatibility flag — the request-id correlation context uses
`AsyncLocalStorage` (`node:async_hooks`) on the always-used request path:

```jsonc
// wrangler.jsonc
{ "compatibility_flags": ["nodejs_compat"] }
```

Voyant apps/templates already set this. **Node** deployments need nothing.

## Usage

```typescript
import { createApp } from "@voyant-travel/hono"

const app = createApp({
  db: (env) => getDb(env),
  auth: { handler, resolve },
  modules: [crmModule, productsModule, bookingsModule],
  extensions: [smartbillFinanceExtension],
  plugins: [
    payloadCmsPlugin({
      /* optional distribution bundle */
    }),
  ],
})
```

Custom `resolve` adapters must return an explicit realm alongside the actor:
admin sessions return `{ actor: "staff", realm: "admin" }`, while storefront
sessions return a non-staff actor with `realm: "customer"`. Realm/actor
mismatches are rejected before protected routes run.

Use `modules`, `extensions`, and provider-backed route helpers as the default
composition surface. Use `plugins` when you want to register a reusable
distribution bundle that packages those pieces together.

The middleware chain is: container → requestId → logger → errorBoundary → CORS → health → auth handler → requireAuth → db → actor guards → module routes.

## Exports

| Entry | Description |
| --- | --- |
| `.` | Barrel re-exports |
| `./app` | `createApp` factory |
| `./module` | `ApiModule`, `ApiExtension` contracts |
| `./bundle` | `ApiBundle`, `defineApiBundle`, `expandApiBundles` |
| `./middleware` | All middleware re-exports |
| `./middleware/auth` | `requireAuth` session/API-key/JWT auth |
| `./middleware/cors` | CORS configuration |
| `./middleware/error-boundary` | Error handling + JSON error envelope |
| `./middleware/db` | Attach db client to `c.var.db` |
| `./middleware/rate-limit` | KV-backed rate limiter |
| `./middleware/require-actor` | Enforce `staff`/`customer`/`partner`/`supplier` actor |
| `./middleware/require-permission` | Permission-based guards |
| `./middleware/logger` | Request logger |
| `./auth/session-jwt` | `verifySession` shared-secret bearer/session-claims verification |
| `./auth/crypto` | `sha256Base64Url`, cookie helpers |

## License

Apache-2.0
