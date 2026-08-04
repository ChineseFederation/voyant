# App and extension compatibility axes

What a third-party app declares compatibility against, what the platform checks,
and where an incompatibility surfaces.

The short version: **not the image, and not the Framework version.** An app
declares against the contracts it actually consumes, each versioned in its own
currency. `VOYANT_APP_CONTRACT_VERSIONS` in `@voyant-travel/app-manifest` is the
single place those versions are defined.

## Why the obvious answers are wrong

Before the runtime became an image, compatibility was per-package semver: an
extension declared a range against a package and npm resolution enforced it.
With ten public packages and a `ghcr.io/voyant-travel/operator@sha256:…`
runtime, three candidates present themselves, and all three are worse than what
we have:

- **The image tag or digest** is the least stable identifier in the system.
  Every Platform build mints a new one, and it says nothing about whether an
  app still works.
- **The Framework version** moves every release. A publisher has no way to know
  which Framework releases changed anything they touch, so exposing it as the
  public axis makes every release look potentially breaking. It is a legitimate
  internal record — the release provenance binds it — and it must stay one.
- **A single new extension protocol version** collapses surfaces that fail
  independently. The frame and the backend of one app break for different
  reasons at different times.

## The axes

| Axis | Versioned as | Owned by | Covers |
|---|---|---|---|
| `appApiVersion` | a date — `2026-07-01` | `@voyant-travel/app-manifest` | the `/v1/app/*` HTTP surface |
| `manifestSchemaVersion` | schema id | `@voyant-travel/app-manifest` | the manifest the publisher authored |
| `adminExtensionVersion` | integer major | `@voyant-travel/admin-extension-sdk` | the admin UI extension protocol |
| `eventSchemaVersion` | schema id | `@voyant-travel/graph-contracts` | webhook event contracts |
| `artifactFormatVersion` | schema id | the Marketplace | the release envelope |
| ~~`runtimeVersions`~~ | Framework semver | the build | **recorded, never gated** |

A release records all six. Five are checked. The Framework version is not: it is
provenance, and gating on it meant every runtime pin bump invalidated every
release admitted before it — which is exactly what happened to an app admitted
against `0.62.3` once the fleet moved past it.

### Why the app API is dated

Publishers consume `/v1/app/*` over HTTP and install no Voyant packages — the
one real third-party app's backend imports zero of them. A package range would
describe nothing they have. A date does, and it lets the runtime serve several
at once while an old one retires.

### Why the extension protocol is a major

The SDK carries a full semver because a manifest declares a *range* against it
(`"^1"`, `"1.x"`, `"1.2.3"`) which the host evaluates at render time. Between a
release and a runtime the question is coarser — has the protocol broken? — so
the axis is the major, derived from the SDK constant rather than restated.

## Two surfaces, two axes

An app is not one thing. The distinction is not academic; it is what the axes
follow:

| Surface | Depends on | Declares against |
|---|---|---|
| Framed admin page | `admin-extension-sdk`, `ui`, protocol messages | `adminExtensionVersion` |
| Publisher backend | `/v1/app/*`, webhook wire format, OAuth ceremony | `appApiVersion`, `eventSchemaVersion` |

Only the first is a package relationship. The second never was, which is why
relocating "the npm range" was the wrong question to start from.

## Where incompatibility surfaces

**At Marketplace admission**, against a release pinned to `sourceRepository` and
`sourceRevision` — not at install time, and not at render time. Managed
instances update fleet-wide and automatically, so an app must not be able to
hold an operator's runtime back, and the runtime must not silently drop an app
whose contracts did not change.

Render-time compatibility (`isUiExtensionCompatible`) remains as a fail-soft
backstop for a descriptor that reaches a host it cannot speak to. It is not the
gate.

## Adding or bumping an axis

1. Move the owning constant. Never write the version as a literal in a check.
2. `VOYANT_APP_CONTRACT_VERSIONS` picks it up; anything reading that object
   follows.
3. For a breaking bump, serve both versions until the old one retires, and say
   so in the release notes — a publisher cannot redeploy on your schedule.

Contract versions are defined in
`packages/app-manifest/src/contract-versions.ts`. Related:
[admin-ui-extensions.md](./admin-ui-extensions.md) for the protocol itself, and
[operator-image-distribution.md](./operator-image-distribution.md) for why the
image version is not one of these.
