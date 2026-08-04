# Admin UI Extensions

> **Proposed evolution:**
> [`remote-app-platform-rfc.md`](./remote-app-platform-rfc.md) makes remote OAuth
> app installations the dynamic source of extension descriptors and replaces
> the reserved-but-unsupported token request with a short-lived, audience-bound
> admin session token. Apps own their iframe UI and translation catalogs; the
> host supplies locale and text direction while resolving release-pinned
> localized labels for host chrome. This document describes the currently
> implemented host and protocol until that RFC is accepted and delivered.

The admin UI-extension API lets a first- or third-party bundle render inside a
Voyant admin surface through a **named insertion slot**, isolated in a
sandboxed iframe and talking to the host over a versioned `postMessage`
protocol. Managed (cloud) and self-hosted admins run the *identical* mechanism;
only the source of the install list differs.

The contract lives in two packages:

- **`@voyant-travel/admin-extension-sdk`** — tiny, dependency-free: the API
  version constant, the protocol (message types, creators, guards), the shared
  value types, and the author client `initUiExtension`.
- **`@voyant-travel/admin`** — the host: the slot registry, the compatibility
  check, the `UiExtensionHost` React component, and the admin-extension factory
  that mounts installed extensions into every slot.

## Authoring an extension

An extension is a static bundle (any framework, or none) served from a URL. It
imports the SDK, calls `initUiExtension`, and uses the returned handle. Height
is reported automatically via a `ResizeObserver`, so a well-behaved extension
usually only needs the handshake.

```ts
import { initUiExtension } from "@voyant-travel/admin-extension-sdk"

const handle = await initUiExtension()

// Read the host context and per-install config.
const { org, viewer, entity, theme, locale } = handle.context
document.body.dataset.theme = theme
render(`Hello ${viewer.displayName} at ${org.name}`)

// React to host updates (theme/locale/entity changes).
handle.onContextChange((context) => {
  document.body.dataset.theme = context.theme
})

// Drive the small action surface the host allows.
handle.actions.toast("success", "Synced 12 bookings")
handle.actions.navigate("/bookings") // must be a relative admin path
handle.actions.resize(320) // usually unnecessary — height auto-reports
```

`initUiExtension(options?)` resolves once the host replies to the `ready`
handshake, or rejects after a 10s timeout. Options: `timeoutMs`, an explicit
`window` (for tests), and a `resizeTarget` element (default
`document.documentElement`; pass `null` to disable auto-reporting).

## Protocol reference

Every message is an envelope `{ v: 1, type, payload? }` with a
`"voyant:ext:*"` type. Both sides authenticate by `event.source`, never by
origin (a sandboxed frame has an opaque origin). The host posts with
`targetOrigin: "*"`, which is safe in v1 because messages are source-checked
and carry no secrets.

### extension → host

| type | payload | host behavior |
| --- | --- | --- |
| `voyant:ext:ready` | — | handshake; host replies with `init` |
| `voyant:ext:resize` | `{ height }` | set frame height, clamped to `[0, 800]` |
| `voyant:ext:navigate` | `{ to }` | navigate **only** if `to` is a relative admin path |
| `voyant:ext:toast` | `{ intent, message }` | raise a toast; `message` length-capped |
| `voyant:ext:request-token` | — | **reserved** — host answers `error` `{ code: "not-supported" }` |

### host → extension

| type | payload |
| --- | --- |
| `voyant:ext:init` | `{ apiVersion, slot, context, config }` |
| `voyant:ext:context` | `{ context }` (theme/locale/entity updates) |
| `voyant:ext:error` | `{ code }` |

### Context

```ts
interface UiExtensionContext {
  org: { slug: string; name: string }
  viewer: { id: string; displayName: string }
  entity: { type: string; id: string } | null
  theme: "light" | "dark"
  locale: string
}
```

## Sandbox constraints

The host renders the frame with a fixed, non-negotiable security posture:

- `sandbox="allow-scripts allow-forms allow-popups"` — **never**
  `allow-same-origin`.
- `referrerpolicy="no-referrer"`, `loading="lazy"`.
- Messages are accepted only from the frame's own `contentWindow` (host side)
  and only from `window.parent` (extension side).
- A 10s handshake timeout, resize heights clamped to `[0, 800]`, and toast
  messages length-capped.
- Every host is wrapped in an error boundary — a failed or slow extension can
  never break the surrounding admin.
- An incompatible descriptor renders a quiet "incompatible with this admin
  version" card and **never mounts the iframe**.

## Slots

The closed v1 slot set (each already exists as a widget slot on the operator
admin surfaces):

- `dashboard.header`
- `dashboard.after-kpis`
- `dashboard.footer`
- `booking.details.header`
- `booking.details.after-summary`
- `invoice.details.header`
- `invoice.details.after-summary`
- `workspace.header.actions`

## Wiring the host

The cloud resolves manifests into `UiExtensionDescriptor`s; the framework never
parses manifests. Self-hosted admins supply a static list:

```ts
import {
  createStaticUiExtensionsClient,
  createUiExtensionsAdminExtension,
  UiExtensionEnvironmentProvider,
} from "@voyant-travel/admin"

const client = createStaticUiExtensionsClient([
  {
    key: "acme-reviews",
    version: "1.4.0",
    displayName: "Acme Reviews",
    extensionApi: "^1",
    entryUrl: "https://ext.acme.example/reviews/",
    slots: ["dashboard.after-kpis"],
  },
])

const extension = createUiExtensionsAdminExtension({ client })
// Register `extension` with the admin extension registry, and wrap the admin
// shell in <UiExtensionEnvironmentProvider value={{ org, viewer, entity }}> so
// each host can build its context (theme + locale come from the admin
// providers). A `client.list()` failure renders nothing (fail-soft).
```

## Versioning policy

`ADMIN_UI_EXTENSION_API_VERSION` is the semver the host implements (currently
`1.1.0`). Extensions declare a compatible **range** in their manifest's
`extensionApi` field (`"^1"`, `"^1.2"`, `"1.x"`, or an exact `"1.2.3"`); the
host evaluates it at render time and refuses incompatible descriptors.

- **Adding a slot** is a MINOR change — a new capability extensions can opt into
  without breaking existing ones.
- **Renaming or removing a slot**, or a breaking change to the protocol or the
  resolved-descriptor shape, is a MAJOR change.
