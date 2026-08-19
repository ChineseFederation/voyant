# `@voyant-travel/public-api-client`

Framework-agnostic TypeScript client for custom Voyant public surfaces.

The client is generated from Voyant's composed Public API OpenAPI document. The
credential selects the TypeScript surface: a publishable (`vpk_`) key can call
only browser-safe operations, while a secret (`vsk_`) key can call the complete
public surface from a server. A secret-only path is absent from the publishable
client type.

```ts
import { createPublicApiClient } from "@voyant-travel/public-api-client"

const voyant = createPublicApiClient({
  baseUrl: "https://api.voyant.travel",
  publishableKey: process.env.PUBLIC_VOYANT_KEY!,
})

const { data, error } = await voyant.GET("/v1/public/settings")
if (error) throw new Error("Could not load public settings")
```

Use a secret key only in server-side code:

```ts
const serverVoyant = createPublicApiClient({
  baseUrl: "https://api.voyant.travel",
  secretKey: process.env.VOYANT_SECRET_KEY!,
})
```

`baseUrl`, a custom Fetch implementation, and the other `openapi-fetch`
options are supported. The client always pins the validated credential header;
constructor or per-call headers cannot replace it.

## Operation identities for Theme manifests

`publicApiOperations` is generated from the same composed OpenAPI document as
the client. It exposes each stable operation ID together with its HTTP method,
canonical path, and graph-derived credential posture. A Theme manifest can
import and re-export the IDs it requires instead of maintaining a parallel
registry:

```ts
import { publicApiOperations } from "@voyant-travel/public-api-client"

export const requiredPublicApiOperations = [
  publicApiOperations.getPublicProducts.id,
  publicApiOperations.getPublicSettings.id,
] as const
```

The Theme SDK can consume that ID list as manifest metadata. It should not copy
the methods, paths, or request and response shapes: routing metadata remains
generated here, while operation request and response truth remains in the
OpenAPI-generated client types.

## Voyant-managed Sites

Voyant-managed Sites use the same generated client through the canonical
same-origin `/v1/public/*` proxy. The managed Fetch seam rewrites only the
request origin; it does not define another operation layer. When the platform
supplies tenant authority through that transport, `managed: true` selects the
publishable operation posture without inventing or forwarding an API key.

```ts
import {
  createManagedPublicApiFetch,
  createPublicApiClient,
} from "@voyant-travel/public-api-client"

const origin = new URL(Astro.request.url).origin
const voyant = createPublicApiClient({
  // openapi-fetch constructs an absolute URL before calling custom Fetch.
  baseUrl: "https://api.voyant.travel",
  managed: true,
  fetch: createManagedPublicApiFetch({ proxyOrigin: origin }),
})
```

The host is responsible for implementing and authorizing the proxy. The Fetch
seam accepts only canonical `/v1/public` requests and preserves their path,
query, method, headers, body, streaming response, and abort behavior. During
browser rendering, `window.location.origin` can be used as `proxyOrigin`.

Managed mode always strips `x-api-key`, including caller-supplied headers, and
cannot type-check secret-only operations. The host transport remains
responsible for supplying and enforcing its platform capability.

Externally hosted Themes should continue to use a Voyant API `baseUrl` and a
`vpk_` publishable key or server-only `vsk_` secret key directly, without this
managed transport or any hosting registration in Voyant.

The SDK does not own HTTP routes or business state. React consumers should
layer their hooks on this package instead of reimplementing request paths.
