# @voyant-travel/admin-host

Generic host primitives for a Voyant admin frontend. It owns selected-graph
presentation and workspace composition, TanStack Start policy, static-asset
serving, and the SSR handler. Product routes, providers, and styles belong to a
distribution such as `@voyant-travel/operator-standard`.

## Install

```bash
pnpm add @voyant-travel/admin-host
```

## Exports

| Entry | Description |
| --- | --- |
| `./presentation` | `createAdminHostPresentation(...)` - composes the selected graph, core admin, and explicit project-local admin convention |
| `./start` | Standard TanStack Start SSR and CSRF policy |
| `./serve` | `serveAdminHost(...)` - Hono Node host that serves built client assets, then falls through to the combined API + SSR app |
| `./ssr` | `createAdminSsrHandler(...)` - the TanStack Start SSR handler (`createStartHandler` + active-route manifest restriction) |
| `.` | Barrel re-exporting the serving, SSR, and workspace APIs |

## Usage

```ts
// server.ts — Node static host + fall-through to the composed app
import { serveAdminHost } from "@voyant-travel/admin-host/serve"
import { fetch as appFetch } from "./entry"

const web = serveAdminHost({ clientAssetsDir: CLIENT_DIR, app: appFetch })
```

```ts
// ssr-handler.ts — packaged SSR handler, dynamic-imported behind the non-API branch
import { createAdminSsrHandler } from "@voyant-travel/admin-host/ssr"

export const handleSsrRequest = createAdminSsrHandler()
```

The SSR handler relies on the consuming app's TanStack Start build to provide
the router.

## Consumers

Consumed by Node deployments, including the standard project in
`apps/operator`.

## License

Apache-2.0
